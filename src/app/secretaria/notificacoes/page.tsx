"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { PatientManualNotification } from "../../paciente/patient-portal-store";
import {
  createSecretaryNotification,
  loadSecretaryNotifications,
  loadSecretaryPatients,
  type SecretaryContext,
} from "../../../lib/supabase/secretary-records";
import type { DemoPatientRecord } from "../../medico/patient-store";

const icons = ["📣", "💊", "📅", "⚠️", "✅", "💗"];

export default function SecretariaNotificationsPage() {
  const [context, setContext] = useState<SecretaryContext | null>(null);
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [notifications, setNotifications] = useState<Record<string, PatientManualNotification[]>>({});
  const [recipient, setRecipient] = useState("todos");
  const [icon, setIcon] = useState("📣");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const workspace = await loadSecretaryPatients();
      const loadedNotifications = await loadSecretaryNotifications(workspace.patients.map((patient) => patient.id));
      setContext(workspace.context);
      setPatients(workspace.patients);
      setNotifications(loadedNotifications);
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
    const targetIds = recipient === "todos" ? patients.map((patient) => patient.id) : [recipient];
    setSaving(true);
    try {
      await createSecretaryNotification(context, targetIds, { icon, title, text });
      setTitle("");
      setText("");
      setRecipient("todos");
      setMessage(`Notificação enviada para ${targetIds.length === 1 ? "o paciente selecionado" : `${targetIds.length} pacientes`}.`);
      setError("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a notificação.");
    } finally {
      setSaving(false);
    }
  }

  const patientName = (patientId: string) => patients.find((patient) => patient.id === patientId)?.name ?? "Paciente";

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
            <Link href="/" className="block rounded-2xl px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10">Sair</Link>
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

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <form onSubmit={submit} className="rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-xl font-bold text-[#433438]">Novo aviso</h2>
              <p className="mt-1 text-sm text-[#817578]">O aviso ficará salvo no histórico do portal.</p>
              <label className="mt-6 block text-sm font-semibold text-[#544449]">Destinatário
                <select value={recipient} onChange={(event) => setRecipient(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 font-normal outline-none focus:border-[#b91142]">
                  <option value="todos">Todos os pacientes ({patients.length})</option>
                  {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · CPF {patient.cpf}</option>)}
                </select>
              </label>
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
