/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { writeSignatureAudit } from "../../../../../lib/signatures/audit";
import { getSignatureProvider } from "../../../../../lib/signatures/providers";
import { allowSignatureRequest } from "../../../../../lib/signatures/rate-limit";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";

function secureEqual(first: string, second: string) {
  const left = Buffer.from(first);
  const right = Buffer.from(second);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerKey } = await context.params;
  const provider = getSignatureProvider(providerKey);
  if (!provider || providerKey === "sandbox") return NextResponse.json({ error: "Provedor inválido." }, { status: 404 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "webhook";
  if (!allowSignatureRequest(`${providerKey}:${ip}`, 120)) return NextResponse.json({ error: "Limite excedido." }, { status: 429 });
  const raw = await request.text();
  const secretName = `SIGNATURE_${providerKey.toUpperCase()}_WEBHOOK_SECRET`;
  const secret = process.env[secretName];
  if (!secret) return NextResponse.json({ error: "Webhook pendente de configuração." }, { status: 503 });
  const received = request.headers.get("x-signature") ?? request.headers.get("x-webhook-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (!received || !secureEqual(received.replace(/^sha256=/, ""), expected)) return NextResponse.json({ error: "Webhook não autenticado." }, { status: 401 });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Payload inválido." }, { status: 400 }); }
  const eventId = String(payload.eventId ?? payload.id ?? "").trim();
  const transactionId = String(payload.transactionId ?? payload.transaction_id ?? "").trim();
  if (!eventId || !transactionId) return NextResponse.json({ error: "Evento sem identificação." }, { status: 400 });
  const admin = getSupabaseAdminClient();
  const { data: signature } = await (admin.from("digital_signatures") as any).select("*").eq("provider", providerKey).eq("provider_transaction_id", transactionId).maybeSingle();
  const { error: eventError } = await (admin.from("signature_webhook_events") as any).insert({
    provider: providerKey, external_event_id: eventId, payload_hash: createHash("sha256").update(raw).digest("hex"), signature_id: signature?.id ?? null,
  });
  if (eventError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 });
  if (signature) {
    await writeSignatureAudit({ signatureId: signature.id, clinicId: signature.clinic_id, event: "provider_webhook_received", status: signature.status, provider: providerKey, metadata: { eventId, transactionId } });
  }
  // Nunca marca como assinado somente porque o webhook afirmou sucesso. O provider
  // deve ser consultado e o PDF/assinatura validados antes da transição para signed.
  return NextResponse.json({ ok: true, validationPending: Boolean(signature) });
}
