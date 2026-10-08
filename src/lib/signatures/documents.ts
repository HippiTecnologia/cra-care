/* eslint-disable @typescript-eslint/no-explicit-any */
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getSupabaseAdminClient } from "../supabase/admin";
import { buildPrescriptionPdf, type PrescriptionForSignature } from "./vidaas";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function loadPrescriptionDocument(clinicId: string, documentId: string) {
  const admin = getSupabaseAdminClient();
  const { data: rawPrescription } = await (admin.from("prescriptions") as any)
    .select("id, clinic_id, patient_id, doctor_profile_id, content, created_at")
    .eq("id", documentId).eq("clinic_id", clinicId).maybeSingle();
  if (!rawPrescription) throw new Error("Documento não encontrado nesta clínica.");
  const prescription = rawPrescription as { id: string; patient_id: string; doctor_profile_id: string; content: unknown; created_at: string };
  const [{ data: rawPatient }, { data: rawDoctor }] = await Promise.all([
    (admin.from("patients") as any).select("id, full_name, cpf").eq("id", prescription.patient_id).eq("clinic_id", clinicId).maybeSingle(),
    admin.from("profiles").select("id, full_name, crm").eq("id", prescription.doctor_profile_id).eq("clinic_id", clinicId).maybeSingle(),
  ]);
  if (!rawPatient || !rawDoctor) throw new Error("Paciente ou médico do documento não encontrado.");
  const content = record(prescription.content);
  const formulas = Array.isArray(content.formulas)
    ? content.formulas.filter((item): item is { name: string; percentage: number } => Boolean(item) && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" && typeof (item as { percentage?: unknown }).percentage === "number")
    : [];
  const document: PrescriptionForSignature = {
    id: prescription.id,
    createdAt: prescription.created_at,
    doctor: typeof content.doctor === "string" ? content.doctor : rawDoctor.full_name,
    doctorCrm: typeof content.doctorCrm === "string" ? content.doctorCrm : String(rawDoctor.crm ?? ""),
    patientName: rawPatient.full_name,
    patientCpf: rawPatient.cpf,
    treatment: typeof content.treatment === "string" ? content.treatment : "Tratamento não informado",
    phase: typeof content.phase === "string" ? content.phase : undefined,
    bottles: typeof content.bottles === "number" ? content.bottles : 1,
    drops: typeof content.drops === "number" ? content.drops : 0,
    frequency: typeof content.frequency === "string" ? content.frequency : "Conforme prescrição",
    posology: typeof content.posology === "string" ? content.posology : "",
    notes: typeof content.notes === "string" ? content.notes : undefined,
    formulas,
  };
  return { document, patientId: rawPatient.id as string, signerId: rawDoctor.id as string };
}

export async function buildVerifiablePrescriptionPdf(document: PrescriptionForSignature, validationCode: string) {
  const base = await buildPrescriptionPdf(document);
  const pdf = await PDFDocument.load(base);
  const page = pdf.getPages()[0];
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://cra-care.vercel.app").replace(/\/$/, "");
  const validationUrl = `${appUrl}/validar-documento/${encodeURIComponent(validationCode)}`;
  const qrDataUrl = await QRCode.toDataURL(validationUrl, { errorCorrectionLevel: "M", margin: 1, width: 220 });
  const qr = await pdf.embedPng(Buffer.from(qrDataUrl.split(",")[1], "base64"));
  page.drawRectangle({ x: 42, y: 18, width: 511, height: 58, color: rgb(0.97, 0.98, 1), borderColor: rgb(0.16, 0.25, 0.45), borderWidth: 0.5 });
  page.drawImage(qr, { x: 49, y: 23, width: 48, height: 48 });
  page.drawText("VALIDAÇÃO DE ASSINATURA DIGITAL", { x: 107, y: 55, size: 8, font: bold, color: rgb(0.16, 0.25, 0.45) });
  page.drawText(`Código de validação: ${validationCode}`, { x: 107, y: 41, size: 7.5, font: regular });
  page.drawText("Leia o QR Code ou consulte a página de validação do CRA Care.", { x: 107, y: 28, size: 7, font: regular });
  return pdf.save();
}
