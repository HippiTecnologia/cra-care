import { createHash, randomBytes } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type VidaasConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  doctorCrm?: string;
};

export type PrescriptionForSignature = {
  id: string;
  createdAt: string;
  doctor: string;
  doctorCrm: string;
  patientName: string;
  patientCpf: string;
  treatment: string;
  phase?: string;
  bottles: number;
  drops: number;
  frequency: string;
  posology: string;
  notes?: string;
  formulas: Array<{ name: string; percentage: number }>;
};

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`A integração VIDaaS ainda não foi configurada: ${name}.`);
  return value.trim();
}

export function getVidaasConfig(): VidaasConfig {
  return {
    baseUrl: (process.env.VIDAAS_BASE_URL ?? "https://certificado.vidaas.com.br").replace(/\/$/, ""),
    clientId: required(process.env.VIDAAS_CLIENT_ID, "VIDAAS_CLIENT_ID"),
    clientSecret: required(process.env.VIDAAS_CLIENT_SECRET, "VIDAAS_CLIENT_SECRET"),
    redirectUri: required(process.env.VIDAAS_REDIRECT_URI, "VIDAAS_REDIRECT_URI"),
    doctorCrm: process.env.VIDAAS_DOCTOR_CRM?.trim(),
  };
}

export function createPkce() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(32).toString("base64url") };
}

export function vidaasAuthorizationUrl(config: VidaasConfig, pkce: ReturnType<typeof createPkce>) {
  const url = new URL(`${config.baseUrl}/v0/oauth/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "single_signature");
  url.searchParams.set("lifetime", "900");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", pkce.state);
  return url.toString();
}

export async function exchangeVidaasCode(config: VidaasConfig, code: string, verifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });
  const response = await fetch(`${config.baseUrl}/v0/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(typeof payload.error_description === "string" ? payload.error_description : "O VIDaaS não autorizou a assinatura.");
  }
  return payload.access_token as string;
}

export async function signPdfWithVidaas(config: VidaasConfig, accessToken: string, pdf: Uint8Array, documentId: string) {
  const hash = createHash("sha256").update(pdf).digest("base64");
  const response = await fetch(`${config.baseUrl}/v0/oauth/signature`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      hashes: [{
        id: documentId,
        alias: `receita-${documentId}.pdf`,
        hash,
        hash_algorithm: "2.16.840.1.101.3.4.2.1",
        signature_format: "PAdES_AD_RT",
        pdf_signature_page: true,
        base64_content: Buffer.from(pdf).toString("base64"),
      }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "O VIDaaS não conseguiu assinar o PDF.");

  const signature = Array.isArray(payload.signatures) ? payload.signatures[0] : undefined;
  const encodedPdf = signature?.signed_content ?? signature?.base64_content ?? signature?.pades ?? signature?.signature ?? signature?.raw_signature;
  if (typeof encodedPdf !== "string") {
    throw new Error("O VIDaaS autorizou a sessão, mas não retornou o PDF assinado. Verifique o formato liberado para a credencial da aplicação.");
  }
  const signedPdf = Buffer.from(encodedPdf, "base64");
  if (signedPdf.subarray(0, 4).toString() !== "%PDF") {
    throw new Error("O VIDaaS retornou uma assinatura sem o PDF final. A credencial precisa habilitar retorno PAdES para PDF.");
  }
  return { signedPdf, certificateAlias: typeof payload.certificate_alias === "string" ? payload.certificate_alias : undefined };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : value;
}

function wrap(text: string, max = 88) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) { lines.push(line); line = word; }
    else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildPrescriptionPdf(prescription: PrescriptionForSignature) {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const burgundy = rgb(0.51, 0.06, 0.20);
  let y = 794;
  const line = (text: string, size = 10, font = regular, color = rgb(0.15, 0.12, 0.13)) => {
    page.drawText(text, { x: 48, y, size, font, color }); y -= size + 7;
  };
  line("CRA CARE", 20, bold, burgundy);
  line("CENTRO DE RINITE E ALERGIA", 8, bold, burgundy);
  y -= 14;
  line("RECEITA MÉDICA", 14, bold);
  line(`Emissão: ${formatDate(prescription.createdAt)}`, 10);
  line(`Paciente: ${prescription.patientName}`, 10, bold);
  line(`CPF: ${formatCpf(prescription.patientCpf)}`, 10);
  y -= 8;
  line(`Tratamento: ${prescription.treatment}`, 11, bold, burgundy);
  if (prescription.phase) line(`Fase: ${prescription.phase}`);
  line(`Frascos: ${prescription.bottles} · ${prescription.drops} gotas · ${prescription.frequency}`);
  y -= 8;
  line("Composição", 11, bold);
  for (const formula of prescription.formulas) line(`${formula.name} — ${formula.percentage}%`);
  y -= 8;
  line("Posologia", 11, bold);
  for (const value of wrap(prescription.posology || "Conforme orientação médica.")) line(value);
  if (prescription.notes) {
    y -= 8; line("Observações", 11, bold);
    for (const value of wrap(prescription.notes)) line(value);
  }
  y = Math.min(y - 54, 150);
  page.drawLine({ start: { x: 160, y }, end: { x: 435, y }, thickness: 0.8, color: rgb(0.25, 0.22, 0.23) });
  y -= 16;
  page.drawText(prescription.doctor, { x: 210, y, size: 10, font: bold });
  y -= 14;
  page.drawText(`CRM ${prescription.doctorCrm}`, { x: 265, y, size: 9, font: regular });
  return document.save();
}
