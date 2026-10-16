/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser, isActiveSignaturePatient } from "../../../../../lib/signatures/auth";
import { writeSignatureAudit } from "../../../../../lib/signatures/audit";
import { certificateFingerprintFromDer, validatePreparedA1SignatureAgainstIcpBrasil, verifyPreparedA1Signature } from "../../../../../lib/signatures/a1";
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
    const declaredFingerprint = certificateFingerprintFromDer(certificateDer);
    const admin = getSupabaseAdminClient();
    const { data: signature } = await (admin.from("digital_signatures") as any).select("*").eq("id", id).eq("clinic_id", user.clinicId).maybeSingle();
    if (!signature) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    if (!(await isActiveSignaturePatient(user.clinicId, String(signature.patient_id ?? "")))) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    if (signature.signer_user_id !== user.id || user.role !== "medico") return NextResponse.json({ error: "Somente o médico signatário pode concluir esta assinatura." }, { status: 403 });
    const downloaded = await admin.storage.from("digital-signatures").download(signature.original_storage_path);
    if (downloaded.error || !downloaded.data) throw new Error("Documento preparado não encontrado.");
    const preparedPdf = Buffer.from(await downloaded.data.arrayBuffer());
    if (createHash("sha256").update(preparedPdf).digest("hex") !== signature.document_hash) throw new Error("O documento preparado foi alterado e não pode ser assinado.");
    let local;
    try {
      local = await verifyPreparedA1Signature(preparedPdf, signedPdf);
    } catch (error) {
      const message = error instanceof Error ? error.message : "A assinatura local não pôde ser verificada.";
      await (admin.from("digital_signatures") as any).update({ status: "invalid", error_code: "A1_SIGNATURE_INVALID", error_message: message, updated_at: new Date().toISOString() }).eq("id", id).eq("clinic_id", user.clinicId);
      await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "a1_signature_rejected", status: "invalid", actorId: user.id, provider: "a1", metadata: { message } });
      return NextResponse.json({ error: `${message} Gere uma nova solicitação de assinatura e tente novamente.` }, { status: 409 });
    }
    if (local.certificateFingerprint !== declaredFingerprint) return NextResponse.json({ error: "O certificado informado pelo Hippi não é o mesmo usado para assinar o PDF." }, { status: 409 });
    const { data: binding } = await (admin.from("doctor_a1_certificates") as any).select("id").eq("clinic_id", user.clinicId).eq("doctor_user_id", user.id).eq("certificate_fingerprint", local.certificateFingerprint).eq("active", true).is("revoked_at", null).maybeSingle();
    if (!binding) return NextResponse.json({ error: "Este certificado ainda não está vinculado ao perfil do médico." }, { status: 409 });
    const signedHash = createHash("sha256").update(signedPdf).digest("hex");
    const storagePath = `${user.clinicId}/${id}/signed-${signedHash.slice(0, 12)}-${randomUUID()}.pdf`;
    await admin.storage.createBucket("digital-signatures", { public: false, fileSizeLimit: "25MB" }).catch(() => undefined);
    const { error: uploadError } = await admin.storage.from("digital-signatures").upload(storagePath, signedPdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    const receivedAt = new Date().toISOString();
    const localValidation = { localSignatureReceived: true, localSignatureValid: true, certificateFingerprint: local.certificateFingerprint, certificateSerial: local.certificateSerial, certificateSubject: local.certificateSubject, certificateIssuer: local.certificateIssuer };
    await (admin.from("digital_signatures") as any).update({ signed_storage_path: storagePath, signed_document_hash: signedHash, status: "signing", validation_result: { ...localValidation, icpValidation: "pending" }, updated_at: receivedAt }).eq("id", id).eq("clinic_id", user.clinicId);
    await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "a1_signature_received", status: "signing", actorId: user.id, provider: "a1", metadata: { certificateFingerprint: local.certificateFingerprint } });

    try {
      const icp = await validatePreparedA1SignatureAgainstIcpBrasil(preparedPdf, signedPdf);
      const validatedAt = new Date().toISOString();
      await (admin.from("digital_signatures") as any).update({
        status: "signed", signed_at: receivedAt, validated_at: validatedAt, error_code: null, error_message: null,
        validation_result: { ...localValidation, valid: true, icpValidation: "valid", chainCertificates: icp.chainCertificates, crlUrls: icp.crlUrls },
        updated_at: validatedAt,
      }).eq("id", id).eq("clinic_id", user.clinicId);
      await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "a1_icp_validation_succeeded", status: "signed", actorId: user.id, provider: "a1", metadata: { certificateFingerprint: icp.certificateFingerprint, chainCertificates: icp.chainCertificates, crlUrls: icp.crlUrls } });
      return NextResponse.json({ received: true, status: "signed", icpValidation: "valid" });
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : "A validação ICP-Brasil ainda não foi concluída.";
      await (admin.from("digital_signatures") as any).update({
        status: "signing", error_code: "ICP_VALIDATION_PENDING", error_message: message,
        validation_result: { ...localValidation, icpValidation: "pending", icpValidationMessage: message }, updated_at: new Date().toISOString(),
      }).eq("id", id).eq("clinic_id", user.clinicId);
      await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "a1_icp_validation_pending", status: "signing", actorId: user.id, provider: "a1", metadata: { message } });
      return NextResponse.json({ received: true, status: "signing", icpValidation: "pending", message });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível receber a assinatura." }, { status: 400 });
  }
}
