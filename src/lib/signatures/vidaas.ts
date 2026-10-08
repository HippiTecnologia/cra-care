import { createHash, randomBytes } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { clinicContact, sublingualUseInstructions } from "../clinic-info";

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
  const burgundy = rgb(0.64, 0.07, 0.23);
  const ink = rgb(0.20, 0.16, 0.18);
  const muted = rgb(0.40, 0.35, 0.37);
  const border = rgb(0.92, 0.87, 0.85);
  const pageWidth = page.getWidth();
  const left = 48;
  const right = pageWidth - 48;
  const contentWidth = right - left;

  try {
    const logoBytes = await readFile(path.join(process.cwd(), "public", "logo-cra.png"));
    const logo = await document.embedPng(logoBytes);
    page.drawImage(logo, { x: right - 55, y: 760, width: 55, height: 55 });
  } catch {
    // O conteúdo clínico continua disponível caso o logo não esteja presente no ambiente de execução.
  }

  page.drawText("Receita médica", { x: left, y: 790, size: 14, font: bold, color: ink });
  page.drawText("CRA Care · Centro de Rinite e Alergia", { x: left, y: 774, size: 8.5, font: regular, color: burgundy });
  page.drawText(`${clinicContact.address} · ${clinicContact.phone}`, { x: left, y: 760, size: 7.5, font: regular, color: muted, maxWidth: contentWidth - 70 });
  page.drawText(clinicContact.email, { x: left, y: 750, size: 7.5, font: regular, color: muted, maxWidth: contentWidth - 70 });
  page.drawLine({ start: { x: left, y: 748 }, end: { x: right, y: 748 }, thickness: 2.2, color: burgundy });

  const inlineField = (x: number, y: number, heading: string, value: string, maxWidth = 210) => {
    const prefix = `${heading}: `;
    page.drawText(prefix, { x, y, size: 8.3, font: bold, color: ink });
    page.drawText(value, { x: x + bold.widthOfTextAtSize(prefix, 8.3), y, size: 8.3, font: regular, color: ink, maxWidth });
  };
  inlineField(left, 723, "Paciente", prescription.patientName);
  inlineField(319, 723, "CPF", formatCpf(prescription.patientCpf), 120);
  inlineField(left, 705, "Atendimento", formatDate(prescription.createdAt));
  inlineField(319, 705, "Médico", prescription.doctor, 205);
  page.drawLine({ start: { x: left, y: 682 }, end: { x: right, y: 682 }, thickness: 0.6, color: ink });
  page.drawLine({ start: { x: left, y: 657 }, end: { x: right, y: 657 }, thickness: 0.6, color: ink });
  const recipeTitle = "R E C E I T A";
  page.drawText(recipeTitle, { x: (pageWidth - bold.widthOfTextAtSize(recipeTitle, 9)) / 2, y: 665, size: 9, font: bold, color: ink });

  page.drawText(prescription.treatment.toUpperCase(), { x: left, y: 628, size: 9.5, font: bold, color: burgundy });
  page.drawText(`Frascos: ${prescription.bottles}`, { x: left, y: 610, size: 8.6, font: bold, color: ink });
  if (prescription.phase) page.drawText(`Fase: ${prescription.phase}`, { x: left, y: 593, size: 8.6, font: bold, color: ink });

  let y = prescription.phase ? 562 : 578;
  const section = (title: string) => {
    page.drawText(title, { x: left, y, size: 12, font: bold, color: burgundy });
    y -= 12;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: border });
    y -= 17;
  };
  section("Composição");
  page.drawRectangle({ x: left, y: y - 20, width: contentWidth, height: 20, color: rgb(0.96, 0.90, 0.91) });
  page.drawText("COMPONENTE", { x: left + 10, y: y - 13, size: 8, font: bold, color: muted });
  page.drawText("%", { x: right - 26, y: y - 13, size: 8, font: bold, color: muted });
  y -= 20;
  const formulas = prescription.formulas.length ? prescription.formulas : [{ name: "Composição não informada", percentage: 0 }];
  for (const formula of formulas) {
    const rowHeight = 22;
    page.drawLine({ start: { x: left, y: y - rowHeight }, end: { x: right, y: y - rowHeight }, thickness: 0.45, color: border });
    page.drawText(formula.name, { x: left + 10, y: y - 14, size: 9.3, font: regular, color: ink, maxWidth: contentWidth - 70 });
    page.drawText(`${formula.percentage}%`, { x: right - 30, y: y - 14, size: 9.3, font: bold, color: burgundy });
    y -= rowHeight;
  }
  y -= 23;
  section("Posologia");
  const completePosology = `${prescription.posology || "Conforme orientação médica."}${prescription.posology?.includes(sublingualUseInstructions) ? "" : ` ${sublingualUseInstructions}`}`;
  for (const value of wrap(completePosology, 88)) {
    page.drawText(value, { x: left, y, size: 10, font: regular, color: ink, maxWidth: contentWidth });
    y -= 15;
  }
  if (prescription.notes) {
    y -= 10;
    section("Observações");
    for (const value of wrap(prescription.notes, 88)) {
      page.drawText(value, { x: left, y, size: 10, font: regular, color: ink, maxWidth: contentWidth });
      y -= 15;
    }
  }

  const signatureY = Math.max(155, Math.min(y - 38, 205));
  page.drawLine({ start: { x: 185, y: signatureY }, end: { x: 410, y: signatureY }, thickness: 0.8, color: ink });
  const doctorWidth = bold.widthOfTextAtSize(prescription.doctor, 10);
  page.drawText(prescription.doctor, { x: (pageWidth - doctorWidth) / 2, y: signatureY - 15, size: 10, font: bold, color: ink });
  const crm = prescription.doctorCrm ? `CRM PR ${prescription.doctorCrm}` : "Responsável técnico";
  const crmWidth = regular.widthOfTextAtSize(crm, 9);
  page.drawText(crm, { x: (pageWidth - crmWidth) / 2, y: signatureY - 28, size: 9, font: regular, color: muted });
  const state = "Documento preparado para assinatura digital";
  const stateWidth = regular.widthOfTextAtSize(state, 8);
  page.drawText(state, { x: (pageWidth - stateWidth) / 2, y: signatureY - 41, size: 8, font: regular, color: muted });
  page.drawText("Documento gerado pelo CRA Care.", { x: left, y: 91, size: 8, font: regular, color: muted });
  return document.save();
}

/**
 * Gera somente uma prova visual do fluxo de assinatura. Este PDF não recebe
 * uma assinatura criptográfica e, portanto, não possui validade jurídica.
 */
export async function buildDemonstrationPdf(prescription: PrescriptionForSignature) {
  const bytes = await buildPrescriptionPdf(prescription);
  const document = await PDFDocument.load(bytes);
  const page = document.getPages()[0];
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  page.drawText("ASSINATURA DEMONSTRATIVA — SEM VALIDADE JURÍDICA", {
    x: 58,
    y: 32,
    size: 8,
    font,
    color: rgb(0.65, 0.08, 0.18),
    maxWidth: width - 116,
  });
  return document.save();
}
