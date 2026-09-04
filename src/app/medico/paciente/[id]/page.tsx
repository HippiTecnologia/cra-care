"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  availableFormulas,
  treatmentPhases,
} from "../../patient-store";
import type {
  DemoPatientRecord,
  DemoPrescription,
  MedicalRecord,
  PrescriptionFormula,
} from "../../patient-store";
import type { PatientPortalState } from "../../../paciente/patient-portal-store";
import {
  createMedicalPrescription,
  loadMedicalPatientWorkspace,
  prepareMedicalPrescriptionSignature,
  saveMedicalPatientRecord,
  type MedicalDoctorProfile,
} from "../../../../lib/supabase/medical-records";

type Tab = "receitas" | "resumo" | "prontuario" | "historico" | "avaliacoes";

function formatDate(value?: string) {
  if (!value) return "Não informado";

  const date = value.includes("T")
    ? new Date(value)
    : new Date(`${value}T12:00:00`);

  return date.toLocaleDateString("pt-BR");
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function treatmentProgress(patient: DemoPatientRecord) {
  if (!patient.startDate || !patient.totalMonths) return 0;

  const start = new Date(`${patient.startDate}T12:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + patient.totalMonths);

  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;

  return Math.min(
    100,
    Math.max(0, Math.round(((Date.now() - start.getTime()) / total) * 100)),
  );
}

function statusLabel(patient: DemoPatientRecord) {
  if (patient.registrationStatus === "pending-secretary") {
    return "Aguardando cadastro da secretaria";
  }

  if (patient.status === "concluido") return "Tratamento concluído";
  if (patient.status === "desistente") return "Tratamento interrompido";

  return "Tratamento em acompanhamento";
}

export default function MedicalPatientPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;

  const [patient, setPatient] = useState<DemoPatientRecord | null>(null);
  const [prescriptions, setPrescriptions] = useState<DemoPrescription[]>([]);
  const [doctor, setDoctor] = useState<MedicalDoctorProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("receitas");
  const [selectedFormula, setSelectedFormula] = useState(availableFormulas[0]);
  const [formulaPercentage, setFormulaPercentage] = useState("");
  const [formulas, setFormulas] = useState<PrescriptionFormula[]>([]);
  const [phase, setPhase] = useState(treatmentPhases[0]);
  const [bottles, setBottles] = useState(1);
  const [drops, setDrops] = useState(6);
  const [frequency, setFrequency] = useState("3 vezes por semana");
  const [customPosology, setCustomPosology] = useState(false);
  const [posology, setPosology] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<
    string | null
  >(null);
  const [portal, setPortal] = useState<PatientPortalState | null>(null);
  const [medicalRecordDraft, setMedicalRecordDraft] = useState<MedicalRecord>({});
  const [recordSaving, setRecordSaving] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const workspace = await loadMedicalPatientWorkspace(patientId);
        if (!active) return;
        setDoctor(workspace.doctor);
        setPatient(workspace.patient);
        setPrescriptions(workspace.prescriptions);
        setPortal(workspace.portal);
        if (workspace.patient) {
          setMedicalRecordDraft(workspace.patient.medicalRecord ?? {});
          setPhase(workspace.patient.phase ?? treatmentPhases[0]);
          setDrops(workspace.patient.drops ?? 6);
        }
      } catch {
        if (active) setError("Não foi possível carregar o prontuário real deste paciente.");
      } finally {
        if (active) setLoaded(true);
      }
    })();

    return () => { active = false; };
  }, [patientId]);

  const totalPercentage = useMemo(
    () => formulas.reduce((total, formula) => total + formula.percentage, 0),
    [formulas],
  );

  const selectedPrescription = selectedPrescriptionId
    ? prescriptions.find((item) => item.id === selectedPrescriptionId)
    : undefined;

  const generatedPosology = `Aplicar ${drops} gotas, ${frequency}.`;
  const currentPosology = customPosology && posology.trim()
    ? posology.trim()
    : generatedPosology;

  function addFormula() {
    const remainingPercentage = Math.max(0, 100 - totalPercentage);
    const percentage = formulaPercentage.trim()
      ? Number(formulaPercentage.replace(",", "."))
      : remainingPercentage;

    if (remainingPercentage <= 0) {
      setError("A composição já está completa. Remova ou ajuste um componente para adicionar outro.");
      return;
    }

    if (!Number.isFinite(percentage) || percentage <= 0) {
      setError("Informe uma porcentagem maior que zero.");
      return;
    }

    if (totalPercentage + percentage > 100) {
      setError("A composição da receita não pode ultrapassar 100%.");
      return;
    }

    setFormulas((current) => {
      const previous = current.find((item) => item.name === selectedFormula);

      if (previous) {
        return current.map((item) =>
          item.id === previous.id
            ? { ...item, percentage: item.percentage + percentage }
            : item,
        );
      }

      return [
        ...current,
        {
          id: crypto.randomUUID(),
          name: selectedFormula,
          percentage,
        },
      ];
    });

    setFormulaPercentage("");
    setError("");
    setSelectedPrescriptionId(null);
  }

  function clearPrescription() {
    setFormulas([]);
    setFormulaPercentage("");
    setSelectedFormula(availableFormulas[0]);
    setPhase(patient?.phase ?? treatmentPhases[0]);
    setBottles(1);
    setDrops(patient?.drops ?? 6);
    setFrequency("3 vezes por semana");
    setCustomPosology(false);
    setPosology("");
    setNotes("");
    setError("");
    setSelectedPrescriptionId(null);
  }

  async function createPrescription() {
    if (!patient || !doctor) return;

    if (totalPercentage !== 100) {
      setError("A composição precisa fechar exatamente 100%.");
      return;
    }

    if (bottles < 1 || drops < 1) {
      setError("Informe a quantidade de frascos e de gotas.");
      return;
    }

    const prescription: DemoPrescription = {
      id: crypto.randomUUID(),
      patientId: patient.id,
      doctor: doctor.fullName,
      doctorCrm: doctor.crm,
      createdAt: new Date().toISOString(),
      treatment: patient.treatment ?? "Imunoterapia para rinite",
      phase,
      bottles,
      drops,
      frequency,
      posology: currentPosology,
      formulas: formulas.map((formula) => ({ ...formula })),
      notes: notes.trim(),
      signatureStatus: "pending",
    };

    try {
      const saved = await createMedicalPrescription(doctor, patient, prescription);
      setPrescriptions((current) => [saved, ...current]);
      setPatient((current) => current ? {
        ...current,
        phase,
        drops,
        treatment: prescription.treatment,
        status: "com-pedido",
      } : current);

      setMessage(
        "Receita gerada com sucesso. O paciente foi encaminhado para a coluna Paciente com pedido da secretaria.",
      );
      setError("");
      setSelectedPrescriptionId(saved.id);
      setFormulas([]);
      setFormulaPercentage("");
      setNotes("");
    } catch {
      setError("Não foi possível salvar a receita no prontuário. Tente novamente.");
    }
  }

  async function prepareDigitalSignature() {
    if (!selectedPrescription || !doctor) {
      setError("Gere a receita antes de prepará-la para assinatura digital.");
      return;
    }

    if (selectedPrescription.signatureStatus === "signed") {
      setMessage("Esta receita já está assinada digitalmente.");
      return;
    }

    try {
      const prepared = await prepareMedicalPrescriptionSignature(doctor, selectedPrescription);
      setPrescriptions((current) => current.map((item) => item.id === prepared.id ? prepared : item));
      setMessage("Receita preparada para assinatura digital. A conexão com o certificado do médico será ativada quando o assinador for configurado.");
      setError("");
    } catch {
      setError("Não foi possível preparar a receita para assinatura agora.");
    }
  }

  async function saveMedicalRecord() {
    if (!patient || !doctor) return;
    setRecordSaving(true);
    try {
      const saved = await saveMedicalPatientRecord(doctor, patient.id, medicalRecordDraft);
      setMedicalRecordDraft(saved);
      setPatient((current) => current ? { ...current, medicalRecord: saved } : current);
      setError("");
      setMessage("Prontuário clínico salvo com sucesso.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o prontuário.");
    } finally {
      setRecordSaving(false);
    }
  }

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f5f2] text-[#a3113a]">
        Carregando prontuário...
      </main>
    );
  }

  if (!patient) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f5f2] px-5">
        <section className="max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-[#a3113a]">Paciente não encontrado</h1>
          <p className="mt-3 text-sm text-[#776b6e]">
            Volte ao painel do médico e selecione um paciente válido.
          </p>
          <Link href="/medico" className="mt-6 inline-flex rounded-xl bg-[#a3113a] px-5 py-3 text-sm font-semibold text-white">
            Voltar ao painel
          </Link>
        </section>
      </main>
    );
  }

  const preview = selectedPrescription ?? {
    id: "draft",
    patientId: patient.id,
    doctor: doctor?.fullName ?? "Médico responsável",
    doctorCrm: doctor?.crm ?? "",
    createdAt: new Date().toISOString(),
    treatment: patient.treatment ?? "Imunoterapia para rinite",
    phase,
    bottles,
    drops,
    frequency,
    posology: currentPosology,
    formulas,
    notes,
    signatureStatus: "pending" as const,
  };

  const progress = treatmentProgress(patient);
  const printablePatient = patient;

  function printPrescription() {
    if (preview.formulas.length === 0) {
      setError("Adicione a composição antes de imprimir a receita.");
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setError("Permita a abertura de janelas no navegador para imprimir a receita.");
      return;
    }

    const formulaRows = preview.formulas
      .map((formula) => `<tr><td>${escapeHtml(formula.name)}</td><td>${escapeHtml(formula.percentage)}%</td></tr>`)
      .join("");

    printWindow.document.write(`<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Receita - ${escapeHtml(printablePatient.name)}</title>
          <style>
            @page { size: A4; margin: 16mm; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #f6f1ef; color: #34292d; font-family: Arial, sans-serif; font-size: 13px; }
            .document-shell { max-width: 880px; margin: 0 auto; padding: 28px 20px 56px; }
            .document-card { border-radius: 24px; background: white; padding: 42px; box-shadow: 0 18px 50px rgba(52, 41, 45, .14); }
            header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #a3113a; padding: 0 0 18px; color: #34292d; }
            header img { width: 72px; height: 72px; border-radius: 14px; }
            h1 { margin: 0; font-size: 22px; }
            header p { color: #86203b; }
            h2 { margin: 28px 0 18px; border-block: 1px solid #45383c; padding: 9px; text-align: center; font-size: 14px; letter-spacing: .22em; }
            .meta { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 22px; }
            .section { margin-top: 24px; }
            .section-title { color: #a3113a; font-weight: 700; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border-bottom: 1px solid #eadfd9; padding: 9px 4px; text-align: left; }
            th:last-child, td:last-child { text-align: right; }
            .signature { margin: 70px auto 0; width: 320px; border-top: 1px solid #45383c; padding-top: 9px; text-align: center; line-height: 1.6; }
            .footer { margin-top: 36px; color: #817578; font-size: 10px; text-align: center; }
            .document-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-bottom: 16px; }
            .document-actions button { border: 0; border-radius: 10px; padding: 11px 14px; font: 600 13px Arial, sans-serif; cursor: pointer; }
            .print { background: #a3113a; color: white; }
            .close { border: 1px solid #d9c9cc !important; background: white; color: #a3113a; }
            @media print { body { background: white; } .document-shell { max-width: none; padding: 0; } .document-card { border-radius: 0; padding: 0; box-shadow: none; } .footer { position: fixed; bottom: 0; left: 0; right: 0; } .document-actions { display: none; } }
          </style>
        </head>
        <body>
          <main class="document-shell"><div class="document-actions"><button class="print" onclick="window.print()">Imprimir / salvar em PDF</button><button class="close" onclick="window.close()">Fechar e voltar</button></div><article class="document-card">
          <header><div><h1>Receita médica</h1><p>CRA Care · Centro de Rinite e Alergia</p></div><img src="${window.location.origin}/icon.png" alt="CRA Care" /></header>
          <div class="meta">
            <div><strong>Paciente:</strong> ${escapeHtml(printablePatient.name)}</div>
            <div><strong>CPF:</strong> ${escapeHtml(printablePatient.cpf)}</div>
            <div><strong>Atendimento:</strong> ${escapeHtml(formatDate(preview.createdAt))}</div>
            <div><strong>Médico:</strong> ${escapeHtml(preview.doctor)}</div>
          </div>
          <h2>RECEITA</h2>
          <div class="section"><div class="section-title">${escapeHtml(preview.treatment.toUpperCase())}</div><p><strong>Frascos:</strong> ${escapeHtml(preview.bottles)}</p><p><strong>Fase:</strong> ${escapeHtml(preview.phase)}</p></div>
          <div class="section"><div class="section-title">Composição</div><table><thead><tr><th>Componente</th><th>%</th></tr></thead><tbody>${formulaRows}</tbody></table></div>
          <div class="section"><div class="section-title">Posologia</div><p>${escapeHtml(preview.posology)}</p></div>
          ${preview.notes ? `<div class="section"><div class="section-title">Observações</div><p>${escapeHtml(preview.notes)}</p></div>` : ""}
          <div class="signature"><strong>${escapeHtml(preview.doctor)}</strong><br />CRM PR ${escapeHtml(preview.doctorCrm)}<br /><small>${preview.signatureStatus === "signed" ? "Assinada digitalmente" : preview.signatureStatus === "ready" ? "Preparada para assinatura digital" : "Aguardando assinatura digital"}</small></div>
          <p class="footer">Documento gerado pelo CRA Care.</p></article></main>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
  }

  return (
    <main className="min-h-screen bg-[#f8f5f2] px-4 py-6 text-[#34292d] sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1550px]">
        <header className="flex flex-col gap-5 rounded-3xl border border-[#eee4df] bg-white px-6 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/medico" className="rounded-xl bg-[#fff0f3] px-4 py-3 text-sm font-semibold text-[#a3113a]">
              ← Voltar
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">
                Prontuário clínico
              </p>
              <p className="mt-1 text-xs text-[#84777a]">CRA Care · Área médica</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="sm:text-right">
              <p className="font-semibold text-[#a3113a]">{doctor?.fullName ?? "Médico"}</p>
              <p className="mt-1 text-xs text-[#84777a]">CRM PR {doctor?.crm ?? ""}</p>
            </div>
            <Link href="/" className="rounded-xl border border-[#eadfd9] px-4 py-2.5 text-sm font-semibold text-[#a3113a] hover:bg-[#fff5f7]">
              Sair
            </Link>
          </div>
        </header>

        <section className="mt-6 flex flex-col gap-5 rounded-[30px] bg-gradient-to-br from-[#b31340] to-[#790b2a] px-7 py-7 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
              Paciente
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {patient.name}
            </h1>
            <p className="mt-3 text-sm text-white/80">
              CPF: {patient.cpf} · Nascimento: {formatDate(patient.birthDate)}
            </p>
            <p className="mt-2 text-sm text-white/75">
              Início do tratamento: {formatDate(patient.startDate)}
            </p>
          </div>
          <span className="self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold sm:self-center">
            {statusLabel(patient)}
          </span>
        </section>

        <nav className="mt-6 flex flex-wrap gap-3">
          {[
            { id: "receitas", label: "Receitas" },
            { id: "resumo", label: "Resumo clínico" },
            { id: "prontuario", label: "Prontuário" },
            { id: "historico", label: "Histórico de receitas" },
            { id: "avaliacoes", label: "Avaliações" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "bg-[#a3113a] text-white shadow-sm"
                  : "border border-[#ece2dd] bg-white text-[#786a6e]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {message && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[#cfe9df] bg-[#edf8f3] px-4 py-3 text-sm text-[#187157]">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage("")} aria-label="Fechar mensagem">
              ×
            </button>
          </div>
        )}

        {activeTab === "receitas" && (
          <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.94fr]">
            <div className="rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-[#433438]">Nova receita</h2>
                  <p className="mt-1 text-sm text-[#817578]">
                    Crie uma nova versão sem apagar as receitas anteriores.
                  </p>
                </div>
                {selectedPrescription && (
                  <button type="button" onClick={() => setSelectedPrescriptionId(null)} className="text-xs font-semibold text-[#a3113a]">
                    Ver edição
                  </button>
                )}
              </div>

              <div className="mt-7 border-b border-[#f0e8e4] pb-6">
                <h3 className="text-base font-bold text-[#a3113a]">1. Composição</h3>
                <p className="mt-1 text-xs text-[#817578]">Informe uma porcentagem ou deixe o campo vazio para completar automaticamente os 100%.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px]">
                  <select value={selectedFormula} onChange={(event) => setSelectedFormula(event.target.value)} className="h-12 rounded-xl border border-[#e9dfda] bg-white px-4 text-sm outline-none focus:border-[#b91142]">
                    {availableFormulas.map((formula) => (
                      <option key={formula} value={formula}>{formula}</option>
                    ))}
                  </select>
                  <input value={formulaPercentage} onChange={(event) => { setFormulaPercentage(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addFormula(); } }} inputMode="decimal" placeholder={`${Math.max(0, 100 - totalPercentage)}%`} aria-label="Porcentagem da composição" className="h-12 rounded-xl border border-[#e9dfda] px-4 text-sm outline-none focus:border-[#b91142]" />
                </div>
                <button type="button" onClick={addFormula} className="mt-3 rounded-xl bg-[#a3113a] px-4 py-3 text-sm font-semibold text-white">
                  + Adicionar composição
                </button>

                {error && <p role="alert" className="mt-3 rounded-xl bg-[#fff1f3] px-4 py-3 text-sm text-[#a3113a]">{error}</p>}

                <div className="mt-4 space-y-2">
                  {formulas.map((formula) => (
                    <div key={formula.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#fbf6f2] px-4 py-3 text-sm">
                      <span>{formula.name}</span>
                      <div className="flex items-center gap-3">
                        <strong className="text-[#a3113a]">{formula.percentage}%</strong>
                        <button type="button" onClick={() => setFormulas((current) => current.filter((item) => item.id !== formula.id))} className="text-[#8a7d80]" aria-label={`Remover ${formula.name}`}>
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f8f2ef] px-4 py-3">
                  <span className="text-sm font-semibold text-[#6f6165]">Total da composição</span>
                  <strong className={totalPercentage === 100 ? "text-[#187157]" : "text-[#a3113a]"}>
                    {totalPercentage}%
                  </strong>
                </div>
              </div>

              <div className="border-b border-[#f0e8e4] py-6">
                <h3 className="text-base font-bold text-[#a3113a]">2. Fase e frascos</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_140px]">
                  <label className="text-sm text-[#544449]">Fase
                    <select value={phase} onChange={(event) => { setPhase(event.target.value); setSelectedPrescriptionId(null); }} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 outline-none focus:border-[#b91142]">
                      {treatmentPhases.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="text-sm text-[#544449]">Frascos
                    <input type="number" min={1} value={bottles} onChange={(event) => { setBottles(Number(event.target.value)); setSelectedPrescriptionId(null); }} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" />
                  </label>
                </div>
              </div>

              <div className="border-b border-[#f0e8e4] py-6">
                <h3 className="text-base font-bold text-[#a3113a]">3. Posologia</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-[130px_1fr]">
                  <label className="text-sm text-[#544449]">Gotas
                    <input type="number" min={1} value={drops} onChange={(event) => { setDrops(Number(event.target.value)); setSelectedPrescriptionId(null); }} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" />
                  </label>
                  <label className="text-sm text-[#544449]">Frequência
                    <select value={frequency} onChange={(event) => { setFrequency(event.target.value); setSelectedPrescriptionId(null); }} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 outline-none focus:border-[#b91142]">
                      <option>3 vezes por semana</option>
                      <option>2 vezes por semana</option>
                      <option>1 vez por semana</option>
                      <option>1 vez ao dia</option>
                    </select>
                  </label>
                </div>

                <label className="mt-4 flex items-center gap-2 text-sm text-[#6f6165]">
                  <input type="checkbox" checked={customPosology} onChange={(event) => { setCustomPosology(event.target.checked); setSelectedPrescriptionId(null); }} className="h-4 w-4 accent-[#a3113a]" />
                  Personalizar texto da posologia
                </label>

                <textarea value={customPosology ? posology : generatedPosology} onChange={(event) => { setPosology(event.target.value); setSelectedPrescriptionId(null); }} disabled={!customPosology} rows={2} className="mt-3 w-full rounded-xl border border-[#e9dfda] px-4 py-3 text-sm outline-none disabled:bg-[#f7f4f2] disabled:text-[#776b6e]" />
              </div>

              <div className="py-6">
                <label className="text-sm font-semibold text-[#544449]">Observações da receita
                  <textarea value={notes} onChange={(event) => { setNotes(event.target.value); setSelectedPrescriptionId(null); }} rows={3} placeholder="Orientações complementares, se necessário" className="mt-2 w-full rounded-xl border border-[#e9dfda] px-4 py-3 font-normal outline-none focus:border-[#b91142]" />
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={createPrescription} disabled={totalPercentage !== 100} className="rounded-xl bg-[#a3113a] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
                  Gerar receita
                </button>
                <button type="button" onClick={clearPrescription} className="rounded-xl border border-[#e6dbd6] px-5 py-3 text-sm font-semibold text-[#76686c]">
                  Limpar receita
                </button>
                <button type="button" onClick={printPrescription} disabled={preview.formulas.length === 0} className="rounded-xl border border-[#a3113a] px-5 py-3 text-sm font-semibold text-[#a3113a] disabled:cursor-not-allowed disabled:opacity-45">
                  Imprimir receita
                </button>
                <button type="button" onClick={prepareDigitalSignature} disabled={!selectedPrescription || selectedPrescription.signatureStatus === "signed"} className="rounded-xl bg-[#263f73] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
                  {selectedPrescription?.signatureStatus === "ready" ? "Assinatura preparada" : "Assinar digitalmente"}
                </button>
              </div>
            </div>

            <aside className="self-start rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Prévia da receita</p>
                  <p className="mt-1 text-xs text-[#817578]">
                    {selectedPrescription ? "Receita salva no histórico" : "Atualização em tempo real"}
                  </p>
                </div>
                <div className="rounded-xl bg-[#a3113a] px-2 py-1">
                  <Image src="/logo-cra-branca.png" alt="CRA" width={90} height={62} className="h-auto w-[80px]" />
                </div>
              </div>

              <div className="mt-7 rounded-2xl border border-[#eee5e0] bg-[#fffefd] p-5 sm:p-7">
                <div className="space-y-2 text-sm text-[#55474a]">
                  <p><strong>Paciente:</strong> {patient.name}</p>
                  <p><strong>CPF:</strong> {patient.cpf}</p>
                  <p><strong>Atendimento:</strong> {formatDate(preview.createdAt)}</p>
                  <p><strong>Médico:</strong> {preview.doctor}</p>
                </div>

                <h3 className="my-6 border-y border-[#45383c] py-2 text-center text-sm font-bold tracking-[0.2em] text-[#3e3034]">
                  RECEITA
                </h3>

                <p className="text-sm font-bold uppercase text-[#433438]">{preview.treatment}</p>
                <div className="mt-5 space-y-2 text-sm text-[#5a4e51]">
                  <p><strong>Frascos:</strong> {preview.bottles}</p>
                  <p><strong>Fase:</strong> {preview.phase}</p>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-bold text-[#433438]">Composição</p>
                  <table className="mt-3 w-full text-left text-sm">
                    <thead className="border-b border-[#eee5e0] text-[#776b6e]">
                      <tr><th className="pb-2 font-semibold">Componente</th><th className="pb-2 text-right font-semibold">%</th></tr>
                    </thead>
                    <tbody>
                      {preview.formulas.length === 0 ? (
                        <tr><td colSpan={2} className="py-3 text-[#877b7e]">Nenhuma composição adicionada.</td></tr>
                      ) : preview.formulas.map((formula) => (
                        <tr key={formula.id} className="border-b border-[#f3ece8]"><td className="py-2">{formula.name}</td><td className="py-2 text-right">{formula.percentage}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 text-sm"><strong>Posologia:</strong><p className="mt-2 text-[#55474a]">{preview.posology}</p></div>
                {preview.notes && <div className="mt-5 text-sm"><strong>Observações:</strong><p className="mt-2 text-[#55474a]">{preview.notes}</p></div>}

                <div className="mt-12 text-center text-sm">
                  <p className="font-bold text-[#433438]">{preview.doctor}</p>
                  <p className="mt-1 text-[#776b6e]">CRM PR {preview.doctorCrm}</p>
                  <div className={`mt-4 rounded-xl px-3 py-2 text-xs font-semibold ${preview.signatureStatus === "signed" ? "bg-[#edf8f3] text-[#187157]" : preview.signatureStatus === "ready" ? "bg-[#eef3ff] text-[#3c5da0]" : "bg-[#fff5e8] text-[#956426]"}`}>
                    {preview.signatureStatus === "signed" ? "✓ Assinada digitalmente" : preview.signatureStatus === "ready" ? `Pronta para assinatura por ${preview.signaturePreparedBy ?? preview.doctor}` : "Aguardando preparação para assinatura digital"}
                  </div>
                  {preview.signatureStatus === "ready" && <p className="mt-3 text-xs text-[#817578]">Preparada em {formatDate(preview.signaturePreparedAt)}. A assinatura real dependerá do certificado do médico.</p>}
                </div>
              </div>
            </aside>
          </section>
        )}

        {activeTab === "resumo" && (
          <section className="mt-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { title: "Progresso do tratamento", value: `${progress}%` },
                { title: "Frascos recebidos", value: String(patient.bottlesReceived ?? 0) },
                { title: "Posologia atual", value: `${patient.drops ?? 6} gotas` },
                { title: "Receitas registradas", value: String(prescriptions.length) },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-[#eee5e0] bg-white p-6 shadow-sm">
                  <p className="text-sm text-[#817578]">{item.title}</p>
                  <p className="mt-4 text-3xl font-bold text-[#a3113a]">{item.value}</p>
                </div>
              ))}
            </div>

            <article className="rounded-3xl border border-[#eee5e0] bg-white p-7 shadow-sm">
              <h2 className="text-xl font-bold text-[#433438]">Informações do tratamento</h2>
              <div className="mt-5 grid gap-4 text-sm text-[#635559] sm:grid-cols-2">
                <p><strong>Tipo:</strong> {patient.treatment ?? "Aguardando secretaria"}</p>
                <p><strong>Fase:</strong> {patient.phase ?? "A definir"}</p>
                <p><strong>Início:</strong> {formatDate(patient.startDate)}</p>
                <p><strong>Duração:</strong> {patient.totalMonths ? `${patient.totalMonths} meses` : "A definir"}</p>
                <p><strong>Último recebimento:</strong> {formatDate(patient.lastReceivedDate)}</p>
                <p><strong>Entrega:</strong> {patient.delivery ?? "A definir"}</p>
              </div>
              <div className="mt-7 h-3 overflow-hidden rounded-full bg-[#f0e8e5]">
                <div className="h-full rounded-full bg-gradient-to-r from-[#a3113a] to-[#dc4770]" style={{ width: `${progress}%` }} />
              </div>
            </article>
            <article className="rounded-3xl border border-[#eee5e0] bg-white p-7 shadow-sm"><h2 className="text-xl font-bold text-[#433438]">Última avaliação do paciente</h2>{!portal?.assessments[0] ? <p className="mt-4 text-sm text-[#817578]">Aguardando autoavaliação do paciente.</p> : <div className="mt-4 grid gap-3 text-sm text-[#635559] sm:grid-cols-3"><p><strong>Frequência:</strong> {portal.assessments[0].symptomFrequency ?? "Avaliação anterior"}</p><p><strong>Severidade:</strong> {portal.assessments[0].symptomSeverity ?? portal.assessments[0].feeling ?? "Não informada"}</p><p><strong>Medicamentos:</strong> {portal.assessments[0].medicationFrequency ?? "Não informado"}</p>{portal.assessments[0].notes && <p className="sm:col-span-3"><strong>Comentário:</strong> {portal.assessments[0].notes}</p>}</div>}</article>
            <article className="rounded-3xl border border-[#eee5e0] bg-white p-7 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-[#433438]">Adesão ao tratamento</h2><p className="mt-1 text-sm text-[#817578]">Histórico de dias registrados pelo paciente.</p></div><span className="rounded-full bg-[#edf8f3] px-3 py-2 text-sm font-bold text-[#187157]">{portal?.useRecords.length ?? 0} dias corretos</span></div>{!portal?.bottles.length ? <p className="mt-5 text-sm text-[#817578]">O paciente ainda não iniciou um frasco no portal.</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#edf8f3] p-4"><p className="text-xs text-[#187157]">Uso registrado</p><p className="mt-2 text-2xl font-bold text-[#187157]">{portal?.useRecords.length ?? 0} dias</p></div><div className="rounded-2xl bg-[#fff2f3] p-4"><p className="text-xs text-[#a3113a]">Dias marcados como não registrados</p><p className="mt-2 text-2xl font-bold text-[#a3113a]">{Object.values(portal?.dayOverrides ?? {}).filter((value) => value === "nao-registrado").length} dias</p></div></div>}<div className="mt-5 rounded-2xl bg-[#fbf7f5] p-4 text-sm"><strong>Últimos dias de uso:</strong><p className="mt-2 text-[#66595d]">{portal?.useRecords.slice(0, 12).map((record) => formatDate(record.date)).join(" · ") || "Nenhum dia registrado."}</p></div></article>
          </section>
        )}

        {activeTab === "prontuario" && (
          <section className="mt-6 rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Área clínica</p>
                <h2 className="mt-2 text-2xl font-bold text-[#433438]">Prontuário do paciente</h2>
                <p className="mt-2 text-sm text-[#817578]">Registre informações clínicas relevantes para o acompanhamento médico.</p>
              </div>
              {medicalRecordDraft.updatedAt && <p className="text-xs text-[#817578]">Atualizado em {formatDate(medicalRecordDraft.updatedAt)}</p>}
            </div>
            <div className="mt-7">
              <label className="text-sm font-semibold text-[#544449]">
                Histórico clínico
                <textarea value={medicalRecordDraft.history ?? ""} onChange={(event) => setMedicalRecordDraft({ history: event.target.value })} rows={10} placeholder="Antecedentes, exames e evolução clínica." className="mt-2 w-full rounded-xl border border-[#e9dfda] px-4 py-3 font-normal outline-none focus:border-[#b91142]" />
              </label>
            </div>
            {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff1f3] px-4 py-3 text-sm text-[#a3113a]">{error}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => void saveMedicalRecord()} disabled={recordSaving} className="rounded-xl bg-[#a3113a] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{recordSaving ? "Salvando..." : "Salvar histórico"}</button>
              <button type="button" onClick={() => { if (window.confirm("Excluir o histórico clínico?")) { setMedicalRecordDraft({}); void saveMedicalRecord(); } }} disabled={recordSaving || !medicalRecordDraft.history} className="rounded-xl border border-[#e5cbd1] px-5 py-3 text-sm font-semibold text-[#a3113a] disabled:opacity-40">Excluir histórico</button>
            </div>
          </section>
        )}

        {activeTab === "avaliacoes" && (
          <section className="mt-6 rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold text-[#433438]">Avaliações do paciente</h2>
            <p className="mt-2 text-sm text-[#817578]">
              Acompanhe os sintomas e o retorno registrado pela Secretaria. Esta área é somente para consulta médica.
            </p>
            <div className="mt-6 space-y-4">
              {!portal?.assessments.length && (
                <p className="rounded-2xl border border-dashed border-[#e6dbd6] p-8 text-center text-sm text-[#817578]">
                  Nenhuma avaliação enviada.
                </p>
              )}
              {portal?.assessments.map((assessment) => (
                <article key={assessment.id} className={`rounded-2xl border p-5 ${assessment.response ? "border-[#cfe9de] bg-[#f7fcf9]" : assessment.viewedAt ? "border-[#dce4f3] bg-[#f8faff]" : "border-[#efc2cd] bg-[#fff5f7]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">Frasco {assessment.bottleNumber}</h3>
                      <p className="mt-1 text-xs text-[#817578]">Enviada em {formatDate(assessment.createdAt)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${assessment.response ? "bg-[#edf8f3] text-[#187157]" : assessment.viewedAt ? "bg-[#eef3ff] text-[#3c5da0]" : "bg-[#fff0f3] text-[#a3113a]"}`}>
                      {assessment.response ? "Respondida pela Secretaria" : assessment.viewedAt ? "Em análise pela Secretaria" : "Aguardando Secretaria"}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 rounded-xl bg-white p-4 text-sm sm:grid-cols-3">
                    <p><strong>Frequência:</strong><br />{assessment.symptomFrequency ?? "Avaliação anterior"}</p>
                    <p><strong>Severidade:</strong><br />{assessment.symptomSeverity ?? assessment.feeling ?? "Não informada"}</p>
                    <p><strong>Medicamentos:</strong><br />{assessment.medicationFrequency ?? "Não informado"}</p>
                    {assessment.notes && <p className="sm:col-span-3"><strong>Experiência:</strong><br />{assessment.notes}</p>}
                  </div>
                  {assessment.response ? (
                    <div className="mt-4 rounded-xl border border-[#cfe9de] bg-[#edf8f3] p-4 text-sm text-[#187157]">
                      <strong>Retorno da Secretaria</strong>
                      <p className="mt-2 whitespace-pre-wrap">{assessment.response}</p>
                      <p className="mt-3 text-xs">Respondida por {assessment.respondedBy ?? "Secretaria CRA"} em {formatDate(assessment.respondedAt)}</p>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-[#817578]">A Secretaria ainda não registrou um retorno para esta avaliação.</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "historico" && (
          <section className="mt-6 rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold text-[#433438]">Histórico de receitas</h2>
            <p className="mt-2 text-sm text-[#817578]">Cada nova emissão é registrada sem substituir as versões anteriores.</p>

            <div className="mt-6 space-y-4">
              {prescriptions.length === 0 && <p className="rounded-2xl border border-dashed border-[#e6dbd6] p-6 text-center text-sm text-[#817578]">Nenhuma receita emitida para este paciente.</p>}

              {prescriptions.map((prescription, index) => (
                <article key={prescription.id} className="flex flex-col gap-4 rounded-2xl border border-[#eee6e2] bg-[#fdfbf9] p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-sm font-bold text-[#433438]">Receita {String(prescriptions.length - index).padStart(2, "0")}</h3>
                      {index === 0 && <span className="rounded-full bg-[#edf8f3] px-3 py-1 text-xs font-semibold text-[#187157]">Mais recente</span>}
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${prescription.signatureStatus === "signed" ? "bg-[#edf8f3] text-[#187157]" : prescription.signatureStatus === "ready" ? "bg-[#eef3ff] text-[#3c5da0]" : "bg-[#fff5e8] text-[#956426]"}`}>{prescription.signatureStatus === "signed" ? "Assinada" : prescription.signatureStatus === "ready" ? "Pronta para assinar" : "Pendente de assinatura"}</span>
                    </div>
                    <p className="mt-2 text-xs text-[#776b6e]">
                      Emitida em {formatDate(prescription.createdAt)} · {prescription.phase}
                    </p>
                    <p className="mt-1 text-xs text-[#776b6e]">
                      {prescription.bottles} frasco(s) · {prescription.drops} gotas · {prescription.formulas.length} componente(s)
                    </p>
                  </div>
                  <button type="button" onClick={() => { setSelectedPrescriptionId(prescription.id); setActiveTab("receitas"); }} className="self-start rounded-xl border border-[#e6dbd6] px-4 py-3 text-xs font-semibold text-[#a3113a]">
                    Visualizar receita
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        <p className="mt-6 pb-4 text-xs text-[#8a7d80]">
          Prontuário e receitas sincronizados com a base segura do CRA Care.
        </p>
      </div>
    </main>
  );
}
