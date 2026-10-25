/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requestMetadata } from "../../../../../lib/signatures/auth";
import { writeSignatureAudit } from "../../../../../lib/signatures/audit";
import {
  CertillionApiError, certillionSessionCookieValue, certillionSessionFromToken, CERTILLION_SESSION_COOKIE,
  CERTILLION_AUTH_COOKIE, exchangeCertillionCode, getCertillionConfig, readCertillionAuthorization, signCertillionDocument,
} from "../../../../../lib/signatures/certillion";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";

function resultPage(origin: string, result: { ok: boolean; signatureId?: string; message: string }, cookie?: { value: string; expiresAt: number }) {
  const safeResult = JSON.stringify({ type: "certillion-signature-finished", ...result }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Assinatura CRA Care</title><body style="font:16px system-ui;padding:32px;color:#17233b"><p>${result.ok ? "Assinatura processada." : "Não foi possível concluir."} Esta janela pode ser fechada.</p><script>const result=${safeResult};if(window.opener){window.opener.postMessage(result,${JSON.stringify(origin)});}window.close();</script></body></html>`;
  const response = new NextResponse(html, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
  } });
  if (cookie) response.cookies.set(CERTILLION_SESSION_COOKIE, cookie.value, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    expires: new Date(cookie.expiresAt),
  });
  response.cookies.set(CERTILLION_AUTH_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (!state) return resultPage(origin, { ok: false, message: "Resposta de autorização sem estado válido." });

  let config;
  try { config = getCertillionConfig(); }
  catch { return resultPage(origin, { ok: false, message: "A integração Certillion está pendente de configuração." }); }
  const pending = readCertillionAuthorization(request, config);
  if (!pending || pending.state !== state) return resultPage(origin, { ok: false, message: "A autorização não corresponde a este navegador ou expirou. Clique novamente em Conectar certificado." });
  if (!pending.signatureId) {
    if (oauthError || !code) return resultPage(origin, { ok: false, message: "Conexão cancelada. Nenhum documento foi assinado." });
    try {
      const tokenPayload = await exchangeCertillionCode(config, code, pending.verifier);
      const session = certillionSessionFromToken({ payload: tokenPayload, userId: pending.userId, clinicId: pending.clinicId });
      return resultPage(new URL(config.redirectUri).origin, { ok: true, message: "Certificado A3 conectado. Agora selecione a receita e clique em Assinar." }, { value: certillionSessionCookieValue(config, session), expiresAt: session.expiresAt });
    } catch (cause) {
      return resultPage(new URL(config.redirectUri).origin, { ok: false, message: cause instanceof Error ? cause.message : "Não foi possível conectar o A3." });
    }
  }

  const admin = getSupabaseAdminClient();
  const { data: signature } = await (admin.from("digital_signatures") as any).select("*").eq("id", pending.signatureId).eq("clinic_id", pending.clinicId).eq("signer_user_id", pending.userId).eq("provider", "a3").eq("provider_state", state).maybeSingle();
  if (!signature || signature.status !== "authentication_pending" || !signature.expires_at || new Date(signature.expires_at).getTime() < Date.now()) {
    return resultPage(origin, { ok: false, message: "A solicitação expirou ou não foi encontrada. Inicie novamente pelo CRA Care." });
  }
  const meta = requestMetadata(request);
  const { data: claimed, error: claimError } = await (admin.from("digital_signatures") as any)
    .update({ status: "signing", provider_state: null, updated_at: new Date().toISOString() })
    .eq("id", signature.id).eq("clinic_id", pending.clinicId).eq("status", "authentication_pending").eq("provider_state", state).select("id").maybeSingle();
  if (claimError || !claimed) return resultPage(origin, { ok: false, message: "Esta autorização já foi recebida. Atualize a lista de assinaturas." });
  if (oauthError || !code) {
    await (admin.from("digital_signatures") as any).update({ status: "rejected", error_code: "CERTILLION_AUTH_REJECTED", error_message: "Autorização cancelada ou recusada pelo signatário.", updated_at: new Date().toISOString() }).eq("id", signature.id);
    await writeSignatureAudit({ signatureId: signature.id, clinicId: signature.clinic_id, event: "authentication_rejected", status: "rejected", actorId: signature.signer_user_id, provider: "a3", ...meta }).catch(() => undefined);
    return resultPage(origin, { ok: false, signatureId: signature.id, message: "Autorização cancelada. Nenhum documento foi assinado." });
  }

  let cookie: { value: string; expiresAt: number } | undefined;
  try {
    const trustedOrigin = new URL(config.redirectUri).origin;
    const providerData = signature.provider_data && typeof signature.provider_data === "object" ? signature.provider_data as Record<string, any> : {};
    const verifier = providerData.pkceVerifier;
    if (typeof verifier !== "string" || !verifier) throw new Error("Não foi possível validar a autorização iniciada pelo CRA Care.");
    if (verifier !== pending.verifier) throw new Error("A autorização não corresponde à receita solicitada.");
    const tokenPayload = await exchangeCertillionCode(config, code, verifier);
    const session = certillionSessionFromToken({ payload: tokenPayload, userId: signature.signer_user_id, clinicId: signature.clinic_id });
    cookie = { value: certillionSessionCookieValue(config, session), expiresAt: session.expiresAt };
    const downloaded = await admin.storage.from("digital-signatures").download(signature.original_storage_path);
    if (downloaded.error || !downloaded.data) throw new Error("Documento original não encontrado.");
    const pdf = new Uint8Array(await downloaded.data.arrayBuffer());
    if (createHash("sha256").update(pdf).digest("hex") !== signature.document_hash) throw new Error("O documento original foi alterado. Gere uma nova solicitação.");
    const now = new Date().toISOString();
    await (admin.from("digital_signatures") as any).update({
      authenticated_at: now, provider_data: { ...providerData, pkceVerifier: null, certillionScope: session.scope },
      status: "signing", error_code: null, error_message: null, updated_at: now,
    }).eq("id", signature.id);
    const finished = await signCertillionDocument({ admin, signature: { ...signature, updated_at: now, status: "signing", authenticated_at: now, provider_data: { ...providerData, pkceVerifier: null, certillionScope: session.scope } }, accessToken: session.accessToken, pdf });
    await writeSignatureAudit({ signatureId: signature.id, clinicId: signature.clinic_id, event: "signature_validated", status: "signed", actorId: signature.signer_user_id, provider: "a3", metadata: { transaction: finished.transaction }, ...meta }).catch(() => undefined);
    return resultPage(trustedOrigin, { ok: true, signatureId: signature.id, message: "Documento assinado e validado pela Certillion." }, cookie);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Não foi possível concluir a assinatura Certillion.";
    const ambiguousSignature = cause instanceof CertillionApiError && cause.stage === "signature" && !cause.rejected;
    if (!ambiguousSignature) await (admin.from("digital_signatures") as any).update({ status: "error", error_code: "CERTILLION_FLOW_ERROR", error_message: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", signature.id);
    await writeSignatureAudit({ signatureId: signature.id, clinicId: signature.clinic_id, event: "signature_error", status: ambiguousSignature ? "signing" : "error", actorId: signature.signer_user_id, provider: "a3", metadata: { message: message.slice(0, 240) }, ...meta }).catch(() => undefined);
    let trustedOrigin = origin;
    try { trustedOrigin = new URL(getCertillionConfig().redirectUri).origin; } catch { /* A configuração ainda pode estar ausente. */ }
    return resultPage(trustedOrigin, { ok: false, signatureId: signature.id, message }, cookie);
  }
}
