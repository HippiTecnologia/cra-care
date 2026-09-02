"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DemoPatientRecord,
} from "../../medico/patient-store";
import {
  PatientAssessment,
  PatientPortalState,
} from "../../paciente/patient-portal-store";
import {
  loadSecretaryContext,
  loadSecretaryPatients,
  loadSecretaryPortals,
  saveSecretaryAssessment,
  SecretaryContext,
} from "../../../lib/supabase/secretary-records";

type StatusFilter = "pendentes" | "respondidas" | "todas";

type AssessmentEntry = {
  patient: DemoPatientRecord;
  assessment: PatientAssessment;
};

const frequencyLabels: Record<string, string> = {
  raramente: "Raramente (menos de 1 dia por semana)",
  "as-vezes": "Às vezes (1 a 3 dias por semana)",
  frequentemente: "Frequentemente (4 a 6 dias por semana)",
  "quase-diariamente": "Quase diariamente",
};

const severityLabels: Record<string, string> = {
  leves: "Leves",
  moderados: "Moderados",
  severos: "Severos",
  "muito-severos": "Muito severos",
};

const medicationLabels: Record<string, string> = {
  nunca: "Nunca",
  "1-2": "1 a 2 vezes por semana",
  "3-5": "3 a 5 vezes por semana",
  "todos-os-dias": "Todos os dias",
};

function formatDate(value?: string, includeTime = false) {
  if (!value) return "Não informado";
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: includeTime && value.includes("T") ? "short" : undefined,
  }).format(parsed);
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\D/g, "");
}

