import { createHash } from "crypto";
import { fromBER } from "asn1js";
import { ContentInfo, SignedData } from "pkijs";
import { PDFDocument } from "pdf-lib";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { pdflibAddPlaceholder } = require("@signpdf/placeholder-pdf-lib") as { pdflibAddPlaceholder: (input: Record<string, unknown>) => void };

function toArrayBuffer(value: Buffer) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function byteRange(pdf: Buffer) {
  const match = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(pdf.toString("latin1"));
  if (!match) throw new Error("PDF sem espaço de assinatura válido.");
  const values = match.slice(1).map(Number);
  const [startA, lengthA, startB, lengthB] = values;
  if (startA !== 0 || lengthA < 1 || startB <= lengthA || lengthB < 1 || startB + lengthB !== pdf.length) throw new Error("ByteRange inválido no PDF assinado.");
  return { startA, lengthA, startB, lengthB };
}

function sameRangeOutsideSignature(prepared: Buffer, signed: Buffer) {
  if (prepared.length !== signed.length) return false;
  const range = byteRange(signed);
  return prepared.subarray(0, range.lengthA).equals(signed.subarray(0, range.lengthA))
    && prepared.subarray(range.startB).equals(signed.subarray(range.startB));
}

export async function prepareA1Pdf(pdf: Buffer) {
  const document = await PDFDocument.load(pdf);
  pdflibAddPlaceholder({
    pdfDoc: document,
    reason: "Assinatura digital CRA Care",
    contactInfo: "CRA Care",
    name: "Hippi Assinador A1",
    location: "Curitiba - PR",
    signatureLength: 16000,
  });
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

export type VerifiedA1Signature = {
  certificateFingerprint: string;
  certificateSerial: string;
  certificateSubject: string;
  certificateIssuer: string;
};

export async function verifyPreparedA1Signature(prepared: Buffer, signed: Buffer): Promise<VerifiedA1Signature> {
  if (!sameRangeOutsideSignature(prepared, signed)) throw new Error("A assinatura não corresponde ao documento preparado pelo CRA Care.");
  const range = byteRange(signed);
  const contents = signed.subarray(range.lengthA, range.startB).toString("latin1");
  const contentsMatch = /<([0-9a-fA-F]+)>/.exec(contents);
  if (!contentsMatch) throw new Error("Conteúdo da assinatura não encontrado no PDF.");
  const cms = Buffer.from(contentsMatch[1].replace(/(?:00)+$/, ""), "hex");
  const asn1 = fromBER(toArrayBuffer(cms));
  if (asn1.offset === -1) throw new Error("Estrutura criptográfica da assinatura é inválida.");
  const contentInfo = new ContentInfo({ schema: asn1.result });
  if (!contentInfo.content) throw new Error("Assinatura CMS sem conteúdo.");
  const signedData = new SignedData({ schema: contentInfo.content });
  const signedBytes = Buffer.concat([signed.subarray(0, range.lengthA), signed.subarray(range.startB)]);
  const verification = await signedData.verify({ signer: 0, data: toArrayBuffer(signedBytes), checkChain: false, extendedMode: true });
  if (!verification.signatureVerified || !verification.signerCertificate) throw new Error("A assinatura criptográfica não pôde ser validada.");
  const certificate = verification.signerCertificate;
  const now = Date.now();
  if (certificate.notBefore.value.getTime() > now || certificate.notAfter.value.getTime() < now) throw new Error("O certificado usado está fora do prazo de validade.");
  const der = Buffer.from(certificate.toSchema().toBER(false));
  const attributes = (name: typeof certificate.subject) => name.typesAndValues.map((item) => `${item.type}=${item.value.valueBlock.value}`).join(", ");
  return {
    certificateFingerprint: createHash("sha256").update(der).digest("hex"),
    certificateSerial: Buffer.from(certificate.serialNumber.valueBlock.valueHexView).toString("hex").toUpperCase(),
    certificateSubject: attributes(certificate.subject),
    certificateIssuer: attributes(certificate.issuer),
  };
}

export function certificateFingerprintFromDer(certificateDer: Buffer) {
  return createHash("sha256").update(certificateDer).digest("hex");
}
