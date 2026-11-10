"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DemoPatientRecord } from "../../medico/patient-store";
import {
  loadSecretaryContactReport,
  type SecretaryContactReportPatient,
  type SecretaryContactReportStatus,
} from "../../../lib/supabase/secretary-records";

type PatientStatus = NonNullable<DemoPatientRecord["status"]>;

const statusLabels: Record<PatientStatus, string> = {
  "com-pedido": "Paciente com pedido",
  "em-conversa": "Paciente em conversa",
  ativo: "Paciente ativo",
  bacteriana: "Paciente bacteriana",
  "tentar-novamente": "Tentar novamente",
  perdido: "Tratamento não contratado",
  "em-alta": "Pacientes com alta",
  concluido: "Paciente concluído",
  desistente: "Paciente desistente",
  laudo: "Laudo",
};

const statuses = Object.entries(statusLabels) as Array<[PatientStatus, string]>;

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s()\-+]/g, "");
}

function whatsappHref(phone: string, message = "") {
  const digits = phone.replace(/\D/g, "");
  const nationalNumber = digits.startsWith("55") ? digits.slice(2) : digits;
  if (nationalNumber.length !== 10 && nationalNumber.length !== 11) return null;
  const fullNumber = digits.startsWith("55") ? digits : `55${digits}`;
  const messageQuery = message.trim() ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${fullNumber}${messageQuery}`;
}

function csvCell(value: string) {
  const protectedValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function downloadCsv(patients: SecretaryContactReportPatient[]) {
  const rows = [
    ["Nome", "Telefone", "Médico", "Tratamento", "Situação"].map(csvCell).join(";"),
    ...patients.map((patient) => [
      patient.name,
      patient.phone,
      patient.doctor,
      patient.treatment,
      statusLabels[patient.status as PatientStatus] ?? patient.status,
    ].map(csvCell).join(";")),
  ];
  const blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-pacientes-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SecretariaRelatoriosPage() {
  const [statusFilter, setStatusFilter] = useState<SecretaryContactReportStatus>("em-conversa");
  const [doctorFilter, setDoctorFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [patients, setPatients] = useState<SecretaryContactReportPatient[]>([]);
  const [doctors, setDoctors] = useState<Array<{ id: string; fullName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void loadSecretaryContactReport(statusFilter)
      .then((report) => {
        if (!active) return;
        setPatients(report.patients);
        setDoctors(report.doctors.map(({ id, fullName }) => ({ id, fullName })));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o relatório.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [statusFilter]);

  const filteredPatients = useMemo(() => {
    const normalizedSearch = normalizeSearch(search);
    return patients.filter((patient) => {
      const matchesSearch = !normalizedSearch || normalizeSearch(`${patient.name} ${patient.phone}`).includes(normalizedSearch);
      const matchesDoctor = doctorFilter === "todos" || patient.doctor === doctorFilter;
      return matchesSearch && matchesDoctor;
    });
  }, [doctorFilter, patients, search]);

  const patientsWithPhone = filteredPatients.filter((patient) => whatsappHref(patient.phone)).length;

  async function copyContacts() {
    const contacts = filteredPatients
      .filter((patient) => patient.phone.trim())
      .map((patient) => `${patient.name}\t${patient.phone}`)
      .join("\n");
    if (!contacts) {
      setMessage("Não há telefones para copiar neste filtro.");
      return;
    }
    try {
      await navigator.clipboard.writeText(contacts);
      setMessage(`${filteredPatients.filter((patient) => patient.phone.trim()).length} contato(s) copiado(s).`);
    } catch {
      setMessage("Não foi possível copiar os contatos. Tente baixar o CSV.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f5f2] text-[#34292d]">
      <div className="min-h-screen lg:pl-[285px]">
        <aside className="bg-gradient-to-b from-[#b31340] to-[#790b2a] px-7 py-8 text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-[285px] lg:overflow-y-auto">
          <Image src="/logo-cra-branca.png" alt="CRA - Centro de Rinite e Alergia" width={170} height={115} priority className="h-auto w-36" />
          <p className="mt-4 border-b border-white/15 pb-8 text-sm text-white/70">Painel da Secretaria</p>
          <nav className="mt-8 space-y-2">
            <Link href="/secretaria" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Dashboard</Link>
            <Link href="/secretaria/relatorios" className="block rounded-2xl bg-white/15 px-4 py-3 text-sm font-semibold">Relatórios</Link>
            <Link href="/secretaria/lotes" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Lotes</Link>
            <Link href="/secretaria/cadastros" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Cadastros</Link>
            <Link href="/secretaria/notificacoes" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Notificações aos pacientes</Link>
            <Link href="/secretaria/configuracoes" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Configurações</Link>
            <Link href="/sair" className="block rounded-2xl px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10">Sair</Link>
          </nav>
          <div className="mt-12 rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-sm font-semibold">CRA Care</p>
            <p className="mt-1 text-xs text-white/70">Desenvolvido pela Hippi</p>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c173c]">Secretaria · acompanhamento</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#86203b] sm:text-4xl">Relatórios de pacientes</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#776b6e]">Consulte os pacientes por situação e abra o WhatsApp direto pela lista, sem entrar em cada cartão.</p>
            </div>
            <Link href="/secretaria" className="self-start rounded-2xl border border-[#eadfd9] bg-white px-5 py-3 text-sm font-semibold text-[#a3113a] shadow-sm">← Voltar ao dashboard</Link>
          </header>

          {error && <div role="alert" className="mb-5 rounded-2xl border border-[#f3d5d8] bg-[#fff2f3] px-4 py-3 text-sm text-[#a3113a]">{error}</div>}
          {message && <div role="status" className="mb-5 rounded-2xl border border-[#cfe9df] bg-[#edf8f3] px-4 py-3 text-sm text-[#187157]">{message}</div>}

          <section className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-[#433438]">Lista de contatos</h2>
                <p className="mt-1 text-sm text-[#817578]">Começando por “Paciente em conversa”. Use os filtros para localizar quem precisa de contato.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void copyContacts()} disabled={loading || filteredPatients.length === 0} className="rounded-xl border border-[#e8d9d5] bg-white px-4 py-2.5 text-sm font-semibold text-[#a3113a] disabled:cursor-not-allowed disabled:opacity-50">Copiar contatos</button>
                <button type="button" onClick={() => downloadCsv(filteredPatients)} disabled={loading || filteredPatients.length === 0} className="rounded-xl bg-[#a3113a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#861031] disabled:cursor-not-allowed disabled:opacity-50">Baixar CSV</button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-[#fff4f6] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#8c5966]">Neste filtro</p><p className="mt-1 text-2xl font-bold text-[#a3113a]">{filteredPatients.length}</p></div>
              <div className="rounded-2xl bg-[#f3faf7] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#58776c]">Com WhatsApp</p><p className="mt-1 text-2xl font-bold text-[#187157]">{patientsWithPhone}</p></div>
              <div className="rounded-2xl bg-[#fbf7f5] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#776b6e]">Sem telefone válido</p><p className="mt-1 text-2xl font-bold text-[#66595d]">{filteredPatients.length - patientsWithPhone}</p></div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
              <label className="text-xs font-semibold text-[#66595d]">Situação
                <select value={statusFilter} onChange={(event) => { setLoading(true); setError(""); setStatusFilter(event.target.value as SecretaryContactReportStatus); }} className="mt-1.5 h-11 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm font-normal outline-none focus:border-[#b91142]">
                  <option value="todos">Todas as situações</option>
                  {statuses.map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#66595d]">Médico
                <select value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm font-normal outline-none focus:border-[#b91142]">
                  <option value="todos">Todos os médicos</option>
                  {doctors.map((doctor) => <option key={doctor.id} value={doctor.fullName}>{doctor.fullName}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#66595d]">Buscar paciente
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou telefone" className="mt-1.5 h-11 w-full rounded-xl border border-[#e9dfda] px-3 text-sm font-normal outline-none focus:border-[#b91142]" />
              </label>
            </div>

            <label className="mt-4 block text-xs font-semibold text-[#66595d]">Mensagem para WhatsApp (opcional)
              <textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} rows={3} placeholder="Escreva uma mensagem de confirmação para abrir já preenchida no WhatsApp." className="mt-1.5 w-full resize-y rounded-xl border border-[#e9dfda] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#b91142]" />
              <span className="mt-1 block font-normal text-[#817578]">Use {"{{nome}}"} para inserir o nome de cada paciente.</span>
            </label>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-[#eee5e0]">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-[#fbf7f5] text-xs uppercase tracking-wide text-[#776b6e]">
                  <tr><th className="px-4 py-3 font-semibold">Paciente</th><th className="px-4 py-3 font-semibold">Telefone</th><th className="px-4 py-3 font-semibold">Médico</th><th className="px-4 py-3 font-semibold">Tratamento</th><th className="px-4 py-3 font-semibold">Situação</th><th className="px-4 py-3 text-right font-semibold">Contato</th></tr>
                </thead>
                <tbody className="divide-y divide-[#f0e9e5]">
                  {loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-[#817578]">Carregando contatos…</td></tr>
                    : filteredPatients.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-[#817578]">Nenhum paciente encontrado para estes filtros.</td></tr>
                      : filteredPatients.map((patient) => {
                        const href = whatsappHref(patient.phone, messageDraft.replace(/\{\{nome\}\}/gi, patient.name));
                        return <tr key={patient.id} className="hover:bg-[#fdfbf9]">
                          <td className="px-4 py-3.5 font-semibold text-[#433438]">{patient.name}</td>
                          <td className="px-4 py-3.5 text-[#66595d]">{patient.phone || "Não informado"}</td>
                          <td className="px-4 py-3.5 text-[#66595d]">{patient.doctor}</td>
                          <td className="px-4 py-3.5 text-[#66595d]">{patient.treatment}</td>
                          <td className="px-4 py-3.5"><span className="inline-flex rounded-full bg-[#fff7e8] px-2.5 py-1 text-xs font-semibold text-[#996719]">{statusLabels[patient.status as PatientStatus] ?? patient.status}</span></td>
                          <td className="px-4 py-3.5 text-right">{href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex whitespace-nowrap rounded-lg bg-[#eaf8f3] px-3 py-2 text-xs font-bold text-[#187157] hover:bg-[#d8f1e7]">Abrir WhatsApp ↗</a> : <span className="text-xs text-[#988c8e]">Telefone inválido</span>}</td>
                        </tr>;
                      })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[#817578]">O WhatsApp abre uma conversa individual com a mensagem preenchida. Confira e envie por lá; nada é enviado automaticamente.</p>
          </section>
        </section>
      </div>
    </main>
  );
}
