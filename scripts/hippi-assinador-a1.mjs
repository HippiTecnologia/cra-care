import { createRequire } from "node:module";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";

const require = createRequire(import.meta.url);
const { SignPdf } = require("@signpdf/signpdf");
const { pdflibAddPlaceholder } = require("@signpdf/placeholder-pdf-lib");
const { P12Signer } = require("@signpdf/signer-p12");

const BRAND = "Hippi Assinador A1";
const DEFAULT_PORT = 43127;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

function ask(question) {
  return new Promise((resolve) => {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    prompt.question(question, (answer) => { prompt.close(); resolve(answer.trim()); });
  });
}

function askHidden(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") return ask(question);
  return new Promise((resolve) => {
    process.stdout.write(question);
    let answer = "";
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") process.exit(130);
        if (character === "\r" || character === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(answer);
          return;
        }
        if (character === "\u007f") answer = answer.slice(0, -1);
        else answer += character;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

function json(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  response.end(body);
}

function allowedOrigins() {
  return new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.HIPPI_A1_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean),
  ]);
}

function corsHeaders(origin) {
  const headers = { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Hippi-Connector-Token", "Vary": "Origin" };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_PDF_BYTES * 1.5) {
        request.destroy();
        reject(new Error("A receita excede o tamanho máximo permitido."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("Solicitação inválida.")); }
    });
    request.on("error", reject);
  });
}

async function signPdf(pdfBytes, p12, passphrase) {
  if (!Buffer.isBuffer(pdfBytes) || pdfBytes.length === 0 || pdfBytes.length > MAX_PDF_BYTES) throw new Error("PDF inválido ou muito grande.");
  if (pdfBytes.subarray(0, 4).toString() !== "%PDF") throw new Error("O arquivo enviado não é um PDF válido.");
  const pdfDocument = await PDFDocument.load(pdfBytes);
  pdflibAddPlaceholder({
    pdfDoc: pdfDocument,
    reason: "Assinatura digital CRA Care",
    contactInfo: "CRA Care",
    name: BRAND,
    location: "Curitiba - PR",
    signatureLength: 16000,
  });
  const preparedPdf = Buffer.from(await pdfDocument.save({ useObjectStreams: false }));
  return new SignPdf().sign(preparedPdf, new P12Signer(p12, { passphrase }));
}

const [certificateArgument] = process.argv.slice(2);
if (!certificateArgument) {
  console.error(`Uso: npm run hippi:a1 -- "C:\\caminho\\certificado.p12"`);
  process.exit(2);
}

const certificatePath = path.resolve(certificateArgument);
const port = Number(process.env.HIPPI_A1_PORT ?? DEFAULT_PORT);
const sessionToken = randomBytes(24).toString("base64url");
const sessionExpiresAt = Date.now() + SESSION_DURATION_MS;

let p12;
let passphrase;
try {
  p12 = await readFile(certificatePath);
  passphrase = await askHidden(`${BRAND}\nSenha do certificado A1 (fica somente nesta sessão): `);
  // Sign a temporary in-memory PDF so an incorrect password fails before the server starts.
  const testPdfDocument = await PDFDocument.create();
  const testPdf = Buffer.from(await testPdfDocument.save({ useObjectStreams: false }));
  await signPdf(testPdf, p12, passphrase);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Não foi possível abrir o certificado A1.");
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  const headers = corsHeaders(origin);
  if (request.method === "OPTIONS") { response.writeHead(204, headers); response.end(); return; }
  if (origin && !allowedOrigins().has(origin)) { json(response, 403, { error: "Origem não autorizada para o Hippi Assinador A1." }, headers); return; }
  if (Date.now() > sessionExpiresAt) { json(response, 401, { error: "A sessão do certificado expirou. Reinicie o Hippi Assinador A1." }, headers); return; }
  if (request.url === "/health" && request.method === "GET") {
    json(response, 200, { name: BRAND, ready: true, expiresAt: new Date(sessionExpiresAt).toISOString() }, headers);
    return;
  }
  if (request.url === "/sign" && request.method === "POST") {
    if (request.headers["x-hippi-connector-token"] !== sessionToken) { json(response, 401, { error: "Código de pareamento inválido." }, headers); return; }
    try {
      const body = await readJson(request);
      const encoded = typeof body?.pdfBase64 === "string" ? body.pdfBase64 : "";
      const pdfBytes = Buffer.from(encoded, "base64");
      const signedPdf = await signPdf(pdfBytes, p12, passphrase);
      json(response, 200, { name: BRAND, signedPdfBase64: signedPdf.toString("base64"), expiresAt: new Date(sessionExpiresAt).toISOString() }, headers);
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : "Não foi possível assinar o PDF." }, headers);
    }
    return;
  }
  json(response, 404, { error: "Rota não encontrada." }, headers);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`${BRAND} ativo em http://127.0.0.1:${port}`);
  console.log(`Código de pareamento: ${sessionToken}`);
  console.log(`Sessão válida até: ${new Date(sessionExpiresAt).toLocaleString("pt-BR")}`);
});

function stop() {
  p12.fill(0);
  server.close(() => process.exit(0));
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
