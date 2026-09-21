import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabase/admin";

function cpfDigits(value: unknown) { return String(value ?? "").replace(/\D/g, ""); }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const admin = getSupabaseAdminClient();

    if (body.event === "failure") {
      const cpf = cpfDigits(body.identifier);
      if (cpf.length !== 11) return NextResponse.json({ ok: true });
      const { data: patient } = await admin.from("patients")
        .select("id, clinic_id, auth_user_id")
        .eq("cpf", cpf)
        .not("auth_user_id", "is", null)
        .maybeSingle();
      if (!patient?.auth_user_id) return NextResponse.json({ ok: true });
      const { data: current } = await admin.from("login_security")
        .select("failed_attempts, locked_at")
        .eq("user_id", patient.auth_user_id)
        .maybeSingle();
      if (current?.locked_at) return NextResponse.json({ locked: true });
      const failedAttempts = Number(current?.failed_attempts ?? 0) + 1;
      const locked = failedAttempts >= 3;
      await admin.from("login_security").upsert({
        user_id: patient.auth_user_id, clinic_id: patient.clinic_id, patient_id: patient.id,
        failed_attempts: failedAttempts, last_failed_at: new Date().toISOString(),
        locked_at: locked ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
      });
      if (locked) {
        await admin.auth.admin.updateUserById(patient.auth_user_id, { ban_duration: "876000h" });
        await admin.from("patients").update({ access_status: "bloqueado" }).eq("id", patient.id);
      }
      return NextResponse.json({ locked, remaining: Math.max(0, 3 - failedAttempts) });
    }

    if (body.event === "success") {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!token) return NextResponse.json({ ok: true });
      const { data: auth } = await admin.auth.getUser(token);
      if (!auth.user) return NextResponse.json({ ok: true });
      const now = new Date().toISOString();
      const { data: patient } = await admin.from("patients").select("id, clinic_id").eq("auth_user_id", auth.user.id).maybeSingle();
      if (patient) {
        await admin.from("patients").update({ last_login_at: now }).eq("id", patient.id);
        await admin.from("login_security").upsert({ user_id: auth.user.id, clinic_id: patient.clinic_id, patient_id: patient.id, failed_attempts: 0, locked_at: null, last_login_at: now, updated_at: now });
      } else await admin.from("profiles").update({ last_login_at: now }).eq("id", auth.user.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true });
  } catch {
    // A indisponibilidade da telemetria não pode impedir o login normal.
    return NextResponse.json({ ok: true });
  }
}
