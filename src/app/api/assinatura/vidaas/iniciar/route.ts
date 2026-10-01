import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { buildPrescriptionPdf, createPkce, getVidaasConfig, vidaasAuthorizationUrl } from "../../../../../lib/signatures/vidaas";

export const runtime = "nodejs";

async function currentDoctor(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getSupabaseAdminClient();
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return null;
  const { data: profile } = await admin.from("profiles").select("id, clinic_id, role, full_name, crm").eq("id", auth.user.id).maybeSingle();
  return profile?.role === "medico" && profile.clinic_id ? profile : null;
}

export async function POST(request: NextRequest) {
  try {
    const doctor = await currentDoctor(request);
    if (!doctor) return NextResponse.json({ error: "Apenas o médico responsável pode assinar esta receita." }, { status: 401 });
    const config = getVidaasConfig();
    if (config.doctorCrm && config.doctorCrm !== String(doctor.crm ?? "")) {
      return NextResponse.json({ error: "O VIDaaS ainda está configurado somente para outro médico." }, { status: 403 });
    }
    const { prescriptionId } = await request.json();
    if (typeof prescriptionId !== "string") return NextResponse.json({ error: "Receita não informada." }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { data: rawPrescription } = await (admin.from("prescriptions") as any).select("id, clinic_id, patient_id, doctor_profile_id, content, signature_status, created_at").eq("id", prescriptionId).eq("clinic_id", doctor.clinic_id).eq("doctor_profile_id", doctor.id).maybeSingle();
    const prescription = rawPrescription as { id: string; clinic_id: string; patient_id: string; doctor_profile_id: string; content: unknown; signature_status: string; created_at: string } | null;
    if (!prescription) return NextResponse.json({ error: "Receita não encontrada para este médico." }, { status: 404 });
    if (prescription.signature_status === "signed") return NextResponse.json({ error: "Esta receita já possui assinatura digital." }, { status: 409 });

    const { data: rawPatient } = await (admin.from("patients") as any).select("full_name, cpf").eq("id", prescription.patient_id).eq("clinic_id", doctor.clinic_id).maybeSingle();
    const patient = rawPatient as { full_name: string; cpf: string } | null;
    if (!patient) return NextResponse.json({ error: "Paciente da receita não encontrado." }, { status: 404 });
    const content = (prescription.content ?? {}) as Record<string, unknown>;
    const formulas = Array.isArray(content.formulas) ? content.formulas.filter((item): item is { name: string; percentage: number } => Boolean(item) && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" && typeof (item as { percentage?: unknown }).percentage === "number") : [];
    const pdf = await buildPrescriptionPdf({
      id: prescription.id,
      createdAt: prescription.created_at,
      doctor: typeof content.doctor === "string" ? content.doctor : doctor.full_name,
      doctorCrm: typeof content.doctorCrm === "string" ? content.doctorCrm : String(doctor.crm ?? ""),
      patientName: patient.full_name,
      patientCpf: patient.cpf,
      treatment: typeof content.treatment === "string" ? content.treatment : "Tratamento não informado",
      phase: typeof content.phase === "string" ? content.phase : undefined,
      bottles: typeof content.bottles === "number" ? content.bottles : 1,
      drops: typeof content.drops === "number" ? content.drops : 0,
      frequency: typeof content.frequency === "string" ? content.frequency : "Conforme prescrição",
      posology: typeof content.posology === "string" ? content.posology : "",
      notes: typeof content.notes === "string" ? content.notes : undefined,
      formulas,
    });
    const sha256 = createHash("sha256").update(pdf).digest("hex");
    const pkce = createPkce();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const bucket = admin.storage.from("prescription-signatures");
    await admin.storage.createBucket("prescription-signatures", { public: false, fileSizeLimit: "10MB" }).catch(() => undefined);
    const unsignedPath = `${doctor.clinic_id}/${prescription.id}/${pkce.state}/original.pdf`;
    const { error: uploadError } = await bucket.upload(unsignedPath, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    const { error: signatureError } = await (admin.from("prescription_digital_signatures") as any).upsert({
      clinic_id: doctor.clinic_id,
      prescription_id: prescription.id,
      doctor_profile_id: doctor.id,
      provider: "vidaas",
      status: "awaiting_authorization",
      authorization_state: pkce.state,
      pkce_verifier: pkce.verifier,
      unsigned_pdf_path: unsignedPath,
      document_sha256: sha256,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "prescription_id" });
    if (signatureError) throw signatureError;
    return NextResponse.json({ authorizationUrl: vidaasAuthorizationUrl(config, pkce), expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a assinatura VIDaaS.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
