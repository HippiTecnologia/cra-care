/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { writeSignatureAudit } from "../../../../../lib/signatures/audit";
import { exchangeVidaasCode, getVidaasConfig, signPdfWithVidaas } from "../../../../../lib/signatures/vidaas";

export const runtime = "nodejs";

function resultPage(title: string, text: string, success = false) {
  return new NextResponse(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;background:#fbf7f5;color:#403237;padding:48px;text-align:center}main{max-width:520px;margin:auto;background:#fff;padding:32px;border-radius:20px;box-shadow:0 8px 28px #0001}h1{color:${success ? "#187157" : "#a3113a"}}p{line-height:1.55}</style></head><body><main><h1>${title}</h1><p>${text}</p><p>Você já pode fechar esta janela e voltar ao CRA Care.</p></main><script>window.opener?.postMessage({type:'vidaas-signature-finished'},window.location.origin)</script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return resultPage("Assinatura não concluída", "O VIDaaS não retornou a autorização esperada.");
  const admin = getSupabaseAdminClient();
  const { data: session } = await (admin.from("prescription_digital_signatures") as any).select("*").eq("authorization_state", state).maybeSingle();
  if (!session) {
    const { data: modern } = await (admin.from("digital_signatures") as any).select("*").eq("provider", "vidaas").eq("provider_state", state).maybeSingle();
    if (!modern) return resultPage("Sessão não encontrada", "Esta autorização expirou ou já foi utilizada.");
    if (modern.status === "signed") return resultPage("Documento já assinado", "Esta assinatura já foi concluída e validada.", true);
    if (!modern.expires_at || new Date(modern.expires_at).getTime() < Date.now()) {
      await (admin.from("digital_signatures") as any).update({ status: "expired", provider_state: null, provider_data: {}, updated_at: new Date().toISOString() }).eq("id", modern.id);
      await writeSignatureAudit({ signatureId: modern.id, clinicId: modern.clinic_id, event: "signature_expired", status: "expired", provider: "vidaas" });
      return resultPage("Sessão expirada", "Inicie uma nova assinatura no CRA Care.");
    }
    try {
      await (admin.from("digital_signatures") as any).update({ status: "signing", authenticated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", modern.id);
      await writeSignatureAudit({ signatureId: modern.id, clinicId: modern.clinic_id, event: "provider_authenticated", status: "signing", actorId: modern.signer_user_id, provider: "vidaas" });
      const verifier = typeof modern.provider_data?.pkceVerifier === "string" ? modern.provider_data.pkceVerifier : "";
      if (!verifier) throw new Error("A sessão de autorização não possui verificador PKCE válido.");
      const token = await exchangeVidaasCode(getVidaasConfig(), code, verifier);
      const unsigned = await admin.storage.from("digital-signatures").download(modern.original_storage_path);
      if (unsigned.error || !unsigned.data) throw unsigned.error ?? new Error("PDF original não encontrado.");
      const originalPdf = new Uint8Array(await unsigned.data.arrayBuffer());
      if (createHash("sha256").update(originalPdf).digest("hex") !== modern.document_hash) throw new Error("O documento foi alterado e precisa ser gerado novamente antes da assinatura.");
      const result = await signPdfWithVidaas(getVidaasConfig(), token, originalPdf, modern.id);
      const signedHash = createHash("sha256").update(result.signedPdf).digest("hex");
      if (signedHash === modern.document_hash) throw new Error("O provedor não retornou uma versão assinada diferente do documento original.");
      const signedPath = `${modern.clinic_id}/${modern.id}/assinado-${signedHash.slice(0, 12)}.pdf`;
      const { error: uploadError } = await admin.storage.from("digital-signatures").upload(signedPath, result.signedPdf, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      const now = new Date().toISOString();
      const validationResult = { valid: true, providerConfirmed: true, originalHashMatched: true, signedPdfReturned: true, provider: "vidaas" };
      await (admin.from("digital_signatures") as any).update({
        status: "signed", signed_storage_path: signedPath, signed_document_hash: signedHash,
        provider_signature_id: modern.id, validation_result: validationResult,
        signed_at: now, validated_at: now, provider_state: null, provider_data: {}, updated_at: now,
      }).eq("id", modern.id).eq("clinic_id", modern.clinic_id);
      if (modern.document_type === "prescription") await admin.from("prescriptions").update({ signature_status: "signed" }).eq("id", modern.document_id).eq("clinic_id", modern.clinic_id);
      await writeSignatureAudit({ signatureId: modern.id, clinicId: modern.clinic_id, event: "signature_validated", status: "signed", actorId: modern.signer_user_id, provider: "vidaas", metadata: { signedHash, certificateAlias: result.certificateAlias ?? null } });
      return resultPage("Documento assinado com sucesso", "A assinatura foi confirmada pelo VIDaaS, validada e armazenada no CRA Care.", true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível concluir a assinatura.";
      await (admin.from("digital_signatures") as any).update({ status: "error", error_code: "PROVIDER_ERROR", error_message: message, provider_state: null, provider_data: {}, updated_at: new Date().toISOString() }).eq("id", modern.id);
      await writeSignatureAudit({ signatureId: modern.id, clinicId: modern.clinic_id, event: "signature_failed", status: "error", actorId: modern.signer_user_id, provider: "vidaas", metadata: { message } });
      return resultPage("Assinatura não concluída", message);
    }
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await (admin.from("prescription_digital_signatures") as any).update({ status: "expired", pkce_verifier: "", updated_at: new Date().toISOString() }).eq("id", session.id);
    return resultPage("Sessão expirada", "Inicie uma nova assinatura no CRA Care.");
  }
  try {
    await (admin.from("prescription_digital_signatures") as any).update({ status: "authorizing", updated_at: new Date().toISOString() }).eq("id", session.id);
    const config = getVidaasConfig();
    const token = await exchangeVidaasCode(config, code, session.pkce_verifier);
    const unsigned = await admin.storage.from("prescription-signatures").download(session.unsigned_pdf_path);
    if (unsigned.error || !unsigned.data) throw unsigned.error ?? new Error("PDF original não encontrado.");
    const originalPdf = new Uint8Array(await unsigned.data.arrayBuffer());
    const result = await signPdfWithVidaas(config, token, originalPdf, session.prescription_id);
    const signedPath = `${session.clinic_id}/${session.prescription_id}/${session.authorization_state}/assinado.pdf`;
    const { error: uploadError } = await admin.storage.from("prescription-signatures").upload(signedPath, result.signedPdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    await (admin.from("prescription_digital_signatures") as any).update({ status: "signed", signed_pdf_path: signedPath, certificate_alias: result.certificateAlias ?? null, signed_at: new Date().toISOString(), pkce_verifier: "", updated_at: new Date().toISOString() }).eq("id", session.id);
    await admin.from("prescriptions").update({ signature_status: "signed" }).eq("id", session.prescription_id);
    return resultPage("Receita assinada com sucesso", "A assinatura ICP-Brasil foi concluída pelo VIDaaS e o PDF assinado foi guardado no prontuário.", true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a assinatura.";
    await (admin.from("prescription_digital_signatures") as any).update({ status: "failed", error_message: message, pkce_verifier: "", updated_at: new Date().toISOString() }).eq("id", session.id);
    return resultPage("Assinatura não concluída", message);
  }
}
