"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { PatientManualNotification } from "../../paciente/patient-portal-store";
import {
  createSecretaryNotification,
  loadTeamNotifications,
  loadSecretaryNotifications,
  loadSecretaryPatients,
  markTeamNotificationRead,
  type TeamNotification,
  type SecretaryContext,
} from "../../../lib/supabase/secretary-records";
import type { DemoPatientRecord } from "../../medico/patient-store";
import { getSupabaseClient } from "../../../lib/supabase/client";

const icons = ["📣", "💊", "📅", "⚠️", "✅", "💗"];

export default function SecretariaNotificationsPage() {
  const [context, setContext] = useState<SecretaryContext | null>(null);
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [notifications, setNotifications] = useState<Record<string, PatientManualNotification[]>>({});
  const [teamNotifications, setTeamNotifications] = useState<TeamNotification[]>([]);
  const [recipient, setRecipient] = useState("todos");
  const [icon, setIcon] = useState("📣");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [birthdayMonth, setBirthdayMonth] = useState("todos");
  const [orderDate, setOrderDate] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

  async function load() {
    try {
      const workspace = await loadSecretaryPatients();
      const [loadedNotifications, loadedTeamNotifications] = await Promise.all([
        loadSecretaryNotifications(workspace.patients.map((patient) => patient.id)),
        loadTeamNotifications(workspace.context),
      ]);
      setContext(workspace.context);
      setPatients(workspace.patients);
      setNotifications(loadedNotifications);
      setTeamNotifications(loadedTeamNotifications);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as notificações.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const recentNotifications = useMemo(() => Object.entries(notifications)
    .flatMap(([patientId, items]) => items.map((item) => ({ ...item, patientId })))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .slice(0, 30), [notifications]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context) {
      setError("A sessão da Secretaria ainda não foi carregada.");
      return;
    }
    const targetIds = recipient === "todos" ? filteredPatients.map((patient) => patient.id) : recipient === "selecionados" ? selectedRecipients : [recipient];
    if (!targetIds.length) { setError("Selecione ao menos um paciente para receber a notificação."); return; }
    setSaving(true);
    try {
      await createSecretaryNotification(context, targetIds, { icon, title, text });
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      const pushResponse = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ patientIds: targetIds, icon, title, text }),
      });
      const pushResult = await pushResponse.json().catch(() => ({ sent: 0 }));
      setTitle("");
      setText("");
      setRecipient("todos");
      setMessage(`Notificação enviada para ${targetIds.length === 1 ? "o paciente selecionado" : `${targetIds.length} pacientes`}${pushResult.sent ? ` · ${pushResult.sent} dispositivo(s) avisado(s) no celular.` : " · O aviso ficou no sino; o paciente ainda não habilitou o celular para receber push."}`);
      setError("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a notificação.");
    } finally {
      setSaving(false);
    }
  }

  const patientName = (patientId: string) => patients.find((patient) => patient.id === patientId)?.name ?? "Paciente";
  const doctors = Array.from(new Set(patients.map((patient) => patient.doctor).filter(Boolean)));
  const filteredPatients = patients.filter((patient) => {
    const searchable = `${patient.name} ${patient.cpf}`.toLocaleLowerCase();
    if (search && !searchable.includes(search.toLocaleLowerCase())) return false;
    if (doctorFilter !== "todos" && patient.doctor !== doctorFilter) return false;
    if (statusFilter !== "todos" && patient.status !== statusFilter) return false;
    if (birthdayMonth !== "todos" && String(new Date(`${patient.birthDate}T12:00:00`).getMonth() + 1) !== birthdayMonth) return false;
    if (orderDate && !patient.createdAt.startsWith(orderDate)) return false;
    return true;
  });
  const toggleRecipient = (patientId: string) => setSelectedRecipients((current) => current.includes(patientId) ? current.filter((id) => id !== patientId) : [...current, patientId]);
  const openTeamNotification = (notification: TeamNotification) => {
    if (!context || notification.readAt) return;
    void markTeamNotificationRead(context, notification.id).then(() => {
      setTeamNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    });
  };

  return (
    <main className="min-h-screen bg-[#f8f5f2] text-[#34292d]">
      <div className="min-h-screen lg:grid lg:grid-cols-[285px_minmax(0,1fr)]">
        <aside className="bg-gradient-to-b from-[#b31340] to-[#790b2a] px-7 py-8 text-white lg:min-h-screen">
          <Image src="/logo-cra-branca.png" alt="CRA" width={170} height={115} priority className="h-auto w-36" />
          <p className="mt-4 text-sm text-white/70">Painel da Secretaria</p>
          <nav className="mt-8 space-y-2">
            <Link href="/secretaria" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Dashboard</Link>
            <Link href="/secretaria/lotes" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Lotes</Link>
            <Link href="/secretaria/estoque" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Vacinas em estoque</Link>
            <Link href="/secretaria/notificacoes" className="block rounded-2xl bg-white/15 px-4 py-3 text-sm font-semibold">Notificações aos pacientes</Link>
            <Link href="/secretaria/configuracoes" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Configurações</Link>
            <Link href="/sair" className="block rounded-2xl px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10">Sair</Link>
          </nav>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c173c]">Secretaria · comunicação</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#86203b] sm:text-4xl">Notificações aos pacientes</h1>
              <p className="mt-2 text-sm text-[#776b6e]">Envie avisos que aparecerão no sino do portal de cada paciente.</p>
            </div>
            <Link href="/secretaria" className="rounded-2xl border border-[#eadfd9] bg-white px-5 py-3 text-sm font-semibold text-[#a3113a] shadow-sm">← Voltar ao dashboard</Link>
          </header>

          {message && <div className="mb-5 rounded-2xl border border-[#cfe9df] bg-[#edf8f3] px-4 py-3 text-sm text-[#187157]">{message}</div>}
          {error && <div role="alert" className="mb-5 rounded-2xl border border-[#f3d5d8] bg-[#fff2f3] px-4 py-3 text-sm text-[#a3113a]">{error}</div>}

          <section className="mb-6 rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold text-[#433438]">Avisos internos da equipe</h2><p className="mt-1 text-sm text-[#817578]">Conclusões registradas pelos médicos, sem notificações duplicadas.</p></div><span className="rounded-full bg-[#fff0f3] px-3 py-1 text-xs font-bold text-[#a3113a]">{teamNotifications.filter((item) => !item.readAt).length} não lido(s)</span></div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">{teamNotifications.length === 0 ? <p className="rounded-2xl border border-dashed border-[#e6dbd6] p-6 text-center text-sm text-[#817578] lg:col-span-2">Nenhum aviso interno recebido.</p> : teamNotifications.map((item) => <Link key={item.id} href={item.href} onClick={() => openTeamNotification(item)} className={`rounded-2xl border p-4 transition hover:border-[#d9b4bf] ${item.readAt ? "border-[#eee6e2] bg-[#fdfbf9]" : "border-[#e8b8c4] bg-[#fff5f7]"}`}><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-[#433438]">{item.title}</h3><p className="mt-2 text-sm text-[#66595d]">{item.message}</p></div>{!item.readAt && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#b91142]" />}</div><p className="mt-3 text-[11px] text-[#817578]">{new Date(item.createdAt).toLocaleString("pt-BR")} · abrir paciente →</p></Link>)}</div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <form onSubmit={submit} className="rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-xl font-bold text-[#433438]">Novo aviso</h2>
              <p className="mt-1 text-sm text-[#817578]">O aviso ficará salvo no histórico do portal.</p>
              <label className="mt-6 block text-sm font-semibold text-[#544449]">Destinatário
                <select value={recipient} onChange={(event) => setRecipient(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 font-normal outline-none focus:border-[#b91142]">
                  <option value="todos">Todos do filtro ({filteredPatients.length})</option>
                  <option value="selecionados">Somente pacientes selecionados ({selectedRecipients.length})</option>
                  {filteredPatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · CPF {patient.cpf}</option>)}
                </select>
              </label>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou CPF" className="h-11 rounded-xl border border-[#e9dfda] px-3 text-sm outline-none focus:border-[#b91142]" />
                <input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} className="h-11 rounded-xl border border-[#e9dfda] px-3 text-sm outline-none focus:border-[#b91142]" title="Data de cadastro/pedido" />
                <select value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)} className="h-11 rounded-xl border border-[#e9dfda] bg-white px-3 text-sm outline-none focus:border-[#b91142]"><option value="todos">Todos os médicos</option>{doctors.map((doctor) => <option key={doctor} value={doctor}>{doctor}</option>)}</select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-[#e9dfda] bg-white px-3 text-sm outline-none focus:border-[#b91142]"><option value="todos">Todas as colunas</option>{Array.from(new Set(patients.map((patient) => patient.status).filter(Boolean))).map((status) => <option key={status} value={status}>{status}</option>)}</select>
                <select value={birthdayMonth} onChange={(event) => setBirthdayMonth(event.target.value)} className="h-11 rounded-xl border border-[#e9dfda] bg-white px-3 text-sm outline-none focus:border-[#b91142]"><option value="todos">Todos os aniversários</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{new Date(2026, index, 1).toLocaleString("pt-BR", { month: "long" })}</option>)}</select>
              </div>
              <div className="mt-4 max-h-44 space-y-2 overflow-y-auto rounded-xl border border-[#eee5e0] p-3 text-xs">{filteredPatients.map((patient) => <label key={patient.id} className="flex items-center gap-2"><input type="checkbox" checked={selectedRecipients.includes(patient.id)} onChange={() => toggleRecipient(patient.id)} className="accent-[#a3113a]" />{patient.name} · {patient.doctor || "Sem médico"}</label>)}{filteredPatients.length === 0 && <p className="text-[#817578]">Nenhum paciente encontrado.</p>}</div>
              <div className="mt-5 grid gap-4 sm:grid-cols-[120px_1fr]">
                <label className="text-sm font-semibold text-[#544449]">Ícone
                  <select value={icon} onChange={(event) => setIcon(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 text-xl outline-none focus:border-[#b91142]">{icons.map((item) => <option key={item}>{item}</option>)}</select>
                </label>
                <label className="text-sm font-semibold text-[#544449]">Título
                  <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Próxima aplicação" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 font-normal outline-none focus:border-[#b91142]" />
                </label>
              </div>
              <label className="mt-5 block text-sm font-semibold text-[#544449]">Mensagem
                <textarea required value={text} onChange={(event) => setText(event.target.value)} rows={6} placeholder="Digite a orientação que o paciente verá no portal." className="mt-2 w-full rounded-xl border border-[#e9dfda] px-4 py-3 font-normal outline-none focus:border-[#b91142]" />
              </label>
              <button type="submit" disabled={saving || !patients.length} className="mt-6 w-full rounded-xl bg-[#a3113a] px-5 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Enviando..." : "Enviar notificação"}</button>
            </form>

            <section className="rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-xl font-bold text-[#433438]">Avisos recentes</h2>
              <p className="mt-1 text-sm text-[#817578]">Mensagens já publicadas pela Secretaria.</p>
              <div className="mt-6 space-y-3">
                {recentNotifications.length === 0 ? <p className="rounded-2xl border border-dashed border-[#e6dbd6] p-8 text-center text-sm text-[#817578]">Nenhuma notificação enviada ainda.</p> : recentNotifications.map((item) => (
                  <article key={`${item.patientId}-${item.id}`} className="rounded-2xl border border-[#eee6e2] bg-[#fdfbf9] p-4">
                    <div className="flex items-start gap-3"><span className="text-xl">{item.icon}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-[#433438]">{item.title}</h3><span className="text-[11px] text-[#817578]">{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span></div><p className="mt-1 text-xs font-semibold text-[#a3113a]">{patientName(item.patientId)}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#66595d]">{item.text}</p></div></div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
