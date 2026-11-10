import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type Payload = { patientIds?: unknown; title?: unknown; text?: unknown; icon?: unknown };

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function configuredPush() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function POST(request: NextRequest) {
  try {
    if (!configuredPush()) return NextResponse.json({ sent: 0, attempted: 0, failed: 0, reason: "push_not_configured" });
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const { data: profile, error: profileError } = await admin.from("profiles").select("clinic_id, role").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.clinic_id || profile.role !== "secretaria") return NextResponse.json({ error: "Apenas a Secretaria pode enviar notificações." }, { status: 403 });
    const payload = await request.json() as Payload;
    const patientIds = Array.isArray(payload.patientIds) ? payload.patientIds.filter((id): id is string => typeof id === "string") : [];
    if (!patientIds.length || typeof payload.title !== "string" || typeof payload.text !== "string") return NextResponse.json({ error: "Dados da notificação inválidos." }, { status: 400 });
    const { data: activePatients, error: patientsError } = await (admin.from("patients") as any).select("id").eq("clinic_id", profile.clinic_id).in("id", patientIds).is("archived_at", null);
    if (patientsError) throw patientsError;
    const activePatientIds = (activePatients ?? []).map((patient: { id: string }) => patient.id);
    if (!activePatientIds.length) return NextResponse.json({ sent: 0, attempted: 0, failed: 0, reason: "no_active_patients" });
    const { data: subscriptions, error } = await (admin.from("push_subscriptions") as any).select("id, subscription").eq("clinic_id", profile.clinic_id).in("patient_id", activePatientIds);
    if (error) throw error;
    const message = JSON.stringify({ title: payload.title, body: payload.text, icon: payload.icon, url: "/paciente" });
    let sent = 0;
    const failureCodes: Record<string, number> = {};
    const rows = (subscriptions ?? []) as { id: string; subscription: webpush.PushSubscription }[];
    for (const batch of chunks(rows, 20)) {
      const results = await Promise.all(batch.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, message);
          return { ok: true as const };
        } catch (cause) {
          const statusCode = (cause as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await (admin.from("push_subscriptions") as any).delete().eq("id", row.id);
          }
          return { ok: false as const, statusCode };
        }
      }));
      for (const result of results) {
        if (result.ok) {
          sent += 1;
          continue;
        }
        const code = result.statusCode == null ? "unknown" : String(result.statusCode);
        failureCodes[code] = (failureCodes[code] ?? 0) + 1;
      }
    }
    const attempted = rows.length;
    return NextResponse.json({
      sent,
      attempted,
      failed: attempted - sent,
      failureCodes,
      reason: attempted === 0 ? "no_subscriptions" : undefined,
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível disparar as notificações." }, { status: 500 });
  }
}
