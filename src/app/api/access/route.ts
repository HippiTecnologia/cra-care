import { NextRequest, NextResponse } from "next/server";
import { authEmailForPatientCpf, authEmailForUsername, doctorInitialPassword, patientInitialPassword, requiresPasswordChange } from "../../../lib/auth/credentials";
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
      if (!body.patientId || !body.cpf || !body.birthDate) return NextResponse.json({ error: "Dados do paciente incompletos." }, { status: 400 });
      const initialPassword = patientInitialPassword(body.birthDate);
      const cpf = String(body.cpf).replace(/\D/g, "");
      const { data: created, error } = await admin.auth.admin.createUser({ email: authEmailForPatientCpf(cpf), password: initialPassword, email_confirm: true, user_metadata: { username: cpf, role: "paciente" } });
      if (error || !created.user) return NextResponse.json({ error: error?.message ?? "Não foi possível criar o acesso." }, { status: 400 });
      const { error: patientError } = await admin.from("patients").update({ auth_user_id: created.user.id, username: cpf, must_change_password: false }).eq("id", body.patientId).eq("clinic_id", clinicId);
      if (patientError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return NextResponse.json({ error: patientError.message }, { status: 400 });
      }
      return NextResponse.json({ username: cpf, initialPassword });
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

export async function PUT(request: NextRequest) {
  try {
    const currentActor = await actor(request);
    if (!currentActor) return unauthorized();
    const clinicId = currentActor.clinic_id;
    if (!clinicId) return unauthorized();
    const body = await request.json();
    if (!body.userId) return NextResponse.json({ error: "Usuário não informado." }, { status: 400 });
    const admin = getSupabaseAdminClient();
    const { data: profile } = await admin.from("profiles")
      .select("id, clinic_id, role, crm, username")
      .eq("id", body.userId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (profile) {
      const role = profile.role as StaffRole;
      if (role === "admin" && !["admin", "super_admin"].includes(currentActor.role)) {
        return unauthorized("Somente o ADM pode redefinir outro acesso administrativo.");
      }
      const temporaryPassword = role === "medico"
        ? doctorInitialPassword(profile.crm ?? "")
        : String(body.temporaryPassword || "1234");
      const { error } = await admin.auth.admin.updateUserById(profile.id, { password: temporaryPassword });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const mustChangePassword = requiresPasswordChange(role);
      await admin.from("profiles").update({ must_change_password: mustChangePassword }).eq("id", profile.id);
      return NextResponse.json({ username: profile.username, temporaryPassword, mustChangePassword });
    }

    const { data: patient } = await admin.from("patients")
      .select("id, auth_user_id, username, cpf, birth_date")
      .eq("auth_user_id", body.userId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!patient?.auth_user_id) return NextResponse.json({ error: "Acesso não encontrado nesta clínica." }, { status: 404 });
    const temporaryPassword = patientInitialPassword(patient.birth_date);
    const cpf = String(patient.cpf).replace(/\D/g, "");
    const { error } = await admin.auth.admin.updateUserById(patient.auth_user_id, { email: authEmailForPatientCpf(cpf), password: temporaryPassword, user_metadata: { username: cpf, role: "paciente" } });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("patients").update({ username: cpf }).eq("id", patient.id).eq("clinic_id", clinicId);
    return NextResponse.json({ username: cpf, temporaryPassword, mustChangePassword: false });
  } catch {
    return NextResponse.json({ error: "Não foi possível redefinir a senha agora." }, { status: 500 });
  }
}
