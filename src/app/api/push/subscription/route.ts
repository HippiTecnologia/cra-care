import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

type PushSubscriptionInput = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const subscription = await request.json() as PushSubscriptionInput;
    if (typeof subscription.endpoint !== "string" || !subscription.keys?.p256dh || !subscription.keys.auth) return NextResponse.json({ error: "Dispositivo inválido." }, { status: 400 });
    const { data: patient, error: patientError } = await admin.from("patients").select("id, clinic_id").eq("auth_user_id", user.id).maybeSingle();
    if (patientError || !patient?.clinic_id) return NextResponse.json({ error: "Paciente não encontrado." }, { status: 403 });
    const { error } = await (admin.from("push_subscriptions") as any).upsert({
      clinic_id: patient.clinic_id,
      patient_id: patient.id,
      endpoint: subscription.endpoint,
      subscription,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível autorizar este dispositivo." }, { status: 500 });
  }
}
