"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

type ClinicStatus = "Ativa" | "Em aviso" | "Suspensa";

type Clinic = {
  id: string;
  name: string;
  plan: string;
  users: number;
  patients: number;
  monthlyValue: number;
  dueDate: string;
  status: ClinicStatus;
  contact: string;
};

const clinics: Clinic[] = [
  { id: "cra", name: "CRA Care", plan: "Hospitalar", users: 18, patients: 284, monthlyValue: 2490, dueDate: "10/09/2026", status: "Ativa", contact: "Centro de Rinite e Alergia" },
  { id: "vida", name: "Clínica Vida", plan: "Profissional", users: 7, patients: 96, monthlyValue: 1190, dueDate: "05/09/2026", status: "Em aviso", contact: "Clínica Vida Integrada" },
  { id: "modelo", name: "Hospital Modelo", plan: "Hospitalar", users: 31, patients: 642, monthlyValue: 3490, dueDate: "20/08/2026", status: "Suspensa", contact: "Hospital Modelo S.A." },
];

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function HippiCarePreview() {
  const [selectedId, setSelectedId] = useState("cra");
  const [message, setMessage] = useState("");
  const selectedClinic = clinics.find((clinic) => clinic.id === selectedId) ?? clinics[0];
  const activeCount = clinics.filter((clinic) => clinic.status === "Ativa").length;
  const monthlyRevenue = useMemo(() => clinics.filter((clinic) => clinic.status !== "Suspensa").reduce((total, clinic) => total + clinic.monthlyValue, 0), []);

  function changeStatus(status: ClinicStatus) {
    setMessage(`${selectedClinic.name}: status alterado para ${status.toLowerCase()}. Na versão real, essa alteração será registrada e aplicada pelo servidor.`);
  }

  return (
    <main className="min-h-screen bg-[#070b1c] text-[#eef2ff]">
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[272px_1fr]">
        <aside className="border-r border-violet-300/15 bg-[radial-gradient(circle_at_30%_0%,#382169_0%,#111533_42%,#080b1c_100%)] p-5 text-white sm:p-7 lg:sticky lg:top-0 lg:h-screen">
          <div className="border-b border-white/15 pb-6"><Image src="/hippi-logo.png" alt="Hippi — Automação, Software e Inteligência" width={1024} height={1024} priority className="h-auto w-44" /><p className="mt-3 text-xs text-cyan-100/65">Painel da plataforma</p></div>
          <div className="mt-7 rounded-2xl border border-cyan-200/15 bg-cyan-300/5 p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-cyan-100/60">Acesso da plataforma</p><p className="mt-2 font-semibold">Gustavo Sabino Rodrigues</p><p className="mt-1 text-xs text-cyan-100/65">Gestão da plataforma</p></div>
          <nav className="mt-7 grid gap-2 text-sm font-semibold"><button type="button" className="rounded-xl bg-gradient-to-r from-cyan-300/20 to-violet-400/20 px-4 py-3 text-left ring-1 ring-cyan-200/20">Visão geral</button><button type="button" className="rounded-xl px-4 py-3 text-left text-white/75 hover:bg-white/10">Clínicas e hospitais</button><button type="button" className="rounded-xl px-4 py-3 text-left text-white/75 hover:bg-white/10">Assinaturas e cobrança</button><button type="button" className="rounded-xl px-4 py-3 text-left text-white/75 hover:bg-white/10">Módulos contratados</button><button type="button" className="rounded-xl px-4 py-3 text-left text-white/75 hover:bg-white/10">Auditoria e segurança</button></nav>
          <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4 text-xs leading-5 text-white/70"><strong className="block text-cyan-100">Isolamento por clínica</strong>Dados, usuários e permissões de cada cliente ficam separados.</div>
          <Link href="/" className="mt-7 inline-flex text-sm font-semibold text-cyan-100/80 hover:text-white">← Voltar ao CRA Care</Link>
        </aside>

        <section className="min-w-0 bg-[radial-gradient(circle_at_88%_4%,rgba(67,56,202,.24)_0%,transparent_27%)] p-4 sm:p-7 lg:p-10">
          <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-cyan-300">Hippi Care</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Visão da plataforma</h1><p className="mt-2 text-sm text-slate-400">Controle clientes, planos, cobranças e acesso à plataforma.</p></div><button type="button" onClick={() => setMessage("Nova clínica será cadastrada aqui na versão conectada ao Supabase.")} className="rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3 text-sm font-bold text-[#071025] shadow-[0_0_28px_rgba(34,211,238,.35)]">+ Cadastrar clínica</button></header>

          {message && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100"><span>{message}</span><button type="button" onClick={() => setMessage("")} aria-label="Fechar mensagem">×</button></div>}

          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Clientes ativos" value={String(activeCount)} detail="com acesso completo" /><Metric label="Receita mensal prevista" value={money(monthlyRevenue)} detail="clientes ativos e em aviso" /><Metric label="Usuários da plataforma" value={String(clinics.reduce((total, clinic) => total + clinic.users, 0))} detail="todos os clientes" /><Metric label="Pacientes acompanhados" value={String(clinics.reduce((total, clinic) => total + clinic.patients, 0))} detail="dados isolados por clínica" /></div>

          <div className="mt-7 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
            <section className="rounded-3xl border border-violet-300/15 bg-[#101735]/90 p-5 shadow-[0_20px_45px_rgba(0,0,0,.18)] sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Clínicas e hospitais</h2><p className="mt-1 text-sm text-slate-400">Selecione uma conta para visualizar sua licença.</p></div><span className="rounded-full bg-violet-400/15 px-3 py-2 text-xs font-bold text-violet-200">{clinics.length} clientes</span></div><div className="mt-5 space-y-3">{clinics.map((clinic) => <button key={clinic.id} type="button" onClick={() => { setSelectedId(clinic.id); setMessage(""); }} className={`w-full rounded-2xl border p-4 text-left transition ${clinic.id === selectedId ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_24px_rgba(34,211,238,.10)]" : "border-white/10 bg-white/[.025] hover:bg-white/[.06]"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">{clinic.name}</p><p className="mt-1 text-xs text-slate-400">{clinic.contact} · Plano {clinic.plan}</p></div><StatusBadge status={clinic.status} /></div><div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-3"><span>{clinic.users} usuários</span><span>{clinic.patients} pacientes</span><span>Vencimento: {clinic.dueDate}</span></div></button>)}</div></section>

            <section className="rounded-3xl border border-violet-300/15 bg-[#101735]/90 p-5 shadow-[0_20px_45px_rgba(0,0,0,.18)] sm:p-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-cyan-300">Licença selecionada</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">{selectedClinic.name}</h2><StatusBadge status={selectedClinic.status} /></div><div className="mt-6 grid gap-3 text-sm"><Data label="Plano contratado" value={selectedClinic.plan} /><Data label="Mensalidade" value={money(selectedClinic.monthlyValue)} /><Data label="Próximo vencimento" value={selectedClinic.dueDate} /><Data label="Módulos liberados" value="Clínico, Secretaria, Financeiro e Laboratório" /></div><div className="mt-6 border-t border-white/10 pt-5"><p className="text-sm font-bold">Controle de acesso</p><p className="mt-1 text-xs leading-5 text-slate-400">Na versão real, a mudança valerá no servidor e ficará registrada na auditoria.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => changeStatus("Ativa")} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#062919]">Ativar acesso</button><button type="button" onClick={() => changeStatus("Em aviso")} className="rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-bold text-[#3d2700]">Enviar aviso</button><button type="button" onClick={() => changeStatus("Suspensa")} className="rounded-xl bg-fuchsia-500 px-4 py-2.5 text-xs font-bold text-white">Suspender</button></div></div></section>
          </div>

          <section className="mt-7 rounded-3xl border border-violet-300/15 bg-[#101735]/90 p-5 shadow-[0_20px_45px_rgba(0,0,0,.18)] sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Fluxo de segurança</h2><p className="mt-1 text-sm text-slate-400">Acesso sempre filtrado pela clínica do usuário autenticado.</p></div><span className="rounded-full bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-200">Separação garantida no servidor</span></div><div className="mt-6 grid gap-4 md:grid-cols-3"><Step number="1" title="Identidade" text="O usuário entra com login vinculado a uma clínica." /><Step number="2" title="Permissão" text="O servidor valida perfil, plano e status da licença." /><Step number="3" title="Dados isolados" text="A consulta retorna somente registros daquela clínica." /></div></section>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-3xl border border-violet-300/15 bg-[#101735]/90 p-5 shadow-[0_20px_45px_rgba(0,0,0,.18)]"><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-2xl font-bold text-cyan-300">{value}</p><p className="mt-2 text-xs text-slate-400">{detail}</p></article>;
}

function StatusBadge({ status }: { status: ClinicStatus }) {
  const classes = status === "Ativa" ? "bg-emerald-400/15 text-emerald-200" : status === "Em aviso" ? "bg-amber-300/15 text-amber-200" : "bg-fuchsia-400/15 text-fuchsia-200";
  return <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${classes}`}>{status}</span>;
}

function Data({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/[.045] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 font-semibold text-slate-100">{value}</p></div>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-500 text-sm font-bold text-[#071025]">{number}</span><div><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{text}</p></div></div>;
}
