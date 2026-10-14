import { createHash } from "crypto";
import { fromBER } from "asn1js";
import { Certificate, CertificateChainValidationEngine, CertificateRevocationList, ContentInfo, SignedData } from "pkijs";
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

type ParsedSignature = {
  signedData: SignedData;
  signedBytes: Buffer;
  signerCertificate: Certificate;
};

export type IcpBrasilValidation = VerifiedA1Signature & {
  chainCertificates: number;
  crlUrls: string[];
};

function parsePdfSignature(prepared: Buffer, signed: Buffer): ParsedSignature {
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
  return { signedData, signedBytes, signerCertificate: new Certificate() };
}

function certificateDetails(certificate: Certificate): VerifiedA1Signature {
  const der = Buffer.from(certificate.toSchema().toBER(false));
  const attributes = (name: typeof certificate.subject) => name.typesAndValues.map((item) => `${item.type}=${item.value.valueBlock.value}`).join(", ");
  return {
    certificateFingerprint: createHash("sha256").update(der).digest("hex"),
    certificateSerial: Buffer.from(certificate.serialNumber.valueBlock.valueHexView).toString("hex").toUpperCase(),
    certificateSubject: attributes(certificate.subject),
    certificateIssuer: attributes(certificate.issuer),
  };
}

async function verifyCmsSignature(parsed: ParsedSignature) {
  const verification = await parsed.signedData.verify({ signer: 0, data: toArrayBuffer(parsed.signedBytes), checkChain: false, extendedMode: true });
  if (!verification.signatureVerified || !verification.signerCertificate) throw new Error("A assinatura criptográfica não pôde ser validada.");
  const certificate = verification.signerCertificate;
  const now = Date.now();
  if (certificate.notBefore.value.getTime() > now || certificate.notAfter.value.getTime() < now) throw new Error("O certificado usado está fora do prazo de validade.");
  parsed.signerCertificate = certificate;
  return certificate;
}

function certificateFromPem(pem: string) {
  const base64 = pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, "");
  const asn1 = fromBER(toArrayBuffer(Buffer.from(base64, "base64")));
  if (asn1.offset === -1) throw new Error("A cadeia ICP-Brasil configurada contém um certificado inválido.");
  return new Certificate({ schema: asn1.result });
}

function trustedIcpRoots() {
  const pem = process.env.ICP_BRASIL_TRUSTED_ROOTS_PEM?.replace(/\\n/g, "\n").trim();
  if (!pem) throw new Error("A cadeia de confiança ICP-Brasil ainda não foi configurada no servidor.");
  const entries = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (!entries.length) throw new Error("A cadeia de confiança ICP-Brasil configurada está vazia.");
  return entries.map(certificateFromPem);
}

function certificatesFromCms(signedData: SignedData) {
  const certificates = (signedData.certificates ?? []).filter((item): item is Certificate => item instanceof Certificate);
  if (!certificates.length) throw new Error("A assinatura não trouxe a cadeia de certificados necessária para validação.");
  return certificates;
}

type CrlDistributionPoint = {
  distributionPoint?: { value?: Array<{ type?: number; value?: unknown }> };
};

function crlUrls(certificate: Certificate): string[] {
  const extension = certificate.extensions?.find((item) => item.extnID === "2.5.29.31");
  const points = (extension?.parsedValue as { distributionPoints?: CrlDistributionPoint[] } | undefined)?.distributionPoints ?? [];
  const urls = points.flatMap((point) => point.distributionPoint?.value ?? [])
    .filter((name): name is { type: number; value: string } => name.type === 6 && typeof name.value === "string")
    .map((name) => name.value);
  return [...new Set<string>(urls)];
}

function permittedCrlUrl(value: string) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) throw new Error("URL de revogação inválida no certificado.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    throw new Error("URL de revogação não permitida no certificado.");
  }
  return url.toString();
}

async function fetchCrl(url: string) {
  const response = await fetch(permittedCrlUrl(url), { redirect: "error", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Não foi possível consultar a lista de revogação (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("A lista de revogação recebida é inválida.");
  const asn1 = fromBER(toArrayBuffer(bytes));
  if (asn1.offset === -1) throw new Error("A lista de revogação recebida não é válida.");
  const crl = new CertificateRevocationList({ schema: asn1.result });
  const nextUpdate = crl.nextUpdate?.value?.getTime();
  if (nextUpdate && nextUpdate < Date.now()) throw new Error("A lista de revogação está vencida.");
  return crl;
}

export async function verifyPreparedA1Signature(prepared: Buffer, signed: Buffer): Promise<VerifiedA1Signature> {
  const parsed = parsePdfSignature(prepared, signed);
  return certificateDetails(await verifyCmsSignature(parsed));
}

/**
 * Validates a PDF/CMS signature against the configured ICP-Brasil trust anchors
 * and current CRLs. This is intentionally fail-closed: a document is never
 * considered authentic when chain or revocation information is unavailable.
 */
export async function validatePreparedA1SignatureAgainstIcpBrasil(prepared: Buffer, signed: Buffer): Promise<IcpBrasilValidation> {
  const parsed = parsePdfSignature(prepared, signed);
  const signerCertificate = await verifyCmsSignature(parsed);
  const trustedRoots = trustedIcpRoots();
  const cmsCertificates = certificatesFromCms(parsed.signedData);
  const certificates = [...cmsCertificates, ...trustedRoots];
  const checkDate = new Date();
  const preliminary = new CertificateChainValidationEngine({ trustedCerts: trustedRoots, certs: certificates, checkDate });
  const preliminaryResult = await preliminary.verify({ passedWhenNotRevValues: true });
  if (!preliminaryResult.result || !preliminaryResult.certificatePath?.length) {
    throw new Error(`A cadeia do certificado não pertence à ICP-Brasil: ${preliminaryResult.resultMessage}`);
  }
  const chain = preliminaryResult.certificatePath;
  const certificatesToCheck = chain.filter((certificate) => !trustedRoots.some((root) => Buffer.from(root.toSchema().toBER(false)).equals(Buffer.from(certificate.toSchema().toBER(false)))));
  const urls = [...new Set<string>(certificatesToCheck.flatMap((certificate): string[] => crlUrls(certificate)))];
  if (urls.length < certificatesToCheck.length) throw new Error("Não foi encontrada lista de revogação para todos os certificados da cadeia.");
  const crls = await Promise.all(urls.map(fetchCrl));
  const finalCheck = new CertificateChainValidationEngine({ trustedCerts: trustedRoots, certs: certificates, crls, checkDate });
  const finalResult = await finalCheck.verify({ passedWhenNotRevValues: false });
  if (!finalResult.result) throw new Error(`A validação de revogação ICP-Brasil falhou: ${finalResult.resultMessage}`);
  return { ...certificateDetails(signerCertificate), chainCertificates: chain.length, crlUrls: urls };
}

export function certificateFingerprintFromDer(certificateDer: Buffer) {
  return createHash("sha256").update(certificateDer).digest("hex");
}
