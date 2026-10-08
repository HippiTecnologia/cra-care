/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser, requestMetadata } from "../../../../../lib/signatures/auth";
import { writeSignatureAudit } from "../../../../../lib/signatures/audit";
import { getSignatureProvider } from "../../../../../lib/signatures/providers";
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
  if (signature.signer_user_id !== user.id || user.role !== "medico") return NextResponse.json({ error: "Somente o médico signatário pode autorizar esta assinatura." }, { status: 403 });
  if (signature.status === "signed") return NextResponse.json({ error: "O documento já está assinado." }, { status: 409 });
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
  const callbackUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, "")}/api/assinatura/vidaas/retorno`;
  const result = await provider.start({ signatureId: id, documentHash: signature.document_hash, signer: user, callbackUrl });
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
    provider_data: { pkceVerifier: result.verifier }, expires_at: result.expiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("clinic_id", user.clinicId);
  await writeSignatureAudit({ signatureId: id, clinicId: user.clinicId, event: "authentication_started", status: "authentication_pending", actorId: user.id, provider: provider.key, ...meta });
  return NextResponse.json({ kind: "redirect", authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt });
}
