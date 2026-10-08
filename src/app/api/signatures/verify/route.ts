/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { allowSignatureRequest } from "../../../../lib/signatures/rate-limit";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "public";
  if (!allowSignatureRequest(`${ip}:verify`, 30)) return NextResponse.json({ error: "Muitas consultas. Aguarde um minuto." }, { status: 429 });
  if (!code || code.length < 16) return NextResponse.json({ error: "Código de validação inválido." }, { status: 400 });
  const admin = getSupabaseAdminClient();
  const { data: signature } = await (admin.from("digital_signatures") as any)
    .select("id, patient_id, document_name, signer_user_id, provider, certificate_type, provider_signature_id, document_hash, signed_document_hash, validation_code, status, signed_at, validated_at, validation_result")
    .eq("validation_code", code).maybeSingle();
  if (!signature) return NextResponse.json({ valid: false, status: "not_found" });
  const [{ data: signer }, { data: patient }] = await Promise.all([
    admin.from("profiles").select("full_name, crm").eq("id", signature.signer_user_id).maybeSingle(),
    (admin.from("patients") as any).select("full_name").eq("id", signature.patient_id).maybeSingle(),
  ]);
  const valid = signature.status === "signed" && Boolean(signature.validated_at) && signature.validation_result?.valid === true;
  return NextResponse.json({
    valid,
    status: signature.status,
    document: signature.document_name,
    patient: patient?.full_name ?? "—",
    signer: signer ? { name: signer.full_name, crm: signer.crm } : null,
    provider: signature.provider,
    certificateType: signature.certificate_type,
    signatureId: signature.provider_signature_id ?? signature.id,
    signedAt: signature.signed_at,
    validatedAt: signature.validated_at,
    fingerprint: signature.signed_document_hash ?? signature.document_hash,
  });
}
