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

function pushSetupError(cause: unknown) {
  const statusCode = (cause as { statusCode?: number })?.statusCode;
  if (statusCode === 401 || statusCode === 403) {
    return `O serviço de push recusou a autenticação (HTTP ${statusCode}); confira se as chaves VAPID correspondem.`;
  }
  if (statusCode) return `Não foi possível preparar o push (HTTP ${statusCode}).`;
  if (cause instanceof Error && /vapid|public key|private key|subject/i.test(cause.message)) {
    return "As chaves ou a identificação VAPID estão inválidas na hospedagem.";
  }
  return "Falha inesperada ao iniciar o push; confira os logs do agendador.";
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function dispatchPatientTreatmentReminders(admin: any) {
  const { data: jobs, error: claimError } = await admin.rpc("claim_due_patient_treatment_reminders", { p_limit: 50 });
  if (claimError) throw claimError;

  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;

  let sent = 0;
  let failed = 0;
  let pushAttempted = 0;
  let pushAccepted = 0;

  for (const job of jobs ?? []) {
    try {
      if (!publicKey || !privateKey || !subject) throw new Error("As chaves de push não estão configuradas na hospedagem.");
      webpush.setVapidDetails(subject, publicKey, privateKey);
      const { data: subscriptions, error: subscriptionsError } = await admin.from("push_subscriptions")
        .select("id, subscription")
        .eq("clinic_id", job.clinic_id)
        .eq("patient_id", job.patient_id);
      if (subscriptionsError) throw subscriptionsError;
      const authorizedDevices = (subscriptions ?? []) as { id: string; subscription: webpush.PushSubscription }[];
      if (!authorizedDevices.length) throw new Error("Nenhum aparelho autorizado para receber o lembrete.");

      const treatmentName = job.treatment === "imunobacteriana" ? "Imunobacteriana" : "Rinite";
      const payload = JSON.stringify({
        title: "CRA Care · Hora do seu tratamento",
        body: `Está na hora de registrar o uso do seu frasco de ${treatmentName} no calendário.`,
        icon: "/logo-cra.png",
        url: "/paciente",
      });
      let deliveredToDevices = 0;
      const failureCodes: Record<string, number> = {};
      pushAttempted += authorizedDevices.length;

      for (const batch of chunks(authorizedDevices, 20)) {
        const results = await Promise.all(batch.map(async (row) => {
          try {
            await webpush.sendNotification(row.subscription, payload);
            return { ok: true as const };
          } catch (cause) {
            const statusCode = (cause as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              try {
                await admin.from("push_subscriptions").delete().eq("id", row.id);
              } catch {
                // The delivery result remains a failure; stale subscriptions can be cleaned up later.
              }
            }
            return { ok: false as const, statusCode };
          }
        }));

        for (const result of results) {
          if (result.ok) {
            deliveredToDevices += 1;
            continue;
          }
          const code = result.statusCode == null ? "unknown" : String(result.statusCode);
          failureCodes[code] = (failureCodes[code] ?? 0) + 1;
        }
      }

      if (deliveredToDevices === 0) {
        const codes = Object.entries(failureCodes).map(([code, count]) => `${code}: ${count}`).join(", ");
        throw new Error(`O push não foi aceito por nenhum aparelho${codes ? ` (códigos ${codes})` : ""}.`);
      }

      const warning = deliveredToDevices < authorizedDevices.length
        ? `Push aceito em ${deliveredToDevices} de ${authorizedDevices.length} aparelhos.`
        : null;
      pushAccepted += deliveredToDevices;
      const now = new Date().toISOString();
      const { error: saveError } = await admin.from("patient_treatment_reminder_deliveries").update({
        status: "sent",
        push_sent_count: deliveredToDevices,
        sent_at: now,
        last_error: warning,
        updated_at: now,
      }).eq("id", job.id).eq("status", "sending");
      if (saveError) throw saveError;
      sent += 1;
    } catch (cause) {
      failed += 1;
      const attempts = Number(job.attempts) || 0;
      const retry = attempts < 5;
      await admin.from("patient_treatment_reminder_deliveries").update({
        status: retry ? "pending" : "failed",
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: errorMessage(cause),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("status", "sending");
    }
  }

  return {
    claimed: (jobs ?? []).length,
    sent,
    failed,
    pushAttempted,
    pushAccepted,
    pushRejected: Math.max(pushAttempted - pushAccepted, 0),
  };
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
    let pushAttemptedTotal = 0;
    let pushSentTotal = 0;
    let pushResultSaveFailures = 0;
    let patientTreatmentReminders;

    try {
      patientTreatmentReminders = await dispatchPatientTreatmentReminders(admin);
    } catch (cause) {
      console.error("Patient treatment reminder dispatch failed", { message: errorMessage(cause) });
      patientTreatmentReminders = { claimed: 0, sent: 0, failed: 0, pushAttempted: 0, pushAccepted: 0, pushRejected: 0, error: true };
    }

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
          try {
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
          } catch (cause) {
            pushWarnings.push(pushSetupError(cause));
          }
          if (pushAttempted > pushSent) {
            const codes = Object.entries(pushFailureCodes).map(([code, count]) => `${code}: ${count}`).join(", ");
            pushWarnings.push(`Push não confirmado para ${pushAttempted - pushSent} dispositivo(s)${codes ? ` (códigos ${codes})` : ""}.`);
          }
        } else {
          pushWarnings.push("As chaves de push não estão configuradas na hospedagem.");
        }
        pushAttemptedTotal += pushAttempted;
        pushSentTotal += pushSent;
        const { error: pushResultSaveError } = await admin.from("scheduled_patient_notifications").update({
          push_sent_count: pushSent,
          last_error: pushWarnings.length ? pushWarnings.join(" ").slice(0, 500) : null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id).eq("status", "sent");
        if (pushResultSaveError) {
          pushResultSaveFailures += 1;
          console.error("Failed to save scheduled push result", { jobId: job.id, code: pushResultSaveError.code });
        }
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

    return NextResponse.json({
      claimed: (jobs ?? []).length,
      delivered,
      failed,
      pushAttempted: pushAttemptedTotal,
      pushAccepted: pushSentTotal,
      pushRejected: Math.max(pushAttemptedTotal - pushSentTotal, 0),
      pushResultSaveFailures,
      patientTreatmentReminders,
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível processar os agendamentos." }, { status: 500 });
  }
}
