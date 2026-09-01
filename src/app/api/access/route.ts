import { NextRequest, NextResponse } from "next/server";
import { authEmailForUsername, doctorInitialPassword, patientInitialPassword, requiresPasswordChange } from "../../../lib/auth/credentials";
import { getSupabaseAdminClient } from "../../../lib/supabase/admin";

type StaffRole = "admin" | "secretaria" | "medico" | "laboratorio";

function unauthorized(message = "Acesso não autorizado.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

async function actor(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getSupabaseAdminClient();
  const { data: user } = await admin.auth.getUser(token);
  if (!user.user) return null;
  const { data: profile } = await admin.from("profiles").select("id, clinic_id, role").eq("id", user.user.id).maybeSingle();
  if (!profile?.clinic_id || !["admin", "super_admin", "secretaria"].includes(profile.role)) return null;
  return profile;
}

export async function POST(request: NextRequest) {
  try {
    const currentActor = await actor(request);
    if (!currentActor) return unauthorized();
    const clinicId = currentActor.clinic_id;
    if (!clinicId) return unauthorized();
    const body = await request.json();
    const admin = getSupabaseAdminClient();

    if (body.kind === "patient") {
      if (!body.patientId || !body.username || !body.birthDate) return NextResponse.json({ error: "Dados do paciente incompletos." }, { status: 400 });
      const initialPassword = patientInitialPassword(body.birthDate);
      const { data: created, error } = await admin.auth.admin.createUser({ email: authEmailForUsername(body.username), password: initialPassword, email_confirm: true, user_metadata: { username: body.username, role: "paciente" } });
      if (error || !created.user) return NextResponse.json({ error: error?.message ?? "Não foi possível criar o acesso." }, { status: 400 });
      const { error: patientError } = await admin.from("patients").update({ auth_user_id: created.user.id, username: body.username, must_change_password: false }).eq("id", body.patientId).eq("clinic_id", clinicId);
      if (patientError) return NextResponse.json({ error: patientError.message }, { status: 400 });
      return NextResponse.json({ username: body.username, initialPassword });
    }

    const role = body.role as StaffRole;
    if (!body.fullName || !body.username || !["admin", "secretaria", "medico", "laboratorio"].includes(role)) return NextResponse.json({ error: "Dados do usuário incompletos." }, { status: 400 });
    if (role === "admin" && !["admin", "super_admin"].includes(currentActor.role)) return unauthorized("Somente o ADM pode criar outro acesso administrativo.");
    const initialPassword = role === "medico" ? doctorInitialPassword(body.crm ?? "") : body.initialPassword;
    if (!initialPassword) return NextResponse.json({ error: "Senha inicial não informada." }, { status: 400 });
    const { data: created, error } = await admin.auth.admin.createUser({ email: authEmailForUsername(body.username), password: initialPassword, email_confirm: true, user_metadata: { username: body.username, role } });
    if (error || !created.user) return NextResponse.json({ error: error?.message ?? "Não foi possível criar o acesso." }, { status: 400 });
    const { error: profileError } = await admin.from("profiles").insert({ id: created.user.id, clinic_id: clinicId, role, full_name: body.fullName, crm: body.crm ?? null, specialty: body.specialty ?? null, username: body.username, must_change_password: requiresPasswordChange(role) });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
    return NextResponse.json({ username: body.username, initialPassword, mustChangePassword: requiresPasswordChange(role) });
  } catch {
    return NextResponse.json({ error: "Não foi possível criar o acesso agora." }, { status: 500 });
  }
}
