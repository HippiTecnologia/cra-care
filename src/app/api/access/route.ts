import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authEmailForPatientCpf, authEmailForUsername, doctorInitialPassword, patientInitialPassword, requiresPasswordChange } from "../../../lib/auth/credentials";
import { getSupabaseAdminClient } from "../../../lib/supabase/admin";

type StaffRole = "admin" | "secretaria" | "medico" | "laboratorio" | "enfermagem";
type ManagedRole = Exclude<StaffRole, "admin">;

function createTemporaryPassword() {
  return `CRA-${randomBytes(9).toString("base64url")}!`;
}

function unauthorized(message = "Acesso não autorizado.") { return NextResponse.json({ error: message }, { status: 401 }); }

async function actor(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getSupabaseAdminClient();
  const { data: user } = await admin.auth.getUser(token);
  if (!user.user) return null;
  const { data: profile } = await admin.from("profiles").select("id, clinic_id, role").eq("id", user.user.id).maybeSingle();
  return profile?.clinic_id && ["admin", "secretaria"].includes(profile.role)
    ? { ...profile, clinic_id: profile.clinic_id }
    : null;
}

async function audit(clinicId: string, actorId: string, action: string, entity: string, entityId: string, details: Record<string, unknown> = {}) {
  await getSupabaseAdminClient().from("audit_logs").insert({ clinic_id: clinicId, actor_id: actorId, action, entity, entity_id: entityId, details });
}

async function findAccount(clinicId: string, userId: string) {
  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, clinic_id, role, crm, username").eq("id", userId).eq("clinic_id", clinicId).maybeSingle();
  if (profile) return { kind: "profile" as const, ...profile };
  const { data: patient } = await admin.from("patients").select("id, clinic_id, auth_user_id, username, cpf, birth_date").eq("auth_user_id", userId).eq("clinic_id", clinicId).maybeSingle();
  return patient?.auth_user_id ? { kind: "patient" as const, ...patient, id: patient.auth_user_id, patientId: patient.id } : null;
}

function allowed(currentActor: { id: string; role: string }, account: Awaited<ReturnType<typeof findAccount>>) {
  if (!account || account.id === currentActor.id) return false;
  return !(account.kind === "profile" && ["admin", "super_admin"].includes(account.role) && !["admin", "super_admin"].includes(currentActor.role));
}

export async function POST(request: NextRequest) {
  try {
    const currentActor = await actor(request);
    if (!currentActor) return unauthorized();
    const body = await request.json();
    const admin = getSupabaseAdminClient();
    if (body.kind === "patient") {
      if (!body.patientId || !body.cpf || !body.birthDate) return NextResponse.json({ error: "Dados do paciente incompletos." }, { status: 400 });
      const cpf = String(body.cpf).replace(/\D/g, "");
      const initialPassword = patientInitialPassword(body.birthDate);
      const { data: created, error } = await admin.auth.admin.createUser({ email: authEmailForPatientCpf(cpf), password: initialPassword, email_confirm: true, user_metadata: { username: cpf, role: "paciente" } });
      if (error || !created.user) return NextResponse.json({ error: error?.message ?? "Não foi possível criar o acesso." }, { status: 400 });
      const { error: patientError } = await admin.from("patients").update({ auth_user_id: created.user.id, username: cpf, must_change_password: false, access_status: "ativo" }).eq("id", body.patientId).eq("clinic_id", currentActor.clinic_id);
      if (patientError) { await admin.auth.admin.deleteUser(created.user.id); return NextResponse.json({ error: patientError.message }, { status: 400 }); }
      await audit(currentActor.clinic_id, currentActor.id, "create_access", "patient", body.patientId, { username: cpf });
      return NextResponse.json({ username: cpf, initialPassword });
    }
    const role = body.role as StaffRole;
    if (!body.fullName || !body.username || !["admin", "secretaria", "medico", "laboratorio", "enfermagem"].includes(role)) return NextResponse.json({ error: "Dados do usuário incompletos." }, { status: 400 });
    if (role === "admin" && !["admin", "super_admin"].includes(currentActor.role)) return unauthorized("Somente o ADM pode criar outro acesso administrativo.");
    const initialPassword = role === "medico" ? doctorInitialPassword(body.crm ?? "") : body.initialPassword;
    if (!initialPassword) return NextResponse.json({ error: "Senha inicial não informada." }, { status: 400 });
    const username = String(body.username);
    const { data: created, error } = await admin.auth.admin.createUser({ email: authEmailForUsername(username), password: initialPassword, email_confirm: true, user_metadata: { username, role } });
    if (error || !created.user) return NextResponse.json({ error: error?.message ?? "Não foi possível criar o acesso." }, { status: 400 });
    const { error: profileError } = await admin.from("profiles").insert({ id: created.user.id, clinic_id: currentActor.clinic_id, role, full_name: body.fullName, crm: body.crm ?? null, specialty: body.specialty ?? null, username, must_change_password: requiresPasswordChange(role), access_status: "ativo" });
    if (profileError) { await admin.auth.admin.deleteUser(created.user.id); return NextResponse.json({ error: profileError.message }, { status: 400 }); }
    await audit(currentActor.clinic_id, currentActor.id, "create_access", "profile", created.user.id, { role, username });
    return NextResponse.json({ username, initialPassword, mustChangePassword: requiresPasswordChange(role) });
  } catch { return NextResponse.json({ error: "Não foi possível criar o acesso agora." }, { status: 500 }); }
}

