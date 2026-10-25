/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser, isActiveSignaturePatient, requestMetadata } from "../../../../../lib/signatures/auth";
import { writeSignatureAudit } from "../../../../../lib/signatures/audit";
import { getSignatureProvider } from "../../../../../lib/signatures/providers";
import { CERTILLION_AUTH_COOKIE, certillionAuthorizationCookieValue, getCertillionConfig, readCertillionSession, signCertillionDocument } from "../../../../../lib/signatures/certillion";
import { allowSignatureRequest } from "../../../../../lib/signatures/rate-limit";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!allowSignatureRequest(`${user.id}:start`, 12)) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
  const { id } = await context.params;
  const admin = getSupabaseAdminClient();
  const { data: signature } = await (admin.from("digital_signatures") as any).select("*").eq("id", id).eq("clinic_id", user.clinicId).maybeSingle();
  if (!signature) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  if (!(await isActiveSignaturePatient(user.clinicId, String(signature.patient_id ?? "")))) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  if (signature.signer_user_id !== user.id || user.role !== "medico") return NextResponse.json({ error: "Somente o médico signatário pode autorizar esta assinatura." }, { status: 403 });
  if (signature.status === "signed") return NextResponse.json({ error: "O documento já está assinado." }, { status: 409 });
  if (["cancelled", "invalid"].includes(signature.status)) return NextResponse.json({ error: "Prepare uma nova solicitação para esta receita antes de assinar." }, { status: 409 });
  if (signature.provider === "a1") return NextResponse.json({ error: "O Hippi foi substituído pela Certillion. Cancele esta solicitação e prepare a receita com Certillion (A3)." }, { status: 409 });
  const provider = getSignatureProvider(signature.provider);
  if (!provider) return NextResponse.json({ error: "Provedor inválido." }, { status: 400 });
  if (provider.key === "vidaas" && process.env.VIDAAS_DOCTOR_CRM?.trim() && process.env.VIDAAS_DOCTOR_CRM.trim() !== String(user.crm ?? "")) {
    return NextResponse.json({ error: "O VIDaaS está configurado para outro médico." }, { status: 403 });
  }
  const downloaded = await admin.storage.from("digital-signatures").download(signature.original_storage_path);
  if (downloaded.error || !downloaded.data) return NextResponse.json({ error: "Documento original não encontrado." }, { status: 404 });
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== signature.document_hash) {
    await (admin.from("digital_signatures") as any).update({ status: "invalid", error_code: "DOCUMENT_CHANGED", error_message: "O documento foi alterado e precisa ser gerado novamente.", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ error: "O documento foi alterado e precisa ser gerado novamente antes da assinatura." }, { status: 409 });
  }
  if (provider.key === "a3" && provider.isConfigured()) {
    try {
      const session = readCertillionSession(request, getCertillionConfig(), user);
      if (session) {
        const providerData = signature.provider_data && typeof signature.provider_data === "object" ? signature.provider_data as Record<string, any> : {};
        const certillion = providerData.certillion && typeof providerData.certillion === "object" ? providerData.certillion as Record<string, any> : {};
        if (certillion.signatureSubmissionInFlight && !certillion.transaction) {
          return NextResponse.json({ error: "A resposta da solicitação anterior ficou incerta. Confirme a transação com a Certillion antes de tentar novamente.", code: "CERTILLION_SIGNATURE_STATE_UNCERTAIN" }, { status: 409 });
        }
        const result = await signCertillionDocument({ admin, signature, accessToken: session.accessToken, pdf: bytes });
        await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "signature_validated", status: "signed", actorId: user.id, provider: "a3", metadata: { transaction: result.transaction }, ...requestMetadata(request) }).catch(() => undefined);
        return NextResponse.json({ kind: "completed", message: "Documento assinado e validado pela Certillion." });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível concluir a assinatura Certillion.";
      return NextResponse.json({ error: message, code: "CERTILLION_SIGNATURE_ERROR" }, { status: 502 });
    }
  }
  const callbackUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, "")}/api/assinatura/vidaas/retorno`;
  const providerCallbackUrl = provider.key === "a3"
    ? process.env.CERTILLION_REDIRECT_URI?.trim() ?? ""
    : callbackUrl;
  const result = await provider.start({ signatureId: id, documentHash: signature.document_hash, signer: user, callbackUrl: providerCallbackUrl });
  const meta = requestMetadata(request);
  if (result.kind === "unavailable") {
    await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "provider_unavailable", status: signature.status, actorId: user.id, provider: provider.key, metadata: { message: result.message }, ...meta });
    return NextResponse.json({ error: result.message, code: "PROVIDER_NOT_CONFIGURED" }, { status: 409 });
  }
  if (result.kind === "connector") {
    await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "connector_required", status: signature.status, actorId: user.id, provider: provider.key, metadata: { message: result.message }, ...meta });
    return NextResponse.json({ kind: "connector", message: result.message });
  }
  await (admin.from("digital_signatures") as any).update({
    status: "authentication_pending", provider_state: result.state,
    provider_data: { ...(signature.provider_data && typeof signature.provider_data === "object" ? signature.provider_data : {}), pkceVerifier: result.verifier }, expires_at: result.expiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("clinic_id", user.clinicId);
  await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "authentication_started", status: "authentication_pending", actorId: user.id, provider: provider.key, ...meta });
  const response = NextResponse.json({ kind: "redirect", authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt });
  if (provider.key === "a3" && result.verifier) response.cookies.set(CERTILLION_AUTH_COOKIE, certillionAuthorizationCookieValue(getCertillionConfig(), {
    verifier: result.verifier, state: result.state, userId: user.id, clinicId: user.clinicId,
    signatureId: id, expiresAt: new Date(result.expiresAt).getTime(),
  }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 900 });
  return response;
}
