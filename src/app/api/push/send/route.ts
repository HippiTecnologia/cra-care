import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

type Payload = { patientIds?: unknown; title?: unknown; text?: unknown; icon?: unknown };

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
    if (!configuredPush()) return NextResponse.json({ sent: 0, reason: "Push ainda não configurado." });
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
    const { data: subscriptions, error } = await (admin.from("push_subscriptions") as any).select("id, subscription").eq("clinic_id", profile.clinic_id).in("patient_id", patientIds);
    if (error) throw error;
    const message = JSON.stringify({ title: payload.title, body: payload.text, icon: payload.icon, url: "/paciente" });
    let sent = 0;
    await Promise.all((subscriptions ?? []).map(async (row: { id: string; subscription: webpush.PushSubscription }) => {
      try { await webpush.sendNotification(row.subscription, message); sent += 1; }
      catch (cause) {
        const statusCode = (cause as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) await (admin.from("push_subscriptions") as any).delete().eq("id", row.id);
      }
    }));
    return NextResponse.json({ sent });
  } catch {
    return NextResponse.json({ error: "Não foi possível disparar as notificações." }, { status: 500 });
  }
}
