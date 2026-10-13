import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";

const require = createRequire(import.meta.url);
const { SignPdf } = require("@signpdf/signpdf");
const { pdflibAddPlaceholder } = require("@signpdf/placeholder-pdf-lib");
const { P12Signer } = require("@signpdf/signer-p12");
const forge = require("node-forge");

const BRAND = "Hippi Assinador A1";
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_JSON_BYTES = Math.ceil((MAX_PDF_BYTES * 4) / 3) + 16 * 1024;

function responseJson(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  response.end(body);
}

function requestJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        request.destroy();
        reject(new Error("A receita excede o tamanho máximo permitido."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Solicitação inválida."));
      }
    });
    request.on("error", reject);
  });
}

async function signPdf(pdfBytes, p12, passphrase) {
  if (!Buffer.isBuffer(pdfBytes) || !pdfBytes.length || pdfBytes.length > MAX_PDF_BYTES) {
    throw new Error("PDF inválido ou muito grande.");
  }
  if (pdfBytes.subarray(0, 4).toString() !== "%PDF") {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }
  const prepared = pdfBytes.includes(Buffer.from("/ByteRange [")) ? pdfBytes : await addSignaturePlaceholder(pdfBytes);
  return new SignPdf().sign(prepared, new P12Signer(p12, { passphrase }));
}

async function addSignaturePlaceholder(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdflibAddPlaceholder({ pdfDoc, reason: "Assinatura digital CRA Care", contactInfo: "CRA Care", name: BRAND, location: "Curitiba - PR", signatureLength: 16000 });
  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

function publicCertificateFromP12(p12, passphrase) {
  const parsed = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12.toString("binary")), passphrase);
  const bags = parsed.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const certificateBag = bags.find((bag) => bag.cert && bag.cert.publicKey);
  if (!certificateBag?.cert) throw new Error("Não foi possível identificar o certificado público do A1.");
  const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certificateBag.cert)).getBytes(), "binary");
  return der.toString("base64");
}

export async function validateCertificate(certificatePath, password) {
  const p12 = await readFile(certificatePath);
  const blank = await PDFDocument.create();
  const blankPdf = Buffer.from(await blank.save({ useObjectStreams: false }));
  await signPdf(blankPdf, p12, password);
  return p12;
}

export async function startSigningService({ certificatePath, password, origins, onExpired }) {
  let p12 = await validateCertificate(certificatePath, password);
  let passphrase = password;
  const pairingToken = randomBytes(24).toString("base64url");
  const certificateDerBase64 = publicCertificateFromP12(p12, passphrase);
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  const allowedOrigins = new Set(origins);
  const cors = (origin) => ({
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Hippi-Connector-Token",
    Vary: "Origin",
    ...(origin && allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  });

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    const headers = cors(origin);
    if (request.method === "OPTIONS") {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    if (origin && !allowedOrigins.has(origin)) {
      responseJson(response, 403, { error: "Origem não autorizada para o Hippi Assinador A1." }, headers);
      return;
    }
    if (Date.now() > expiresAt) {
      responseJson(response, 401, { error: "A sessão do certificado expirou. Abra o Hippi Assinador A1 novamente." }, headers);
      onExpired?.();
      return;
    }
    if (request.url === "/health" && request.method === "GET") {
      responseJson(response, 200, { name: BRAND, ready: true, expiresAt: new Date(expiresAt).toISOString() }, headers);
      return;
    }
    if (request.url === "/certificate" && request.method === "GET") {
      if (request.headers["x-hippi-connector-token"] !== pairingToken) {
        responseJson(response, 401, { error: "Código de pareamento inválido." }, headers);
        return;
      }
      responseJson(response, 200, { certificateDerBase64, expiresAt: new Date(expiresAt).toISOString() }, headers);
      return;
    }
    if (request.url === "/sign" && request.method === "POST") {
      if (request.headers["x-hippi-connector-token"] !== pairingToken) {
        responseJson(response, 401, { error: "Código de pareamento inválido." }, headers);
        return;
      }
      try {
        const payload = await requestJson(request);
        const source = typeof payload?.pdfBase64 === "string" ? Buffer.from(payload.pdfBase64, "base64") : null;
        const signedPdf = await signPdf(source, p12, passphrase);
        responseJson(response, 200, { signedPdfBase64: signedPdf.toString("base64"), expiresAt: new Date(expiresAt).toISOString() }, headers);
      } catch (error) {
        responseJson(response, 400, { error: error instanceof Error ? error.message : "Não foi possível assinar o PDF." }, headers);
      }
      return;
    }
    responseJson(response, 404, { error: "Rota não encontrada." }, headers);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(43127, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  let stopped = false;
  return {
    pairingToken,
    expiresAt,
    endpoint: "http://127.0.0.1:43127",
    async stop() {
      if (stopped) return;
      stopped = true;
      passphrase = "";
      p12.fill(0);
      p12 = Buffer.alloc(0);
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
