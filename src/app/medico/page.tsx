"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DemoPatientRecord,
  demoDoctor,
  demoMedicalPatients,
  readDemoPatients,
  subscribeDemoPatients,
} from "./patient-store";
import { readPortalState } from "../paciente/patient-portal-store";
import { getSupabaseClient } from "../../lib/supabase/client";

type DoctorSection = "dashboard" | "pacientes" | "evolucao";
type DoctorPatientFilter = "todos" | "ativo" | "com-pedido" | "tentar-novamente" | "concluido" | "perdido" | "desistente";

const loggedDoctor = demoDoctor.name;

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

export default function MedicoPage() {
  const [records, setRecords] = useState<DemoPatientRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [section, setSection] = useState<DoctorSection>("dashboard");
  const [patientFilter, setPatientFilter] = useState<DoctorPatientFilter>("todos");

  useEffect(() => {
    const syncPatients = () => setRecords(readDemoPatients());

    queueMicrotask(syncPatients);

    return subscribeDemoPatients(syncPatients);
  }, []);

  const doctorRecords = useMemo(
    () => records.filter((patient) => patient.doctor === loggedDoctor),
    [records],
  );

  const allDoctorPatients = useMemo(() => {
    const savedIds = new Set(doctorRecords.map((patient) => patient.id));
    return [...doctorRecords, ...demoMedicalPatients.filter((patient) => patient.doctor === loggedDoctor && !savedIds.has(patient.id))];
  }, [doctorRecords]);

  const visiblePatients = useMemo(() => {
    const term = search
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.\-]/g, "")
      .toLowerCase();

    const combined = allDoctorPatients;

    return combined.filter((patient) => {
      const searchable = `${patient.name} ${patient.cpf}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.\-]/g, "")
        .toLowerCase();

      const matchesStatus = patientFilter === "todos" || (patientFilter === "ativo" ? ["ativo", "em-conversa", "bacteriana"].includes(patient.status ?? "") : patient.status === patientFilter);
      return (!term || searchable.includes(term)) && matchesStatus;
    });
  }, [allDoctorPatients, patientFilter, search]);

  const totalPatients = allDoctorPatients.length;
  const countByStatus = (status: DoctorPatientFilter) => status === "todos" ? totalPatients : allDoctorPatients.filter((patient) => status === "ativo" ? ["ativo", "em-conversa", "bacteriana"].includes(patient.status ?? "") : patient.status === status).length;
  const percentage = (value: number) => totalPatients ? Math.round((value / totalPatients) * 100) : 0;
  const statusMetrics = [
    { id: "ativo" as const, label: "Pacientes ativos", color: "#24846b" },
    { id: "com-pedido" as const, label: "Com pedido", color: "#a3113a" },
    { id: "concluido" as const, label: "Concluídos", color: "#3d76a5" },
    { id: "perdido" as const, label: "Perdidos", color: "#8b7d80" },
    { id: "desistente" as const, label: "Desistentes", color: "#a86a32" },
  ].map((item) => ({ ...item, value: countByStatus(item.id), percentage: percentage(countByStatus(item.id)) }));
  const recentPatients = [...allDoctorPatients].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  const evolution = allDoctorPatients.map((patient) => {
    const portal = readPortalState(patient.id);
    const scheduled = portal.bottles.length ? Math.max(1, portal.useRecords.length + Object.values(portal.dayOverrides ?? {}).filter((value) => value === "nao-registrado").length) : 0;
    const regularity = scheduled ? Math.round((portal.useRecords.length / scheduled) * 100) : 0;
    const positive = portal.assessments.filter((assessment) => ["muito-bem", "bem"].includes(assessment.feeling ?? "") || ["leves", "moderados"].includes(assessment.symptomSeverity ?? "")).length;
    const discomfort = portal.assessments.filter((assessment) => ["desconfortos", "nao-bem"].includes(assessment.feeling ?? "") || ["severos", "muito-severos"].includes(assessment.symptomSeverity ?? "")).length;
    return { patient, regularity, positive, discomfort };
  });
  const averageRegularity = evolution.length ? Math.round(evolution.reduce((total, item) => total + item.regularity, 0) / evolution.length) : 0;

  function closeForm() {
    setShowForm(false);
    setError("");
  }

  async function registerPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedCpf = cpf.replace(/\D/g, "");

    if (normalizedCpf.length !== 11) {
      setError("Informe um CPF com 11 números.");
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: clinicId, error: clinicError } = await supabase.rpc("current_clinic_id");
      if (!user || clinicError || !clinicId) throw new Error("Não foi possível identificar o médico logado.");
      const { error: duplicateError, data: duplicate } = await supabase.from("patients").select("id").eq("cpf", cpf).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) { setError("Já existe um paciente cadastrado com esse CPF."); return; }
      const { error } = await supabase.from("patients").insert({ clinic_id: clinicId as string, doctor_profile_id: user.id, full_name: name.trim(), cpf, birth_date: birthDate, phone: phone.trim() || null, status: "em-conversa", address: {}, treatment: {}, financial: {} });
      if (error) throw error;
      setName(""); setCpf(""); setBirthDate(""); setPhone(""); setSearch("");
      setMessage(`${name.trim()} foi encaminhado para a secretaria completar o cadastro.`);
      closeForm();
    } catch {
      setError("Não foi possível salvar o pré-cadastro agora. Tente novamente.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f5f2] text-[#34292d]">
      <div className="min-h-screen lg:grid lg:grid-cols-[285px_minmax(0,1fr)]">
        <aside className="bg-gradient-to-b from-[#b31340] to-[#790b2a] px-7 py-8 text-white lg:min-h-screen">
          <div className="border-b border-white/15 pb-8">
            <Image
              src="/logo-cra-branca.png"
              alt="CRA - Centro de Rinite e Alergia"
              width={170}
              height={115}
              priority
              className="h-auto w-36"
            />
            <p className="mt-4 text-sm text-white/70">Painel do Médico</p>
          </div>

          <nav className="mt-8 space-y-2">
            <button type="button" onClick={() => setSection("dashboard")} className={`w-full rounded-2xl px-4 py-3 text-left text-sm ${section === "dashboard" ? "bg-white/15 font-semibold" : "text-white/80 hover:bg-white/10"}`}>
              Dashboard
            </button>
            <button type="button" onClick={() => setSection("pacientes")} className={`w-full rounded-2xl px-4 py-3 text-left text-sm ${section === "pacientes" ? "bg-white/15 font-semibold" : "text-white/80 hover:bg-white/10"}`}>
              Meus pacientes
            </button>
            <button type="button" onClick={() => setSection("evolucao")} className={`w-full rounded-2xl px-4 py-3 text-left text-sm ${section === "evolucao" ? "bg-white/15 font-semibold" : "text-white/80 hover:bg-white/10"}`}>
              Evolução
            </button>
            <Link
              href="/"
              className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10"
            >
              Sair
            </Link>
          </nav>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c173c]">
                Acompanhamento clínico
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#86203b] sm:text-4xl">
                Olá, doutor
              </h1>
              <p className="mt-2 text-sm text-[#776b6e]">
                Cadastre seus pacientes e acompanhe a evolução dos tratamentos.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-[#eadfd9] bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#faedf0] text-sm font-bold text-[#a3113a]">
                FM
              </div>
              <div>
                <p className="text-sm font-semibold">{loggedDoctor}</p>
                <p className="text-xs text-[#877b7e]">Otorrinolaringologia</p>
              </div>
              <Link href="/" className="ml-2 rounded-xl border border-[#eadfd9] px-3 py-2 text-xs font-semibold text-[#a3113a] hover:bg-[#fff5f7]">
                Sair
              </Link>
            </div>
          </header>

          {section === "dashboard" && <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {statusMetrics.map((card) => (
              <div
                key={card.id}
                className="rounded-3xl border border-[#efe6e1] bg-white p-6 shadow-[0_12px_35px_rgba(80,30,45,0.05)]"
              >
                <p className="text-sm font-semibold text-[#74686b]">{card.label}</p>
                <p className="mt-4 text-4xl font-bold text-[#a3113a]">{card.value}</p>
                <p className="mt-2 text-xs text-[#827679]">{card.percentage}% do total</p>
              </div>
            ))}
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
            <article className="rounded-3xl border border-[#efe6e1] bg-white p-6 shadow-sm"><h2 className="text-xl font-bold text-[#433438]">Distribuição dos pacientes</h2><p className="mt-1 text-sm text-[#817578]">Total: {totalPatients} pacientes vinculados ao seu perfil.</p><div className="mt-7 space-y-4">{statusMetrics.map((metric) => <div key={metric.id}><div className="flex justify-between text-xs"><strong>{metric.label}</strong><span>{metric.percentage}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-[#f0e9e6]"><div className="h-full rounded-full" style={{ width: `${metric.percentage}%`, backgroundColor: metric.color }} /></div></div>)}</div></article>
            <article className="rounded-3xl border border-[#efe6e1] bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold text-[#433438]">Últimos pacientes cadastrados</h2><p className="mt-1 text-sm text-[#817578]">Cadastros mais recentes deste médico.</p></div><button type="button" onClick={() => setSection("pacientes")} className="rounded-xl border border-[#eadfd9] px-4 py-2 text-xs font-semibold text-[#a3113a]">Ver todos</button></div><div className="mt-5 space-y-3">{recentPatients.map((patient) => <div key={patient.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbf7f5] p-4"><div><p className="text-sm font-bold">{patient.name}</p><p className="mt-1 text-xs text-[#817578]">CPF {patient.cpf} · {formatDate(patient.birthDate)}</p></div><Link href={`/medico/paciente/${patient.id}`} className="text-xs font-semibold text-[#a3113a]">Abrir →</Link></div>)}</div></article>
          </section>
          </>}

          {section === "pacientes" && <section className="mt-8 rounded-3xl border border-[#efe6e1] bg-white p-6 shadow-[0_12px_35px_rgba(80,30,45,0.04)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#433438]">Meus pacientes</h2>
                <p className="mt-1 text-sm text-[#817578]">
                  O médico informa somente nome, CPF e data de nascimento.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome ou CPF"
                  className="h-12 rounded-xl border border-[#e9dfda] px-4 text-sm outline-none focus:border-[#b91142]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setMessage("");
                    setShowForm(true);
                  }}
                  className="h-12 rounded-xl bg-[#a3113a] px-5 text-sm font-semibold text-white"
                >
                  + Cadastrar paciente
                </button>
              </div>
            </div>

            {message && (
              <div className="mt-5 rounded-2xl border border-[#cfe9df] bg-[#edf8f3] px-4 py-3 text-sm text-[#187157]">
                {message}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">{([{ id: "todos", label: "Todos" }, ...statusMetrics.map((item) => ({ id: item.id, label: item.label })), { id: "tentar-novamente", label: "Tentar novamente" }] as { id: DoctorPatientFilter; label: string }[]).map((item) => <button key={item.id} type="button" onClick={() => setPatientFilter(item.id)} className={`rounded-full px-4 py-2 text-xs font-semibold ${patientFilter === item.id ? "bg-[#a3113a] text-white" : "bg-[#f6efec] text-[#716569]"}`}>{item.label} ({countByStatus(item.id)})</button>)}</div>

            <div className="mt-6 space-y-3">
              {visiblePatients.map((patient) => (
                <article
                  key={patient.id}
                  className="flex flex-col gap-4 rounded-2xl border border-[#eee6e2] bg-[#fdfbf9] p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <h3 className="text-sm font-bold text-[#403237]">{patient.name}</h3>
                    <p className="mt-1 text-xs text-[#776b6e]">
                      CPF: {patient.cpf} · Nascimento: {formatDate(patient.birthDate)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-2 text-xs font-semibold ${
                        patient.registrationStatus === "pending-secretary"
                          ? "bg-[#fff4de] text-[#98671a]"
                          : "bg-[#edf8f3] text-[#187157]"
                      }`}
                    >
                      {patient.registrationStatus === "pending-secretary" ? "Aguardando secretaria" : patient.status === "com-pedido" ? "Com pedido" : patient.status === "concluido" ? "Concluído" : patient.status === "perdido" ? "Perdido" : patient.status === "desistente" ? "Desistente" : "Ativo"}
                    </span>
                    <Link
                      href={`/medico/paciente/${patient.id}`}
                      className="rounded-xl bg-[#a3113a] px-4 py-2 text-xs font-semibold text-white"
                    >
                      Abrir prontuário
                    </Link>
                  </div>
                </article>
              ))}

              {visiblePatients.length === 0 && (
                <p className="rounded-2xl border border-dashed border-[#e6dbd6] px-4 py-8 text-center text-sm text-[#817578]">
                  Nenhum paciente encontrado.
                </p>
              )}
            </div>
          </section>}

          {section === "evolucao" && <section className="space-y-6"><div><h2 className="text-2xl font-bold text-[#433438]">Evolução dos pacientes</h2><p className="mt-2 text-sm text-[#817578]">Indicadores de adesão e autoavaliação para apoiar o acompanhamento clínico.</p></div><div className="grid gap-4 sm:grid-cols-4">{[{ label: "Regularidade média", value: `${averageRegularity}%` }, { label: "Boa adesão", value: `${percentage(evolution.filter((item) => item.regularity >= 70).length)}%` }, { label: "Precisam de atenção", value: String(evolution.filter((item) => item.regularity < 50).length) }, { label: "Relatos de desconforto", value: String(evolution.reduce((total, item) => total + item.discomfort, 0)) }].map((card) => <article key={card.label} className="rounded-3xl border border-[#efe6e1] bg-white p-6"><p className="text-sm text-[#817578]">{card.label}</p><p className="mt-3 text-3xl font-bold text-[#a3113a]">{card.value}</p></article>)}</div><article className="rounded-3xl border border-[#efe6e1] bg-white p-6"><h3 className="text-lg font-bold">Desenvolvimento por paciente</h3><div className="mt-6 space-y-5">{evolution.map((item) => <div key={item.patient.id}><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{item.patient.name}</strong><span className={item.regularity >= 70 ? "text-[#187157]" : item.regularity >= 50 ? "text-[#966419]" : "text-[#a3113a]"}>{item.regularity}% de regularidade</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-[#f0e9e6]"><div className={`h-full rounded-full ${item.regularity >= 70 ? "bg-[#24846b]" : item.regularity >= 50 ? "bg-[#d59a42]" : "bg-[#b21a45]"}`} style={{ width: `${item.regularity}%` }} /></div><p className="mt-2 text-xs text-[#817578]">Autoavaliações positivas: {item.positive} · desconfortos: {item.discomfort}</p></div>)}</div></article><p className="rounded-2xl bg-[#fff7ea] p-4 text-xs leading-6 text-[#806238]">Estes indicadores apoiam o acompanhamento, mas não substituem avaliação médica individual.</p></section>}

          <p className="mt-6 text-xs text-[#8a7d80]">
            Demonstração temporária: utilize somente dados fictícios. O armazenamento
            seguro será implementado no Supabase.
          </p>
        </section>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#29151b]/65 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="medical-registration-title"
            className="w-full max-w-lg overflow-hidden rounded-[30px] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-[#eee4e0] px-6 py-5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a3113a]">
                  Cadastro inicial
                </span>
                <h2 id="medical-registration-title" className="mt-1 text-2xl font-bold text-[#4a343a]">
                  Novo paciente
                </h2>
                <p className="mt-1 text-sm text-[#817578]">
                  A secretaria preencherá as demais informações.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Fechar cadastro"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f1ee] text-xl text-[#77696d]"
              >
                ×
              </button>
            </div>

            <form onSubmit={registerPatient} className="space-y-5 px-6 py-6">
              <label className="block text-sm font-medium text-[#544449]">
                Nome completo *
                <input
                  required
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                  placeholder="Nome completo do paciente"
                  className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                />
              </label>
              <label className="block text-sm font-medium text-[#544449]">
                CPF *
                <input
                  required
                  inputMode="numeric"
                  value={cpf}
                  onChange={(event) => {
                    setCpf(formatCpf(event.target.value));
                    setError("");
                  }}
                  placeholder="000.000.000-00"
                  className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                />
              </label>
              <label className="block text-sm font-medium text-[#544449]">
                Data de nascimento *
                <input
                  required
                  type="date"
                  value={birthDate}
                  onChange={(event) => {
                    setBirthDate(event.target.value);
                    setError("");
                  }}
                  className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                />
              </label>
              <label className="block text-sm font-medium text-[#544449]">Telefone / WhatsApp <span className="font-normal text-[#817578]">(opcional)</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(41) 99999-9999" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /></label>

              {error && (
                <p className="rounded-xl border border-[#f3d5d8] bg-[#fff2f3] px-4 py-3 text-sm text-[#a3113a]">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-[#eee4e0] pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-[#e6dbd6] px-5 py-3 text-sm font-semibold text-[#74666a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#a3113a] px-5 py-3 text-sm font-semibold text-white"
                >
                  Enviar para secretaria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