export async function PUT(request: NextRequest) {
  try {
    const currentActor = await actor(request);
    if (!currentActor) return unauthorized();
    const body = await request.json();
    const account = await findAccount(currentActor.clinic_id, String(body.userId ?? ""));
    if (!allowed(currentActor, account)) return unauthorized("Você não pode redefinir este acesso.");
    if (!account) return NextResponse.json({ error: "Acesso não encontrado nesta clínica." }, { status: 404 });
    const admin = getSupabaseAdminClient();
    const role = account.kind === "profile" ? account.role as StaffRole : "paciente";
    // A senha anterior nunca é recuperada. Para pacientes, a redefinição volta
    // ao padrão automático da clínica: data de nascimento (ddmmaaaa). Para a
    // equipe, é gerada uma senha temporária forte.
    const temporaryPassword = account.kind === "patient"
      ? patientInitialPassword(account.birth_date)
      : createTemporaryPassword();
    const update = account.kind === "patient"
      ? { email: authEmailForPatientCpf(String(account.cpf).replace(/\D/g, "")), password: temporaryPassword, user_metadata: { username: String(account.cpf).replace(/\D/g, ""), role: "paciente" }, ban_duration: "none" as const }
      : { password: temporaryPassword, ban_duration: "none" as const };
    const { error } = await admin.auth.admin.updateUserById(account.id, update);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const reset = { access_status: "ativo", deactivated_at: null, deactivation_reason: null, deactivated_by: null };
    if (account.kind === "patient") await admin.from("patients").update({ ...reset, username: String(account.cpf).replace(/\D/g, "") }).eq("id", account.patientId);
    else await admin.from("profiles").update({ ...reset, must_change_password: requiresPasswordChange(role) }).eq("id", account.id);
    await admin.from("login_security").upsert({ user_id: account.id, clinic_id: currentActor.clinic_id, patient_id: account.kind === "patient" ? account.patientId : null, failed_attempts: 0, locked_at: null, updated_at: new Date().toISOString() });
    await audit(currentActor.clinic_id, currentActor.id, "reset_password", account.kind, account.kind === "patient" ? account.patientId : account.id, { username: account.username });
    return NextResponse.json({ username: account.kind === "patient" ? String(account.cpf).replace(/\D/g, "") : account.username, temporaryPassword, mustChangePassword: requiresPasswordChange(role) });
  } catch { return NextResponse.json({ error: "Não foi possível redefinir a senha agora." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentActor = await actor(request);
    if (!currentActor) return unauthorized();
    const body = await request.json();
    const account = await findAccount(currentActor.clinic_id, String(body.userId ?? ""));
    if (!allowed(currentActor, account)) return unauthorized("Você não pode alterar este acesso.");
    if (!account) return NextResponse.json({ error: "Acesso não encontrado nesta clínica." }, { status: 404 });
    const admin = getSupabaseAdminClient();
    const entityId = account.kind === "patient" ? account.patientId : account.id;
    if (body.action === "deactivate") {
      const reason = String(body.reason ?? "").trim();
      if (!reason) return NextResponse.json({ error: "Informe o motivo da desativação." }, { status: 400 });
      const { error } = await admin.auth.admin.updateUserById(account.id, { ban_duration: "876000h" });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const payload = { access_status: "desativado", deactivated_at: new Date().toISOString(), deactivation_reason: reason, deactivated_by: currentActor.id };
      if (account.kind === "patient") await admin.from("patients").update(payload).eq("id", account.patientId); else await admin.from("profiles").update(payload).eq("id", account.id);
      await audit(currentActor.clinic_id, currentActor.id, "deactivate_access", account.kind, entityId, { reason });
      return NextResponse.json({ accessStatus: "desativado" });
    }
    if (body.action === "activate") {
      const { error } = await admin.auth.admin.updateUserById(account.id, { ban_duration: "none" });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const payload = { access_status: "ativo", deactivated_at: null, deactivation_reason: null, deactivated_by: null };
      if (account.kind === "patient") await admin.from("patients").update(payload).eq("id", account.patientId); else await admin.from("profiles").update(payload).eq("id", account.id);
      await admin.from("login_security").upsert({ user_id: account.id, clinic_id: currentActor.clinic_id, patient_id: account.kind === "patient" ? account.patientId : null, failed_attempts: 0, locked_at: null, updated_at: new Date().toISOString() });
      await audit(currentActor.clinic_id, currentActor.id, "activate_access", account.kind, entityId);
      return NextResponse.json({ accessStatus: "ativo" });
    }
    if (body.action === "change_role") {
      const nextRole = String(body.role ?? "") as ManagedRole;
      if (account.kind !== "profile" || !["secretaria", "medico", "laboratorio", "enfermagem"].includes(nextRole)) return NextResponse.json({ error: "Perfil não permitido." }, { status: 400 });
      const { error } = await admin.from("profiles").update({ role: nextRole }).eq("id", account.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await admin.auth.admin.updateUserById(account.id, { user_metadata: { role: nextRole, username: account.username } });
      await audit(currentActor.clinic_id, currentActor.id, "change_role", "profile", account.id, { from: account.role, to: nextRole });
      return NextResponse.json({ role: nextRole });
    }
    return NextResponse.json({ error: "Ação não reconhecida." }, { status: 400 });
  } catch { return NextResponse.json({ error: "Não foi possível atualizar o acesso agora." }, { status: 500 }); }
}
