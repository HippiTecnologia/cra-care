"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { doctorUsername, normalizeUsername } from "../../../lib/auth/credentials";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { loadSecretaryContext, loadSecretaryUsers } from "../../../lib/supabase/secretary-records";

type StaffRole = "medico" | "secretaria" | "laboratorio";
type UserAccount = { id: string; name: string; username: string; role: string; crm?: string; specialty?: string };

const labels: Record<string, string> = {
  medico: "Médico",
  secretaria: "Secretaria",
  laboratorio: "Laboratório",
  admin: "Administrador",
  super_admin: "Administrador",
};

export default function SecretariaSettingsPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<StaffRole>("medico");
  const [crm, setCrm] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [initialPassword, setInitialPassword] = useState("1234");
  const [message, setMessage] = useState("");
  const [recoverySearch, setRecoverySearch] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const context = await loadSecretaryContext();
    const rows = await loadSecretaryUsers(context);
    setUsers(rows.map((row) => ({
      id: String(row.id),
      name: String(row.full_name),
      username: String(row.username ?? ""),
      role: String(row.role),
      crm: row.crm ? String(row.crm) : undefined,
      specialty: row.specialty ? String(row.specialty) : undefined,
    })));
  }

  useEffect(() => {
    queueMicrotask(() => void refresh().catch(() => setMessage("Não foi possível carregar os acessos reais.")));
  }, []);

  const visibleUsers = useMemo(() => {
    const term = recoverySearch.trim().toLocaleLowerCase("pt-BR");
    return users.filter((user) => !term || `${user.name} ${user.username} ${labels[user.role] ?? user.role}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [recoverySearch, users]);

  function updateName(value: string) {
    setName(value);
    if (role === "medico") setUsername(doctorUsername(value));
  }

  async function authorizedRequest(method: "POST" | "PUT", body: Record<string, unknown>) {
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    if (!session) throw new Error("Sessão expirada.");
    const response = await fetch("/api/access", {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { error?: string; username?: string; initialPassword?: string; temporaryPassword?: string };
    if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir.");
    return result;
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !username.trim()) return setMessage("Informe nome e usuário para criar o acesso.");
    if (role === "medico" && !crm.replace(/\D/g, "")) return setMessage("Informe o CRM do médico.");
    setSaving(true);
    try {
      const result = await authorizedRequest("POST", {
        fullName: name.trim(),
        username: normalizeUsername(username),
        role,
        crm: crm || undefined,
        specialty: specialty || undefined,
        initialPassword: role === "medico" ? undefined : initialPassword,
      });
      await refresh();
      setMessage(`Acesso criado. Usuário: ${result.username}. Senha inicial: ${result.initialPassword}.`);
      setName(""); setUsername(""); setCrm(""); setSpecialty(""); setInitialPassword("1234");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível criar o acesso.");
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(user: UserAccount) {
    try {
      const result = await authorizedRequest("PUT", { userId: user.id, temporaryPassword: "1234" });
      setMessage(`Senha redefinida. Usuário: ${result.username}. Senha: ${result.temporaryPassword}.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível redefinir a senha.");
    }
  }

  return <main className="min-h-screen bg-[#f8f5f2] p-4 text-[#34292d] sm:p-7"><div className="mx-auto max-w-5xl"><header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#a3113a]">Secretaria</p><h1 className="mt-2 text-3xl font-bold">Configurações e acessos</h1><p className="mt-2 text-sm text-[#817578]">Crie acessos e redefina senhas com segurança.</p></div><Link href="/secretaria" className="rounded-xl border border-[#e6dbd6] bg-white px-4 py-3 text-sm font-semibold text-[#a3113a]">← Voltar</Link></header>{message && <div className="mt-5 rounded-2xl bg-[#edf8f3] px-4 py-3 text-sm font-semibold text-[#187157]">{message}</div>}<section className="mt-7 grid gap-6 lg:grid-cols-[.85fr_1.15fr]"><form onSubmit={createUser} className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Novo usuário</h2><p className="mt-1 text-sm text-[#817578]">Pacientes são criados pelo fluxo Médico → Secretaria.</p><label className="mt-5 block text-sm font-medium">Nome completo<input value={name} onChange={(event) => updateName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label><label className="mt-4 block text-sm font-medium">Usuário<input value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label><label className="mt-4 block text-sm font-medium">Perfil<select value={role} onChange={(event) => { const next = event.target.value as StaffRole; setRole(next); setUsername(next === "medico" ? doctorUsername(name) : ""); }} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4"><option value="medico">Médico</option><option value="secretaria">Secretaria</option><option value="laboratorio">Laboratório</option></select></label>{role === "medico" ? <><label className="mt-4 block text-sm font-medium">CRM<input value={crm} onChange={(event) => setCrm(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label><label className="mt-4 block text-sm font-medium">Especialidade<input value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label></> : <label className="mt-4 block text-sm font-medium">Senha inicial<input value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4" /></label>}<button disabled={saving} className="mt-5 w-full rounded-xl bg-[#a3113a] px-4 py-3 text-sm font-semibold text-white">{saving ? "Criando..." : "Criar acesso"}</button></form><section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Usuários e recuperação de senha</h2><input value={recoverySearch} onChange={(event) => setRecoverySearch(event.target.value)} placeholder="Buscar nome, usuário ou perfil" className="mt-4 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /><p className="mt-2 text-xs text-[#817578]">{visibleUsers.length} usuário(s) encontrado(s)</p><div className="mt-4 space-y-3">{visibleUsers.map((user) => <article key={user.id} className="flex flex-col gap-3 rounded-2xl bg-[#fbf7f5] p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm">{user.name}</strong><p className="mt-1 text-xs text-[#817578]">{user.username} · {labels[user.role] ?? user.role}{user.crm ? ` · CRM ${user.crm}` : ""}</p></div><button type="button" onClick={() => void resetPassword(user)} className="self-start rounded-xl border border-[#e6dbd6] bg-white px-4 py-2.5 text-xs font-bold text-[#a3113a]">Redefinir senha</button></article>)}{visibleUsers.length === 0 && <p className="rounded-2xl bg-[#fbf7f5] p-5 text-center text-sm text-[#817578]">Nenhum usuário encontrado.</p>}</div></section></section></div></main>;
}