export default function SecretaryAssessmentsPage() {
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [portals, setPortals] = useState<Record<string, PatientPortalState>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendentes");
  const [search, setSearch] = useState("");
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [context, setContext] = useState<SecretaryContext | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loadedContext = await loadSecretaryContext();
        const workspace = await loadSecretaryPatients(loadedContext);
        const loadedPortals = await loadSecretaryPortals(workspace.patients.map((patient) => patient.id));
        if (!active) return;
        setContext(loadedContext);
        setPatients(workspace.patients);
        setPortals(loadedPortals);
      } catch (cause) {
        if (active) setMessage(cause instanceof Error ? cause.message : "Não foi possível carregar as avaliações.");
      }
    })();
    return () => { active = false; };
  }, []);

  const entries = useMemo<AssessmentEntry[]>(() => patients
    .flatMap((patient) => (portals[patient.id]?.assessments ?? []).map((assessment) => ({ patient, assessment })))
    .sort((first, second) => new Date(second.assessment.createdAt).getTime() - new Date(first.assessment.createdAt).getTime()), [patients, portals]);

  const pending = entries.filter((entry) => !entry.assessment.response).length;
  const responded = entries.filter((entry) => Boolean(entry.assessment.response)).length;
  const visible = entries.filter(({ patient, assessment }) => {
    const matchesStatus = statusFilter === "todas"
      || (statusFilter === "pendentes" && !assessment.response)
      || (statusFilter === "respondidas" && Boolean(assessment.response));
    const term = search.trim().toLowerCase();
    const cpfTerm = normalize(search);
    const matchesSearch = !term
      || patient.name.toLowerCase().includes(term)
      || (cpfTerm.length > 0 && normalize(patient.cpf).includes(cpfTerm));
    return matchesStatus && matchesSearch;
  });

  async function updateAssessment(patientId: string, assessmentId: string, changes: Partial<PatientAssessment>) {
    if (!context) throw new Error("A sessão da Secretaria ainda não foi carregada.");
    const portal = portals[patientId];
    const currentAssessment = portal?.assessments.find((assessment) => assessment.id === assessmentId);
    if (!portal || !currentAssessment) throw new Error("Avaliação não encontrada.");
    const updated = { ...currentAssessment, ...changes };
    await saveSecretaryAssessment(context, patientId, updated);
    setPortals((current) => ({
      ...current,
      [patientId]: {
        ...portal,
        assessments: portal.assessments.map((assessment) => assessment.id === assessmentId ? updated : assessment),
      },
    }));
  }

  async function markViewed(entry: AssessmentEntry) {
    const now = new Date().toISOString();
    try {
      await updateAssessment(entry.patient.id, entry.assessment.id, {
        viewedAt: entry.assessment.viewedAt ?? now,
        viewedBy: entry.assessment.viewedBy ?? "Secretaria CRA",
      });
      setMessage(`Avaliação de ${entry.patient.name} marcada como visualizada.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível atualizar a avaliação.");
    }
  }

  async function saveResponse(entry: AssessmentEntry) {
    const response = (responseDrafts[entry.assessment.id] ?? entry.assessment.response ?? "").trim();
    if (!response) {
      setMessage("Escreva uma resposta antes de salvar.");
      return;
    }

    const now = new Date().toISOString();
    try {
      await updateAssessment(entry.patient.id, entry.assessment.id, {
        viewedAt: entry.assessment.viewedAt ?? now,
        viewedBy: entry.assessment.viewedBy ?? "Secretaria CRA",
        response,
        respondedAt: now,
        respondedBy: "Secretaria CRA",
      });
      setResponseDrafts((current) => ({ ...current, [entry.assessment.id]: response }));
      setMessage(`Resposta para ${entry.patient.name} salva e disponibilizada ao paciente e ao médico.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível salvar a resposta.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f5f2] text-[#34292d]">
      <header className="bg-gradient-to-r from-[#b31340] to-[#790b2a] px-5 py-6 text-white sm:px-8">
        <div className="mx-auto flex max-w-[1450px] flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <Image src="/logo-cra-branca.png" alt="CRA" width={125} height={85} className="h-auto w-24" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-white/70">Secretaria · acompanhamento</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Avaliações dos pacientes</h1>
              <p className="mt-1 text-sm text-white/75">Confira os relatos e registre o retorno da equipe.</p>
            </div>
          </div>
          <Link href="/secretaria" className="rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/15">← Voltar ao painel</Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1450px] px-4 py-7 sm:px-7">
        {message && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[#cfe9de] bg-[#edf8f3] px-4 py-3 text-sm font-semibold text-[#187157]">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage("")} aria-label="Fechar mensagem">×</button>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <Metric label="Avaliações recebidas" value={String(entries.length)} detail="Histórico completo" />
          <Metric label="Pendentes de resposta" value={String(pending)} detail="Exigem retorno da Secretaria" highlight />
          <Metric label="Respondidas" value={String(responded)} detail="Visíveis ao paciente e ao médico" />
        </section>

        <section className="mt-6 rounded-3xl border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-bold">Fila de avaliações</h2>
              <p className="mt-1 text-sm text-[#817578]">As mais recentes aparecem primeiro.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex rounded-xl bg-[#f6efec] p-1">
                {([['pendentes', 'Pendentes'], ['respondidas', 'Respondidas'], ['todas', 'Todas']] as [StatusFilter, string][]).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-bold ${statusFilter === value ? "bg-white text-[#a3113a] shadow-sm" : "text-[#716569]"}`}>{label}</button>
                ))}
              </div>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou CPF" className="h-11 min-w-64 rounded-xl border border-[#e9dfda] px-4 text-sm outline-none focus:border-[#b91142]" />
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {visible.map((entry) => {
              const { patient, assessment } = entry;
              const responseValue = responseDrafts[assessment.id] ?? assessment.response ?? "";
              return (
                <article key={`${patient.id}-${assessment.id}`} className={`rounded-2xl border p-5 ${assessment.response ? "border-[#d4e9df] bg-[#f8fcfa]" : "border-[#efcbd4] bg-[#fffafb]"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-[#86203b]">{patient.name}</h3>
                      <p className="mt-1 text-xs text-[#817578]">CPF {patient.cpf} · {patient.doctor}</p>
                      <p className="mt-2 text-xs font-semibold">Frasco {assessment.bottleNumber} · enviada em {formatDate(assessment.createdAt, true)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-2 text-xs font-bold ${assessment.response ? "bg-[#e7f6ef] text-[#187157]" : assessment.viewedAt ? "bg-[#eef3ff] text-[#3c5da0]" : "bg-[#fff0f3] text-[#a3113a]"}`}>
                      {assessment.response ? "Respondida" : assessment.viewedAt ? "Visualizada · resposta pendente" : "Nova avaliação"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 rounded-xl bg-white p-4 text-sm md:grid-cols-3">
                    <Info label="Frequência" value={frequencyLabels[assessment.symptomFrequency ?? ""] ?? assessment.symptomFrequency ?? "Avaliação anterior"} />
                    <Info label="Severidade" value={severityLabels[assessment.symptomSeverity ?? ""] ?? assessment.symptomSeverity ?? assessment.feeling ?? "Não informada"} />
                    <Info label="Uso de medicamentos" value={medicationLabels[assessment.medicationFrequency ?? ""] ?? assessment.medicationFrequency ?? "Não informado"} />
                    <div className="md:col-span-3"><Info label="Experiência relatada" value={assessment.notes || "Sem comentário adicional"} /></div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    {!assessment.viewedAt && (
                      <button type="button" onClick={() => void markViewed(entry)} className="self-start rounded-xl border border-[#a3113a] px-4 py-2.5 text-xs font-bold text-[#a3113a]">Marcar como visualizada</button>
                    )}
                    <label className="text-sm font-bold text-[#544449]">
                      Resposta da Secretaria
                      <textarea value={responseValue} onChange={(event) => setResponseDrafts((current) => ({ ...current, [assessment.id]: event.target.value }))} rows={3} placeholder="Escreva o retorno que ficará visível ao paciente e ao médico" className="mt-2 w-full rounded-xl border border-[#e9dfda] bg-white px-4 py-3 font-normal outline-none focus:border-[#b91142]" />
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="button" onClick={() => void saveResponse(entry)} className="rounded-xl bg-[#a3113a] px-5 py-3 text-xs font-bold text-white">{assessment.response ? "Atualizar resposta" : "Salvar resposta"}</button>
                      {assessment.response && <span className="text-xs text-[#187157]">Última resposta por {assessment.respondedBy ?? "Secretaria CRA"} em {formatDate(assessment.respondedAt, true)}</span>}
                    </div>
                  </div>
                </article>
              );
            })}
            {visible.length === 0 && <p className="rounded-2xl border border-dashed border-[#e6dbd6] py-12 text-center text-sm text-[#817578]">Nenhuma avaliação encontrada neste filtro.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, detail, highlight = false }: { label: string; value: string; detail: string; highlight?: boolean }) {
  return <article className={`rounded-3xl border bg-white p-5 shadow-sm ${highlight ? "border-[#e8b7c4]" : "border-[#eee5e0]"}`}><p className="text-sm text-[#817578]">{label}</p><p className={`mt-3 text-3xl font-bold ${highlight ? "text-[#a3113a]" : "text-[#433438]"}`}>{value}</p><p className="mt-2 text-xs text-[#817578]">{detail}</p></article>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <p><strong className="text-[#544449]">{label}:</strong><br /><span className="text-[#716569]">{value}</span></p>;
}
