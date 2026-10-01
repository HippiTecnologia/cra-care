import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";
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
  if (!session) return resultPage("Sessão não encontrada", "Esta autorização expirou ou já foi utilizada.");
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
