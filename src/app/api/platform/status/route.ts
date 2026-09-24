import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("clinic_id, role").eq("id", auth.user.id).maybeSingle();
    if (profileError) throw profileError;
    const patient = profile ? null : await admin.from("patients")
      .select("clinic_id").eq("auth_user_id", auth.user.id).maybeSingle();
    if (patient?.error) throw patient.error;
    const clinicId = profile?.clinic_id ?? patient?.data?.clinic_id;
    if (!clinicId) return NextResponse.json({ error: "Clínica não encontrada para este acesso." }, { status: 403 });

    const { data: clinic, error: clinicError } = await admin.from("clinics")
      .select("name, active").eq("id", clinicId).maybeSingle();
    if (clinicError || !clinic) throw clinicError ?? new Error("Clínica não encontrada.");
    const { data: alert, error: alertError } = profile?.role !== "super_admin" && profile
      ? await admin.from("audit_logs").select("id, details, created_at")
        .eq("clinic_id", clinicId).eq("entity", "platform_alert")
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
      : { data: null, error: null };
    if (alertError) throw alertError;
    const details = alert?.details as Record<string, unknown> | undefined;
    return NextResponse.json({
      clinicName: clinic.name,
      active: Boolean(clinic.active),
      alert: alert ? { id: alert.id, title: String(details?.title ?? "Comunicado"), message: String(details?.message ?? ""), createdAt: alert.created_at } : null,
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível verificar o estado da plataforma." }, { status: 500 });
  }
}
