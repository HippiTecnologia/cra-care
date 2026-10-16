"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { doctorUsername, normalizeUsername } from "../../../lib/auth/credentials";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { archiveSecretaryPatient, loadSecretaryContext, loadSecretaryPatientRecords, loadSecretaryUsers, permanentlyDeleteSecretaryPatient, restoreSecretaryPatient, type SecretaryPatientRecord } from "../../../lib/supabase/secretary-records";

type StaffRole = "medico" | "secretaria" | "laboratorio" | "enfermagem";
type UserAccount = {
  id: string; patientId?: string; name: string; username: string; role: string; crm?: string; specialty?: string;
  accountType: "equipe" | "paciente"; accessStatus: string; createdAt: string; lastLoginAt?: string;
  deactivatedAt?: string; deactivationReason?: string; failedAttempts?: number;
};

const labels: Record<string, string> = { medico: "Médico", secretaria: "Secretaria", laboratorio: "Laboratório", enfermagem: "Enfermagem", paciente: "Paciente", admin: "Administrador", super_admin: "Administrador" };
const statuses: Record<string, string> = { ativo: "Ativo", bloqueado: "Bloqueado", desativado: "Desativado" };
const date = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

export default function SecretariaSettingsPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [patientRecords, setPatientRecords] = useState<SecretaryPatientRecord[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientSavingId, setPatientSavingId] = useState<string | null>(null);
  const [name, setName] = useState(""); const [username, setUsername] = useState(""); const [role, setRole] = useState<StaffRole>("medico");
  const [crm, setCrm] = useState(""); const [specialty, setSpecialty] = useState(""); const [initialPassword, setInitialPassword] = useState("1234");
  const [message, setMessage] = useState(""); const [search, setSearch] = useState(""); const [roleFilter, setRoleFilter] = useState("todos"); const [statusFilter, setStatusFilter] = useState("todos"); const [saving, setSaving] = useState(false);
  const [temporaryCredential, setTemporaryCredential] = useState<{ name: string; username: string; password: string } | null>(null);
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);

  async function refresh() {
    const context = await loadSecretaryContext();
    const [nextUsers, nextPatients] = await Promise.all([loadSecretaryUsers(context), loadSecretaryPatientRecords(context)]);
    setUsers(nextUsers as UserAccount[]);
    setPatientRecords(nextPatients);
  }
  useEffect(() => { queueMicrotask(() => void refresh().catch(() => setMessage("Não foi possível carregar os acessos reais."))); }, []);
  const visibleUsers = useMemo(() => users.filter((user) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (!term || `${user.name} ${user.username} ${labels[user.role] ?? user.role}`.toLocaleLowerCase("pt-BR").includes(term)) && (roleFilter === "todos" || user.role === roleFilter) && (statusFilter === "todos" || user.accessStatus === statusFilter);
  }), [search, users, roleFilter, statusFilter]);
  const activePatients = useMemo(() => {
    const term = patientSearch.trim().toLocaleLowerCase("pt-BR");
    return patientRecords.filter((patient) => !patient.archivedAt && (!term || `${patient.name} ${patient.cpf}`.toLocaleLowerCase("pt-BR").includes(term)));
  }, [patientRecords, patientSearch]);
  const archivedPatients = useMemo(() => {
    const term = patientSearch.trim().toLocaleLowerCase("pt-BR");
    return patientRecords.filter((patient) => Boolean(patient.archivedAt) && (!term || `${patient.name} ${patient.cpf}`.toLocaleLowerCase("pt-BR").includes(term)));
  }, [patientRecords, patientSearch]);

  function updateName(value: string) { setName(value); if (role === "medico") setUsername(doctorUsername(value)); }
  async function authorizedRequest(method: "POST" | "PUT" | "PATCH", body: Record<string, unknown>) {
    const { data: { session } } = await getSupabaseClient().auth.getSession(); if (!session) throw new Error("Sessão expirada.");
    const response = await fetch("/api/access", { method, headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string; username?: string; initialPassword?: string; temporaryPassword?: string };
    if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir."); return result;
  }
  async function createUser(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || !username.trim()) return setMessage("Informe nome e usuário para criar o acesso."); if (role === "medico" && !crm.replace(/\D/g, "")) return setMessage("Informe o CRM do médico.");
    setSaving(true); try { const result = await authorizedRequest("POST", { fullName: name.trim(), username: normalizeUsername(username), role, crm: crm || undefined, specialty: specialty || undefined, initialPassword: role === "medico" ? undefined : initialPassword }); await refresh(); setMessage(`Acesso criado. Usuário: ${result.username}. Senha inicial: ${result.initialPassword}. Entregue-a somente ao usuário.`); setName(""); setUsername(""); setCrm(""); setSpecialty(""); setInitialPassword("1234"); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível criar o acesso."); } finally { setSaving(false); }
  }
  async function resetPassword(user: UserAccount) { try { const result = await authorizedRequest("PUT", { userId: user.id }); await refresh(); setShowTemporaryPassword(false); setTemporaryCredential({ name: user.name, username: result.username ?? user.username, password: result.temporaryPassword ?? "" }); setMessage(`Senha temporária gerada para ${user.name}. Entregue-a diretamente ao usuário.`); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível redefinir a senha."); } }
  async function copyTemporaryPassword() { if (!temporaryCredential) return; try { await navigator.clipboard.writeText(temporaryCredential.password); setMessage("Senha temporária copiada."); } catch { setMessage("Não foi possível copiar automaticamente. Selecione a senha e copie manualmente."); } }
  async function changeStatus(user: UserAccount) {
    try {
      if (user.accessStatus === "ativo") { const reason = window.prompt(`Motivo para desativar o acesso de ${user.name}:`); if (!reason?.trim()) return; await authorizedRequest("PATCH", { action: "deactivate", userId: user.id, reason }); setMessage(`Acesso de ${user.name} desativado.`); }
      else { await authorizedRequest("PATCH", { action: "activate", userId: user.id }); setMessage(`Acesso de ${user.name} ${user.accessStatus === "bloqueado" ? "desbloqueado" : "reativado"}.`); }
      await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível alterar o acesso."); }
  }
  async function changeRole(user: UserAccount, nextRole: string) { if (nextRole === user.role) return; try { await authorizedRequest("PATCH", { action: "change_role", userId: user.id, role: nextRole }); await refresh(); setMessage(`Perfil de ${user.name} atualizado.`); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível alterar o perfil."); } }
  async function deactivatePatient(patient: SecretaryPatientRecord) {
    const reason = window.prompt(`Motivo para desativar o cadastro de ${patient.name}:`);
    if (!reason?.trim()) return;
    if (!window.confirm(`Desativar o cadastro de ${patient.name}? Ele ficará oculto das outras áreas, sem apagar o histórico, e poderá ser reativado aqui.`)) return;
    setPatientSavingId(patient.id);
    try {
      const context = await loadSecretaryContext();
      await archiveSecretaryPatient(context, patient.id, reason);
      await refresh();
      setMessage(`Cadastro de ${patient.name} desativado. O histórico foi preservado.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível desativar o cadastro."); }
    finally { setPatientSavingId(null); }
  }
  async function reactivatePatient(patient: SecretaryPatientRecord) {
    if (!window.confirm(`Reativar o cadastro de ${patient.name}? Ele voltará a aparecer nas áreas autorizadas.`)) return;
    setPatientSavingId(patient.id);
    try {
      const context = await loadSecretaryContext();
      await restoreSecretaryPatient(context, patient.id);
      await refresh();
      setMessage(`Cadastro de ${patient.name} reativado.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível reativar o cadastro."); }
    finally { setPatientSavingId(null); }
  }
  async function deletePatientPermanently(patient: SecretaryPatientRecord) {
    const phrase = `EXCLUIR ${patient.name}`;
    const confirmation = window.prompt(
      `Esta ação é permanente. Só é permitida quando não há histórico, pagamentos, documentos ou outros registros vinculados.\n\nPara confirmar, digite exatamente:\n${phrase}`,
    );
    if (confirmation?.trim() !== phrase) return;
    setPatientSavingId(patient.id);
    try {
      await permanentlyDeleteSecretaryPatient(patient.id, confirmation.trim());
      await refresh();
      setMessage(`Cadastro de ${patient.name} excluído permanentemente.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível excluir o cadastro. Se houver histórico vinculado, use a desativação para preservar os dados.");
    } finally { setPatientSavingId(null); }
  }

  return <main className="min-h-screen bg-[#f8f5f2] p-4 text-[#34292d] sm:p-7"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#a3113a]">Secretaria</p><h1 className="mt-2 text-3xl font-bold">Configurações e acessos</h1><p className="mt-2 text-sm text-[#817578]">Crie, consulte e administre acessos com segurança.</p></div><Link href="/secretaria" className="rounded-xl border border-[#e6dbd6] bg-white px-4 py-3 text-sm font-semibold text-[#a3113a]">← Voltar</Link></header>
    {message && <div className="mt-5 rounded-2xl bg-[#edf8f3] px-4 py-3 text-sm font-semibold text-[#187157]">{message}</div>}
    {temporaryCredential && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#34292d]/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="temporary-password-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#a3113a]">Senha redefinida</p><h2 id="temporary-password-title" className="mt-2 text-2xl font-bold">Passe esta senha ao usuário</h2><p className="mt-2 text-sm text-[#817578]">Acesso de <strong className="text-[#34292d]">{temporaryCredential.name}</strong>. Esta senha é exibida somente agora e não fica salva em texto aberto.</p><div className="mt-5 rounded-2xl bg-[#fbf3f5] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#817578]">Usuário</p><p className="mt-1 break-all font-bold text-[#34292d]">{temporaryCredential.username}</p><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#817578]">Senha temporária</p><div className="mt-1 flex items-center gap-2 rounded-xl bg-white px-3 py-2"><input readOnly aria-label="Senha temporária" type={showTemporaryPassword ? "text" : "password"} value={temporaryCredential.password} className="min-w-0 flex-1 bg-transparent font-mono text-xl font-bold tracking-wider text-[#a3113a] outline-none" /><button type="button" onClick={() => setShowTemporaryPassword((current) => !current)} aria-label={showTemporaryPassword ? "Ocultar senha temporária" : "Mostrar senha temporária"} className="rounded-lg px-2 py-1 text-sm text-[#a3113a]" title={showTemporaryPassword ? "Ocultar senha" : "Mostrar senha"}>👁</button></div></div><div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => void copyTemporaryPassword()} className="rounded-xl border border-[#e6dbd6] px-4 py-3 text-sm font-semibold text-[#a3113a]">Copiar senha</button><button type="button" onClick={() => setTemporaryCredential(null)} className="rounded-xl bg-[#a3113a] px-4 py-3 text-sm font-semibold text-white">Entendi</button></div></section></div>}
    <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-bold">Pacientes da clínica</h2><p className="mt-1 text-sm text-[#817578]">A Secretaria pode desativar qualquer cadastro ou excluir permanentemente cadastros sem registros vinculados. A desativação preserva o histórico.</p></div>
        <span className="text-sm font-semibold text-[#817578]">{activePatients.length} ativo(s) · {archivedPatients.length} desativado(s)</span>
      </div>
      <input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Buscar paciente por nome ou CPF" className="mt-4 h-12 w-full rounded-xl border border-[#e9dfda] px-4" />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {activePatients.map((patient) => <article key={patient.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fbf7f5] p-4"><div><strong className="text-sm">{patient.name}</strong><p className="mt-1 text-xs text-[#817578]">CPF {patient.cpf || "não informado"} · {patient.responsible}</p><p className="mt-1 text-[11px] text-[#8c8083]">Cadastrado em {date(patient.createdAt)}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={patientSavingId === patient.id} onClick={() => void deactivatePatient(patient)} className="rounded-xl border border-[#e6dbd6] bg-white px-3 py-2 text-xs font-bold text-[#a3113a] disabled:opacity-50">{patientSavingId === patient.id ? "Salvando..." : "Desativar cadastro"}</button><button type="button" disabled={patientSavingId === patient.id} onClick={() => void deletePatientPermanently(patient)} className="rounded-xl border border-[#e6dbd6] bg-white px-3 py-2 text-xs font-bold text-[#66595d] disabled:opacity-50">{patientSavingId === patient.id ? "Aguarde..." : "Excluir definitivamente"}</button></div></article>)}
        {activePatients.length === 0 && <p className="rounded-2xl bg-[#fbf7f5] p-4 text-sm text-[#817578] md:col-span-2">Nenhum paciente ativo encontrado.</p>}
      </div>
      <div className="mt-7 border-t border-[#f0e8e4] pt-5"><h3 className="text-lg font-bold">Pacientes desativados</h3><p className="mt-1 text-sm text-[#817578]">Esta lista fica disponível somente nesta área de configurações da Secretaria.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {archivedPatients.map((patient) => <article key={patient.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fbf7f5] p-4"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{patient.name}</strong><span className="rounded-full bg-[#fdebed] px-2 py-1 text-[10px] font-bold text-[#a3113a]">Desativado</span></div><p className="mt-1 text-xs text-[#817578]">CPF {patient.cpf || "não informado"} · {patient.responsible} · desde {date(patient.archivedAt)}</p>{patient.archiveReason && <p className="mt-1 text-xs text-[#817578]">Motivo: {patient.archiveReason}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={patientSavingId === patient.id} onClick={() => void reactivatePatient(patient)} className="rounded-xl bg-[#a3113a] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{patientSavingId === patient.id ? "Salvando..." : "Reativar paciente"}</button><button type="button" disabled={patientSavingId === patient.id} onClick={() => void deletePatientPermanently(patient)} className="rounded-xl border border-[#e6dbd6] bg-white px-3 py-2 text-xs font-bold text-[#66595d] disabled:opacity-50">{patientSavingId === patient.id ? "Aguarde..." : "Excluir definitivamente"}</button></div></article>)}
          {archivedPatients.length === 0 && <p className="rounded-2xl bg-[#fbf7f5] p-4 text-sm text-[#817578] md:col-span-2">Nenhum paciente desativado encontrado.</p>}
        </div>
      </div>
    </section>
    <section className="mt-7 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><form onSubmit={createUser} className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Novo usuário da equipe</h2><p className="mt-1 text-sm text-[#817578]">Pacientes são criados pelo fluxo Médico → Secretaria.</p><label className="mt-5 block text-sm font-medium">Nome completo<input required value={name} onChange={(event) => updateName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label><label className="mt-4 block text-sm font-medium">Usuário<input required value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label><label className="mt-4 block text-sm font-medium">Perfil<select value={role} onChange={(event) => { const next = event.target.value as StaffRole; setRole(next); setUsername(next === "medico" ? doctorUsername(name) : ""); }} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4"><option value="medico">Médico</option><option value="secretaria">Secretaria</option><option value="laboratorio">Laboratório</option><option value="enfermagem">Enfermagem</option></select></label>{role === "medico" ? <><label className="mt-4 block text-sm font-medium">CRM<input required value={crm} onChange={(event) => setCrm(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label><label className="mt-4 block text-sm font-medium">Especialidade<input value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label></> : <label className="mt-4 block text-sm font-medium">Senha inicial<input required value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label>}<button disabled={saving} className="mt-5 w-full rounded-xl bg-[#a3113a] px-4 py-3 text-sm font-semibold text-white">{saving ? "Criando..." : "Criar acesso"}</button></form>
      <section className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Usuários</h2><p className="mt-1 text-sm text-[#817578]">As senhas atuais nunca são exibidas. Você pode gerar uma senha temporária.</p></div><p className="text-sm font-semibold text-[#817578]">{visibleUsers.length} encontrado(s)</p></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou usuário" className="h-12 rounded-xl border border-[#e9dfda] px-4 sm:col-span-1"/><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-12 rounded-xl border border-[#e9dfda] bg-white px-3"><option value="todos">Todos os perfis</option>{Object.entries(labels).filter(([key]) => !["admin", "super_admin"].includes(key)).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-12 rounded-xl border border-[#e9dfda] bg-white px-3"><option value="todos">Todos os status</option><option value="ativo">Ativos</option><option value="bloqueado">Bloqueados</option><option value="desativado">Desativados</option></select></div><div className="mt-4 space-y-3">{visibleUsers.map((user) => <article key={user.id} className="rounded-2xl bg-[#fbf7f5] p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{user.name}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.accessStatus === "ativo" ? "bg-[#e4f6ed] text-[#187157]" : user.accessStatus === "bloqueado" ? "bg-[#fff3d9] text-[#956600]" : "bg-[#fdebed] text-[#a3113a]"}`}>{statuses[user.accessStatus] ?? user.accessStatus}</span></div><p className="mt-1 text-xs text-[#817578]">{user.username} · {labels[user.role] ?? user.role}{user.crm ? ` · CRM ${user.crm}` : ""}</p><p className="mt-2 text-[11px] text-[#8c8083]">Criado em {date(user.createdAt)} · Último acesso: {date(user.lastLoginAt)}</p>{user.accessStatus === "bloqueado" && <p className="mt-1 text-xs font-medium text-[#956600]">3 tentativas inválidas. Redefina a senha para liberar.</p>}{user.deactivationReason && <p className="mt-1 text-xs text-[#a3113a]">Motivo: {user.deactivationReason}</p>}</div><div className="flex flex-wrap gap-2 lg:justify-end"><button type="button" onClick={() => void resetPassword(user)} className="rounded-xl border border-[#e6dbd6] bg-white px-3 py-2 text-xs font-bold text-[#a3113a]">Redefinir senha</button>{user.accountType === "equipe" && !["admin", "super_admin"].includes(user.role) && <select aria-label={`Alterar perfil de ${user.name}`} value={user.role} onChange={(event) => void changeRole(user, event.target.value)} className="rounded-xl border border-[#e6dbd6] bg-white px-2 py-2 text-xs font-bold text-[#66595d]"><option value="medico">Médico</option><option value="secretaria">Secretaria</option><option value="laboratorio">Laboratório</option><option value="enfermagem">Enfermagem</option></select>}<button type="button" onClick={() => void changeStatus(user)} className="rounded-xl border border-[#e6dbd6] bg-white px-3 py-2 text-xs font-bold text-[#66595d]">{user.accessStatus === "ativo" ? "Desativar" : user.accessStatus === "bloqueado" ? "Desbloquear" : "Reativar"}</button></div></div></article>)}{visibleUsers.length === 0 && <p className="rounded-2xl bg-[#fbf7f5] p-5 text-center text-sm text-[#817578]">Nenhum usuário encontrado.</p>}</div></section></section>
  </div></main>;
}
