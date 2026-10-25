/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser, isActiveSignaturePatient, requestMetadata } from "../../../../lib/signatures/auth";
import { writeSignatureAudit } from "../../../../lib/signatures/audit";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const admin = getSupabaseAdminClient();
  const { data: signature } = await (admin.from("digital_signatures") as any).select("*").eq("id", id).eq("clinic_id", user.clinicId).maybeSingle();
  if (!signature || (user.role === "medico" && signature.signer_user_id !== user.id) || !(await isActiveSignaturePatient(user.clinicId, String(signature.patient_id ?? "")))) return NextResponse.json({ error: "Assinatura não encontrada." }, { status: 404 });
  const { data: audit } = await (admin.from("signature_audit_logs") as any).select("id, event, status, provider, metadata, created_at").eq("signature_id", id).eq("clinic_id", user.clinicId).order("created_at", { ascending: true });
  return NextResponse.json({ signature, audit: audit ?? [] });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const admin = getSupabaseAdminClient();
  const { data: signature } = await (admin.from("digital_signatures") as any).select("*").eq("id", id).eq("clinic_id", user.clinicId).maybeSingle();
  if (!signature || (user.role === "medico" && signature.signer_user_id !== user.id) || !(await isActiveSignaturePatient(user.clinicId, String(signature.patient_id ?? "")))) return NextResponse.json({ error: "Assinatura não encontrada." }, { status: 404 });
  if (["signed", "cancelled"].includes(signature.status)) return NextResponse.json({ error: signature.status === "signed" ? "Documento assinado não pode ser cancelado." : "Esta solicitação já foi cancelada." }, { status: 409 });
  const certillion = signature.provider_data?.certillion;
  if (signature.provider === "a3" && (signature.status === "signing" || certillion?.transaction || certillion?.signatureSubmissionInFlight || certillion?.processingStartedAt)) return NextResponse.json({ error: "Uma assinatura já foi iniciada na Certillion. Retome a validação ou confirme a transação antes de cancelar." }, { status: 409 });
  const { data: cancelled, error: cancelError } = await (admin.from("digital_signatures") as any).update({ status: "cancelled", provider_state: null, provider_data: {}, updated_at: new Date().toISOString() }).eq("id", id).eq("clinic_id", user.clinicId).eq("updated_at", signature.updated_at).select("id").maybeSingle();
  if (cancelError || !cancelled) return NextResponse.json({ error: "A solicitação foi atualizada por outra tentativa. Atualize a lista antes de cancelar." }, { status: 409 });
  await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "signature_cancelled", status: "cancelled", actorId: user.id, provider: signature.provider, ...requestMetadata(request) });
  return NextResponse.json({ ok: true });
}
