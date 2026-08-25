"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DemoPatientRecord,
  demoDoctor,
  demoMedicalPatients,
  readDemoPatients,
  saveDemoPatient,
  subscribeDemoPatients,
} from "./patient-store";

const loggedDoctor = demoDoctor.name;

const existingPatients = demoMedicalPatients.map((patient) => ({
  id: patient.id,
  name: patient.name,
  cpf: patient.cpf,
  birthDate: patient.birthDate,
  status:
    patient.status === "tentar-novamente"
      ? "Em acompanhamento"
      : "Tratamento ativo",
}));

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
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const syncPatients = () => setRecords(readDemoPatients());

    queueMicrotask(syncPatients);

    return subscribeDemoPatients(syncPatients);
  }, []);

  const doctorRecords = useMemo(
    () => records.filter((patient) => patient.doctor === loggedDoctor),
    [records],
  );

  const visiblePatients = useMemo(() => {
    const term = search
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.\-]/g, "")
      .toLowerCase();

    const combined = [
      ...doctorRecords.map((patient) => ({
        id: patient.id,
        name: patient.name,
        cpf: patient.cpf,
        birthDate: patient.birthDate,
        status:
          patient.registrationStatus === "pending-secretary"
            ? "Aguardando secretaria"
            : "Cadastro concluído",
      })),
      ...existingPatients.filter(
        (patient) => !doctorRecords.some((record) => record.id === patient.id),
      ),
    ];

    return combined.filter((patient) => {
      const searchable = `${patient.name} ${patient.cpf}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.\-]/g, "")
        .toLowerCase();

      return !term || searchable.includes(term);
    });
  }, [doctorRecords, search]);

  const pendingCount = doctorRecords.filter(
    (patient) => patient.registrationStatus === "pending-secretary",
  ).length;

  function closeForm() {
    setShowForm(false);
    setError("");
  }

  function registerPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedCpf = cpf.replace(/\D/g, "");

    if (normalizedCpf.length !== 11) {
      setError("Informe um CPF com 11 números.");
      return;
    }

    const duplicate = [...existingPatients, ...records].some(
      (patient) => patient.cpf.replace(/\D/g, "") === normalizedCpf,
    );

    if (duplicate) {
      setError("Já existe um paciente cadastrado com esse CPF.");
      return;
    }

    const patient: DemoPatientRecord = {
      id: crypto.randomUUID(),
      name: name.trim(),
      cpf,
      birthDate,
      doctor: loggedDoctor,
      createdAt: new Date().toISOString(),
      registrationStatus: "pending-secretary",
      status: "em-conversa",
    };

    saveDemoPatient(patient);
    setName("");
    setCpf("");
    setBirthDate("");
    setSearch("");
    setMessage(`${patient.name} foi encaminhado para a secretaria completar o cadastro.`);
    closeForm();
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
            <button className="w-full rounded-2xl bg-white/15 px-4 py-3 text-left text-sm font-semibold">
              Dashboard
            </button>
            <button className="w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Meus pacientes
            </button>
            <button className="w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Receitas
            </button>
            <button className="w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
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

          <section className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Meus pacientes",
                value: existingPatients.length + doctorRecords.filter(
                  (record) => !existingPatients.some((patient) => patient.id === record.id),
                ).length,
                subtitle: "Pacientes vinculados ao seu perfil",
              },
              {
                title: "Aguardando secretaria",
                value: pendingCount,
                subtitle: "Cadastros que precisam ser completados",
              },
              {
                title: "Cadastros finalizados",
                value: doctorRecords.filter(
                  (patient) => patient.registrationStatus === "completed",
                ).length,
                subtitle: "Pacientes liberados pela equipe",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-3xl border border-[#efe6e1] bg-white p-6 shadow-[0_12px_35px_rgba(80,30,45,0.05)]"
              >
                <p className="text-sm font-semibold text-[#74686b]">{card.title}</p>
                <p className="mt-4 text-4xl font-bold text-[#a3113a]">{card.value}</p>
                <p className="mt-2 text-xs text-[#827679]">{card.subtitle}</p>
              </div>
            ))}
          </section>

          <section className="mt-8 rounded-3xl border border-[#efe6e1] bg-white p-6 shadow-[0_12px_35px_rgba(80,30,45,0.04)]">
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
                        patient.status === "Aguardando secretaria"
                          ? "bg-[#fff4de] text-[#98671a]"
                          : "bg-[#edf8f3] text-[#187157]"
                      }`}
                    >
                      {patient.status}
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
          </section>

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
