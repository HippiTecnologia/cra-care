import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

function validCronSecret(received: string | null, expected: string | undefined) {
  if (!received || !expected || expected.length < 32) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message.slice(0, 500) : "Falha ao entregar a notificação.";
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function POST(request: NextRequest) {
  if (!validCronSecret(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const admin: any = getSupabaseAdminClient();
    const { data: jobs, error: claimError } = await admin.rpc("claim_due_scheduled_patient_notifications", { p_limit: 10 });
    if (claimError) throw claimError;
    let delivered = 0;
    let failed = 0;

    for (const job of jobs ?? []) {
      try {
        const { data: delivery, error: deliveryError } = await admin.rpc("deliver_scheduled_patient_notification", { p_job_id: job.id });
        if (deliveryError) throw deliveryError;
        const patientIds = Array.isArray(delivery?.patient_ids) ? delivery.patient_ids.filter((id: unknown): id is string => typeof id === "string") : [];
        if (!patientIds.length) throw new Error("Nenhum destinatário ativo no momento do envio.");
        const now = new Date().toISOString();

        const { error: completeError } = await admin.from("scheduled_patient_notifications")
          .update({ status: "sent", sent_at: now, sent_patient_count: delivery.patient_count ?? patientIds.length, last_error: null, updated_at: now })
          .eq("id", job.id)
          .eq("status", "sending");
        if (completeError) throw completeError;
        delivered += 1;

        const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
        const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
        const subject = process.env.WEB_PUSH_SUBJECT;
        let pushSent = 0;
        let pushAttempted = 0;
        const pushFailureCodes: Record<string, number> = {};
        const pushWarnings: string[] = [];
        if (publicKey && privateKey && subject) {
          webpush.setVapidDetails(subject, publicKey, privateKey);
          const subscriptions: { id: string; subscription: webpush.PushSubscription }[] = [];
          for (const patientIdChunk of chunks(patientIds, 200)) {
            const { data, error: pushError } = await admin.from("push_subscriptions")
              .select("id, subscription")
              .eq("clinic_id", job.clinic_id)
              .in("patient_id", patientIdChunk);
            if (pushError) pushWarnings.push("Não foi possível consultar os dispositivos autorizados para push.");
            else subscriptions.push(...(data ?? []));
          }
          pushAttempted = subscriptions.length;
          if (!pushAttempted && !pushWarnings.length) pushWarnings.push("Nenhum dos pacientes selecionados tem dispositivo autorizado para push; o aviso ficou no sino do portal.");
          const payload = JSON.stringify({ title: job.title, body: job.message, icon: job.icon || "📣", url: "/paciente" });
          for (const batch of chunks(subscriptions, 20)) {
            const results = await Promise.all(batch.map(async (row) => {
              try {
                await webpush.sendNotification(row.subscription, payload);
                return { ok: true as const };
              } catch (cause) {
                const statusCode = (cause as { statusCode?: number }).statusCode;
                if (statusCode === 404 || statusCode === 410) {
                  await admin.from("push_subscriptions").delete().eq("id", row.id);
                }
                return { ok: false as const, statusCode };
              }
            }));
            for (const result of results) {
              if (result.ok) {
                pushSent += 1;
                continue;
              }
              const code = result.statusCode == null ? "unknown" : String(result.statusCode);
              pushFailureCodes[code] = (pushFailureCodes[code] ?? 0) + 1;
            }
          }
          if (pushAttempted > pushSent) {
            const codes = Object.entries(pushFailureCodes).map(([code, count]) => `${code}: ${count}`).join(", ");
            pushWarnings.push(`Push não confirmado para ${pushAttempted - pushSent} dispositivo(s)${codes ? ` (códigos ${codes})` : ""}.`);
          }
        } else {
          pushWarnings.push("As chaves de push não estão configuradas na hospedagem.");
        }
        await admin.from("scheduled_patient_notifications").update({
          push_sent_count: pushSent,
          last_error: pushWarnings.length ? pushWarnings.join(" ").slice(0, 500) : null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
      } catch (cause) {
        failed += 1;
        const retry = Number(job.attempts) < 5;
        const retryAt = new Date(Date.now() + 60_000).toISOString();
        await admin.from("scheduled_patient_notifications").update({
          status: retry ? "pending" : "failed",
          scheduled_for: retry ? retryAt : job.scheduled_for,
          last_error: errorMessage(cause),
          updated_at: new Date().toISOString(),
        }).eq("id", job.id).eq("status", "sending");
      }
    }

    return NextResponse.json({ claimed: (jobs ?? []).length, delivered, failed });
  } catch {
    return NextResponse.json({ error: "Não foi possível processar os agendamentos." }, { status: 500 });
  }
}
