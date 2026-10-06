import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { buildDemonstrationPdf } from "../../../../lib/signatures/vidaas";

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
    if (!doctor) return NextResponse.json({ error: "Apenas o médico responsável pode demonstrar a assinatura." }, { status: 401 });
    const { prescriptionId } = await request.json();
    if (typeof prescriptionId !== "string") return NextResponse.json({ error: "Receita não informada." }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { data: rawPrescription } = await (admin.from("prescriptions") as any)
      .select("id, clinic_id, patient_id, doctor_profile_id, content, created_at")
      .eq("id", prescriptionId).eq("clinic_id", doctor.clinic_id).eq("doctor_profile_id", doctor.id).maybeSingle();
    if (!rawPrescription) return NextResponse.json({ error: "Receita não encontrada para este médico." }, { status: 404 });
    const prescription = rawPrescription as { id: string; clinic_id: string; patient_id: string; content: Record<string, unknown> | null; created_at: string };
    const { data: patient } = await (admin.from("patients") as any).select("full_name, cpf").eq("id", prescription.patient_id).eq("clinic_id", doctor.clinic_id).maybeSingle();
    if (!patient) return NextResponse.json({ error: "Paciente da receita não encontrado." }, { status: 404 });

    const content = prescription.content ?? {};
    const formulas = Array.isArray(content.formulas)
      ? content.formulas.filter((item): item is { name: string; percentage: number } => Boolean(item) && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" && typeof (item as { percentage?: unknown }).percentage === "number")
      : [];
    const pdf = await buildDemonstrationPdf({
      id: prescription.id, createdAt: prescription.created_at,
      doctor: typeof content.doctor === "string" ? content.doctor : doctor.full_name,
      doctorCrm: typeof content.doctorCrm === "string" ? content.doctorCrm : String(doctor.crm ?? ""),
      patientName: patient.full_name, patientCpf: patient.cpf,
      treatment: typeof content.treatment === "string" ? content.treatment : "Tratamento não informado",
      phase: typeof content.phase === "string" ? content.phase : undefined,
      bottles: typeof content.bottles === "number" ? content.bottles : 1,
      drops: typeof content.drops === "number" ? content.drops : 0,
      frequency: typeof content.frequency === "string" ? content.frequency : "Conforme prescrição",
      posology: typeof content.posology === "string" ? content.posology : "",
      notes: typeof content.notes === "string" ? content.notes : undefined,
      formulas,
    });
    const state = randomBytes(32).toString("base64url");
    const bucket = admin.storage.from("prescription-signatures");
    await admin.storage.createBucket("prescription-signatures", { public: false, fileSizeLimit: "10MB" }).catch(() => undefined);
    const path = `${doctor.clinic_id}/${prescription.id}/${state}/demonstracao-sem-validade.pdf`;
    const { error: uploadError } = await bucket.upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    const now = new Date().toISOString();
    const { error: signatureError } = await (admin.from("prescription_digital_signatures") as any).upsert({
      clinic_id: doctor.clinic_id, prescription_id: prescription.id, doctor_profile_id: doctor.id,
      provider: "demo", status: "signed", authorization_state: state, pkce_verifier: "demo-no-private-key",
      unsigned_pdf_path: path, signed_pdf_path: path, document_sha256: createHash("sha256").update(pdf).digest("hex"),
      certificate_alias: "Demonstração CRA Care — sem validade jurídica", signed_at: now,
      expires_at: now, updated_at: now,
    }, { onConflict: "prescription_id" });
    if (signatureError) throw signatureError;
    await admin.from("prescriptions").update({ signature_status: "demo" }).eq("id", prescription.id);
    return NextResponse.json({ message: "Demonstração concluída. O PDF está marcado como sem validade jurídica." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível gerar a demonstração." }, { status: 400 });
  }
}
