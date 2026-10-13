/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from "crypto";
import { X509Certificate } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser } from "../../../../../lib/signatures/auth";
import { certificateFingerprintFromDer } from "../../../../../lib/signatures/a1";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await context.params;
  try {
    const body = await request.json() as { signedPdfBase64?: string; certificateDerBase64?: string };
    if (!body.signedPdfBase64 || !body.certificateDerBase64) return NextResponse.json({ error: "PDF assinado e certificado são obrigatórios." }, { status: 400 });
    const signedPdf = Buffer.from(body.signedPdfBase64, "base64");
    const certificateDer = Buffer.from(body.certificateDerBase64, "base64");
    if (!signedPdf.length || signedPdf.length > 25 * 1024 * 1024 || signedPdf.subarray(0, 4).toString() !== "%PDF") return NextResponse.json({ error: "PDF assinado inválido." }, { status: 400 });
    const certificate = new X509Certificate(certificateDer);
    const fingerprint = certificateFingerprintFromDer(certificateDer);
    const admin = getSupabaseAdminClient();
    const { data: signature } = await (admin.from("digital_signatures") as any).select("*").eq("id", id).eq("clinic_id", user.clinicId).maybeSingle();
    if (!signature) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    if (signature.signer_user_id !== user.id || user.role !== "medico") return NextResponse.json({ error: "Somente o médico signatário pode concluir esta assinatura." }, { status: 403 });
    const { data: binding } = await (admin.from("doctor_a1_certificates") as any).select("id").eq("clinic_id", user.clinicId).eq("doctor_user_id", user.id).eq("certificate_fingerprint", fingerprint).eq("active", true).is("revoked_at", null).maybeSingle();
    if (!binding) return NextResponse.json({ error: "Este certificado ainda não está vinculado ao perfil do médico." }, { status: 409 });
    const signedHash = createHash("sha256").update(signedPdf).digest("hex");
    const storagePath = `${user.clinicId}/${id}/signed-${signedHash.slice(0, 12)}-${randomUUID()}.pdf`;
    await admin.storage.createBucket("digital-signatures", { public: false, fileSizeLimit: "25MB" }).catch(() => undefined);
    const { error: uploadError } = await admin.storage.from("digital-signatures").upload(storagePath, signedPdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    await (admin.from("digital_signatures") as any).update({ signed_storage_path: storagePath, signed_document_hash: signedHash, status: "signing", validation_result: { localSignatureReceived: true, certificateFingerprint: fingerprint, certificateSubject: certificate.subject, certificateIssuer: certificate.issuer, icpValidation: "pending" }, updated_at: new Date().toISOString() }).eq("id", id).eq("clinic_id", user.clinicId);
    return NextResponse.json({ received: true, status: "signing", icpValidation: "pending" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível receber a assinatura." }, { status: 400 });
  }
}
