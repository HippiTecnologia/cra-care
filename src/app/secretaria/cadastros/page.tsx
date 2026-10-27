"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { bottleVolumeOptions, openDemoInvoicePdf } from "../../medico/patient-store";
import type {
  BottleVolumeMl,
  DemoBatch,
  DemoInvoice,
  DemoPatientRecord,
  DemoPrescription,
  DemoStockItem,
  PatientPaymentRecord,
  PrescriptionFormula,
} from "../../medico/patient-store";
import { buildBottleHistory } from "../../paciente/bottle-history";
import { getNextOrderReminders, hasNextOrderDue, hasNextOrderInProgress } from "../next-order";
import {
  PatientPortalState,
  createDefaultPortalState,
} from "../../paciente/patient-portal-store";
import {
  treatmentMethodTotal,
} from "../../adm/admin-store";
import type { AdminTreatmentMethod } from "../../adm/admin-store";
import { loadActiveAdminMethods } from "../../../lib/supabase/admin-records";
import { normalizeBirthDate } from "../../../lib/birth-date";
import { bottlesBeyondCoverage, getBottleBillingState } from "../bottle-billing";
import {
  loadSecretaryBatches,
  loadSecretaryInvoices,
  loadSecretaryPatients,
  loadSecretaryPortals,
  loadSecretaryPrescriptions,
  loadSecretaryStock,
  createSecretaryPatientAccess,
  saveSecretaryBottleAdjustment,
  saveSecretaryStockItem,
  deleteSecretaryManualBottle,
  saveSecretaryPatient,
  saveSecretaryTreatmentFinance,
  type SecretaryContext,
} from "../../../lib/supabase/secretary-records";

type Tab = "pessoais" | "tratamento" | "financeiro";
type TreatmentTrack = "Rinite" | "Imunobacteriana";

function treatmentTrack(value?: string): TreatmentTrack {
  return /bacteriana|imunobacteriana/i.test(value ?? "") ? "Imunobacteriana" : "Rinite";
}

function sixMonthDueDate(): string {
  const today = new Date();
  const targetMonth = today.getMonth() + 6;
  const lastDay = new Date(today.getFullYear(), targetMonth + 1, 0).getDate();
  const dueDate = new Date(today.getFullYear(), targetMonth, Math.min(today.getDate(), lastDay));
  return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`;
}

const statusOptions: Array<[NonNullable<DemoPatientRecord["status"]>, string]> = [
  ["com-pedido", "Com pedido"],
  ["em-conversa", "Em conversa"],
  ["ativo", "Ativo"],
  ["bacteriana", "Bacteriana"],
  ["tentar-novamente", "Tentar novamente"],
  ["perdido", "Perdido"],
  ["desistente", "Desistente"],
  ["em-alta", "Em alta"],
  ["concluido", "Concluído"],
  ["laudo", "Laudo"],
];

const paymentOptions: NonNullable<DemoPatientRecord["paymentMethod"]>[] = [
  "A definir",
  "Dinheiro",
  "PIX",
  "Asaas",
  "Cartão de crédito",
  "Cartão de débito",
];

const paymentStatusOptions: NonNullable<DemoPatientRecord["paymentStatus"]>[] = [
  "A definir",
  "Pendente",
  "Em dia",
  "Vencido",
  "Cancelado",
];

const searchText = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-/]/g, "");

function formatDate(value?: string, includeTime = false) {
  if (!value) return "Não informado";
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: includeTime && value.includes("T") ? "short" : undefined,
  }).format(parsed);
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function parseMoney(value: string) {
  return Number(value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value);
}

function formatBillingDocument(value: string, type: "cpf" | "cnpj") {
  const digits = value.replace(/\D/g, "").slice(0, type === "cnpj" ? 14 : 11);
  if (type === "cnpj") {
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCpf(value: string) {
  return formatBillingDocument(value, "cpf");
}

export default function PatientRecordsPage() {
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [portals, setPortals] = useState<Record<string, PatientPortalState>>({});
  const [context, setContext] = useState<SecretaryContext | null>(null);
  const [prescriptionRecords, setPrescriptionRecords] = useState<DemoPrescription[]>([]);
  const [invoiceRecords, setInvoiceRecords] = useState<DemoInvoice[]>([]);
  const [stockRecords, setStockRecords] = useState<DemoStockItem[]>([]);
  const [batchRecords, setBatchRecords] = useState<DemoBatch[]>([]);
  const [adminMethods, setAdminMethods] = useState<AdminTreatmentMethod[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("pessoais");
  const [draft, setDraft] = useState<DemoPatientRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [financialFeedback, setFinancialFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [savingFinancial, setSavingFinancial] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentBottlePlanId, setPaymentBottlePlanId] = useState("");
  const [paymentAdditionalBottles, setPaymentAdditionalBottles] = useState(0);
  const [installmentNumber, setInstallmentNumber] = useState(1);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPaymentAmount, setEditingPaymentAmount] = useState("");
  const [editingPaymentDate, setEditingPaymentDate] = useState("");
  const [editingPaymentInstallmentNumber, setEditingPaymentInstallmentNumber] = useState(1);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState("");
  const [editingPaymentBottlePlanId, setEditingPaymentBottlePlanId] = useState("");
  const [editingPaymentAdditionalBottles, setEditingPaymentAdditionalBottles] = useState(0);
  const [editingPaymentReference, setEditingPaymentReference] = useState("");
  const [editingPaymentNotes, setEditingPaymentNotes] = useState("");
  const [financialTrack, setFinancialTrack] = useState<TreatmentTrack>("Rinite");
  const [editingBottle, setEditingBottle] = useState<number | null>(null);
  const [bottleReason, setBottleReason] = useState("");
  const [bottleDraft, setBottleDraft] = useState<{ receivedAt: string; startedAt: string; finishedAt: string; status: "recebido" | "em-uso" | "finalizado"; phase: string; bottleVolumeMl: BottleVolumeMl | ""; formulas: PrescriptionFormula[] }>({ receivedAt: "", startedAt: "", finishedAt: "", status: "recebido", phase: "", bottleVolumeMl: "", formulas: [] });
  const [addingBottle, setAddingBottle] = useState(false);
  const [newBottleTreatment, setNewBottleTreatment] = useState<TreatmentTrack>("Rinite");
  const [newBottleVolume, setNewBottleVolume] = useState<BottleVolumeMl>(4);
  const [newBottlePhase, setNewBottlePhase] = useState("");
  const [newBottleFormulas, setNewBottleFormulas] = useState<PrescriptionFormula[]>([]);
  const [newBottleReceivedAt, setNewBottleReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [savingBottle, setSavingBottle] = useState(false);
  const [referenceNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const workspace = await loadSecretaryPatients(undefined, { includeLaudo: true });
        if (!active) return;
        setContext(workspace.context);
        setPatients(workspace.patients);
        const hash = window.location.hash.slice(1);
        const initialId = workspace.patients.some((item) => item.id === hash) ? hash : workspace.patients[0]?.id ?? "";
        setSelectedId(initialId);
        setDraft(workspace.patients.find((item) => item.id === initialId) ?? null);
        const [loadedPortals, loadedPrescriptions, loadedInvoices, loadedStock, loadedBatches, loadedMethods] = await Promise.all([
          loadSecretaryPortals(workspace.patients.map((item) => item.id), workspace.context),
          loadSecretaryPrescriptions(workspace.context),
          loadSecretaryInvoices(workspace.context),
          loadSecretaryStock(workspace.context),
          loadSecretaryBatches(workspace.context),
          loadActiveAdminMethods(workspace.context),
        ]);
        if (!active) return;
        setPortals(loadedPortals);
        setPrescriptionRecords(loadedPrescriptions);
        setInvoiceRecords(loadedInvoices);
        setStockRecords(loadedStock);
        setBatchRecords(loadedBatches);
        setAdminMethods(loadedMethods);
      } catch {
        if (active) setMessage("Não foi possível carregar os cadastros reais da Secretaria.");
      }
    })();
    return () => { active = false; };
  }, []);

  const patient = patients.find((item) => item.id === selectedId);

  const visible = useMemo(() => {
    const term = searchText(search);
    return patients.filter((item) => !term || searchText(`${item.name} ${item.cpf}`).includes(term));
  }, [patients, search]);

  const portal = patient ? portals[patient.id] ?? createDefaultPortalState(patient.id) : undefined;
  const prescriptions = patient ? prescriptionRecords.filter((item) => item.patientId === patient.id) : [];
  const invoices = patient ? invoiceRecords.filter((item) => item.patientId === patient.id) : [];
  const stock = patient ? stockRecords.filter((item) => item.patientId === patient.id) : [];
  const bottleHistory = patient && portal ? buildBottleHistory(patient, portal, stock, prescriptions) : [];
  const dueOrderReminders = patient && portal
    ? getNextOrderReminders(patient, bottleHistory, prescriptions, referenceNow).filter((reminder) =>
      hasNextOrderDue(reminder.date, referenceNow)
      && !hasNextOrderInProgress(patient.id, reminder.treatment, stockRecords, batchRecords),
    )
    : [];
  const overdueBottles = dueOrderReminders.map((reminder) => bottleHistory
    .filter((item) => treatmentTrack(item.treatment) === (reminder.treatment === "imunobacteriana" ? "Imunobacteriana" : "Rinite"))
    .sort((first, second) => second.number - first.number)[0])
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const treatmentTracks = Array.from(new Set([
    ...prescriptions.map((item) => treatmentTrack(item.treatment)),
    ...(patient?.treatmentBottles ?? []).map((item) => item.treatment),
  ]));
  const visibleTreatmentTracks: TreatmentTrack[] = treatmentTracks.length
    ? treatmentTracks
    : patient?.treatment ? [treatmentTrack(patient.treatment)] : [];
  const activeFinancialTrack = visibleTreatmentTracks.includes(financialTrack)
    ? financialTrack
    : visibleTreatmentTracks[0] ?? "Rinite";
  const activeTreatmentPayment = patient?.treatmentPayments?.find((item) => item.treatment === activeFinancialTrack);
  const activeDraftPayment = draft?.treatmentPayments?.find((item) => item.treatment === activeFinancialTrack);
  const legacyFinancialAllowed = visibleTreatmentTracks.length <= 1;
  const activeContractValue = activeTreatmentPayment?.contractValue ?? (legacyFinancialAllowed ? patient?.contractValue : 0) ?? 0;
  const unassignedPayments = (patient?.payments ?? []).filter((item) => !item.treatment);
  const activePayments = (patient?.payments ?? []).filter((item) =>
    item.treatment === activeFinancialTrack || (!item.treatment && legacyFinancialAllowed),
  );
  const totalPaid = activePayments.filter((item) => !item.historicalImport).reduce((sum, item) => sum + item.amount, 0);
  const remaining = Math.max(0, activeContractValue - totalPaid);
  const newBottleBilling = patient
    ? getBottleBillingState(patient, newBottleTreatment, stockRecords, batchRecords)
    : undefined;
  const activeBottlePlans = (draft?.treatmentBottles ?? patient?.treatmentBottles ?? []).filter((item) => item.treatment === activeFinancialTrack);

  function updateDraft<K extends keyof DemoPatientRecord>(key: K, value: DemoPatientRecord[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function fillAddressFromZipCode(value: string) {
    const zipCode = value.replace(/\D/g, "");
    if (zipCode.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${zipCode}/json/`);
      const address = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (!response.ok || address.erro) {
        setMessage("CEP não encontrado. Confira o número ou preencha o endereço manualmente.");
        return;
      }
      setDraft((current) => current ? {
        ...current,
        zipCode,
        street: address.logradouro || current.street,
        neighborhood: address.bairro || current.neighborhood,
        city: address.localidade || current.city,
        state: address.uf || current.state,
      } : current);
      setMessage("Endereço preenchido automaticamente pelo CEP. Informe apenas o número e complemento, se houver.");
    } catch {
      setMessage("Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente.");
    }
  }

  async function saveDraft(section: string) {
    if (section.startsWith("Financeiro")) {
      await saveFinancialDraft();
      return;
    }
    if (!draft) return;
    if (!draft.name.trim() || !draft.cpf.trim() || !draft.birthDate) {
      setMessage("Nome completo, CPF e data de nascimento são obrigatórios.");
      return;
    }
    if (!context) { setMessage("Sessão da Secretaria não identificada."); return; }
    try {
      const completedPatient: DemoPatientRecord = { ...draft, registrationStatus: "completed" };
      const savedPatient = await saveSecretaryPatient(context, completedPatient);
      let patientWithAccess = completedPatient;
      let accessMessage = "";
      if (!savedPatient.hasPatientAccess) {
        const access = await createSecretaryPatientAccess(completedPatient);
        patientWithAccess = { ...completedPatient, username: access.username };
        accessMessage = " O acesso do paciente foi criado.";
      }
      setDraft(patientWithAccess);
      setPatients((current) => current.map((item) => item.id === draft.id ? patientWithAccess : item));
      setEditing(false);
      setMessage(`${section} atualizados no Supabase com sucesso.${accessMessage}`);
    } catch {
      setMessage(`Não foi possível salvar ${section.toLowerCase()}.`);
    }
  }

  async function saveFinancialDraft() {
    if (!draft || savingFinancial) return;
    if (!context || !patient) {
      setFinancialFeedback({ kind: "error", text: "Sessão da Secretaria ou paciente não identificado. Atualize a página e tente novamente." });
      return;
    }
    const currentPayment = draft.treatmentPayments?.find((item) => item.treatment === activeFinancialTrack);
    if (!currentPayment) {
      setFinancialFeedback({ kind: "error", text: "Selecione o método de aquisição antes de salvar." });
      return;
    }
    const payment = { ...currentPayment, dueDate: currentPayment.dueDate || sixMonthDueDate() };
    const updated: DemoPatientRecord = {
      ...draft,
      treatmentPayments: (draft.treatmentPayments ?? []).map((item) => item.treatment === activeFinancialTrack ? payment : item),
    };
    const previousQuota = getBottleBillingState(patient, activeFinancialTrack, stockRecords, batchRecords);
    const nextQuota = getBottleBillingState(updated, activeFinancialTrack, stockRecords, batchRecords);
    if (nextQuota.coveredBottles < previousQuota.coveredBottles && nextQuota.coveredBottles < nextQuota.committedBottles) {
      setFinancialFeedback({ kind: "error", text: `A cobertura não pode cair para ${nextQuota.coveredBottles} frasco(s): ${nextQuota.committedBottles} já estão registrados ou em andamento.` });
      return;
    }
    setSavingFinancial(true);
    setFinancialFeedback(null);
    try {
      const savedPayments = await saveSecretaryTreatmentFinance(context, draft.id, payment);
      setDraft({ ...updated, treatmentPayments: savedPayments });
      setPatients((current) => current.map((item) => item.id === draft.id ? { ...item, treatmentPayments: savedPayments } : item));
      setEditing(false);
      setMessage("");
      setFinancialFeedback({ kind: "success", text: `Financeiro de ${activeFinancialTrack} salvo com sucesso.` });
    } catch (cause) {
      setFinancialFeedback({ kind: "error", text: cause instanceof Error ? cause.message : "Não foi possível salvar o financeiro. Tente novamente." });
    } finally {
      setSavingFinancial(false);
    }
  }

  async function addPayment() {
    if (!patient || !draft) return;
    const parsed = parseMoney(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage("Informe um valor de pagamento válido.");
      return;
    }
    const payment: PatientPaymentRecord = {
      id: crypto.randomUUID(),
      treatment: activeFinancialTrack,
      bottlePlanId: paymentBottlePlanId || undefined,
      additionalBottles: Math.max(0, Math.trunc(paymentAdditionalBottles)),
      amount: parsed,
      paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
      method: activeDraftPayment?.paymentMethod ?? (legacyFinancialAllowed ? draft.paymentMethod : undefined) ?? "A definir",
      installments: Math.max(1, activeDraftPayment?.installments ?? (legacyFinancialAllowed ? draft.paymentInstallments : undefined) ?? 1),
      installmentNumber: Math.max(1, activeDraftPayment?.installments ?? (legacyFinancialAllowed ? draft.paymentInstallments : undefined) ?? 1) > 1 ? installmentNumber : undefined,
      dueAt: activeDraftPayment?.dueDate ?? (legacyFinancialAllowed ? draft.paymentDueDate : undefined),
      asaasReference: paymentReference.trim() || undefined,
      notes: paymentNotes.trim() || undefined,
    };
    const updated = {
      ...draft,
      paymentStatus: "Em dia" as const,
      treatmentPayments: (draft.treatmentPayments ?? []).map((item) => item.treatment === activeFinancialTrack ? { ...item, paymentStatus: "Em dia" as const } : item),
      payments: [payment, ...(patient.payments ?? [])],
    };
    if (!context) return;
    try {
      await saveSecretaryPatient(context, updated);
      setDraft(updated);
      setPatients((current) => current.map((item) => item.id === updated.id ? updated : item));
      setAmount("");
      setPaymentNotes("");
      setPaymentReference("");
      setPaymentBottlePlanId("");
      setPaymentAdditionalBottles(0);
      setInstallmentNumber(1);
      setMessage(`Pagamento de ${activeFinancialTrack} registrado no Supabase pela Secretaria.`);
    } catch {
      setMessage("Não foi possível registrar o pagamento.");
    }
  }

  function startEditingPayment(payment: PatientPaymentRecord) {
    setEditingPaymentId(payment.id);
    setEditingPaymentAmount(String(payment.amount));
    setEditingPaymentDate(payment.paidAt?.slice(0, 10) || new Date().toISOString().slice(0, 10));
    setEditingPaymentInstallmentNumber(Math.max(1, payment.installmentNumber ?? 1));
    setEditingPaymentMethod(payment.method);
    setEditingPaymentBottlePlanId(payment.bottlePlanId ?? "");
    setEditingPaymentAdditionalBottles(Math.max(0, Math.trunc(payment.additionalBottles ?? 0)));
    setEditingPaymentReference(payment.asaasReference ?? "");
    setEditingPaymentNotes(payment.notes ?? "");
    setMessage("");
  }

  function cancelEditingPayment() {
    setEditingPaymentId(null);
    setEditingPaymentAmount("");
    setEditingPaymentDate("");
    setEditingPaymentInstallmentNumber(1);
    setEditingPaymentMethod("");
    setEditingPaymentBottlePlanId("");
    setEditingPaymentAdditionalBottles(0);
    setEditingPaymentReference("");
    setEditingPaymentNotes("");
  }

  async function saveEditedPayment() {
    if (!draft || !editingPaymentId) return;
    const parsed = parseMoney(editingPaymentAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage("Informe um valor de pagamento válido.");
      return;
    }
    if (!editingPaymentDate) {
      setMessage("Informe a data do pagamento.");
      return;
    }
    const paidAt = new Date(`${editingPaymentDate}T12:00:00`);
    if (Number.isNaN(paidAt.getTime())) {
      setMessage("Confira a data do pagamento.");
      return;
    }
    const updated = {
      ...draft,
      payments: (draft.payments ?? []).map((payment) => payment.id === editingPaymentId ? {
        ...payment,
        amount: parsed,
        paidAt: paidAt.toISOString(),
        installmentNumber: Math.max(1, Math.trunc(editingPaymentInstallmentNumber)),
        method: editingPaymentMethod || payment.method,
        bottlePlanId: editingPaymentBottlePlanId || undefined,
        additionalBottles: Math.max(0, Math.trunc(editingPaymentAdditionalBottles)),
        asaasReference: editingPaymentReference.trim() || undefined,
        notes: editingPaymentNotes.trim() || undefined,
      } : payment),
    };
    const quota = getBottleBillingState(updated, activeFinancialTrack, stockRecords, batchRecords);
    if (quota.committedBottles > quota.coveredBottles) {
      setMessage(`Não é possível reduzir/remover essa quantidade: ${quota.committedBottles} frasco(s) já foram registrados ou estão em andamento e a cobertura ficaria em ${quota.coveredBottles}.`);
      return;
    }
    if (!context) return;
    try {
      await saveSecretaryPatient(context, updated);
      setDraft(updated);
      setPatients((current) => current.map((item) => item.id === updated.id ? updated : item));
      cancelEditingPayment();
      setMessage("Pagamento atualizado sem alterar o histórico dos outros lançamentos.");
    } catch {
      setMessage("Não foi possível atualizar o pagamento.");
    }
  }

  async function removePayment(paymentId: string) {
    if (!draft) return;
    const updated = { ...draft, payments: (draft.payments ?? []).filter((item) => item.id !== paymentId) };
    const quota = getBottleBillingState(updated, activeFinancialTrack, stockRecords, batchRecords);
    if (quota.committedBottles > quota.coveredBottles) {
      setMessage(`Não é possível remover este pagamento: ${quota.committedBottles} frasco(s) já foram registrados ou estão em andamento e a cobertura ficaria em ${quota.coveredBottles}.`);
      return;
    }
    if (!context) return;
    try {
      await saveSecretaryPatient(context, updated);
      setDraft(updated);
      setPatients((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage("Lançamento removido do histórico real.");
    } catch {
      setMessage("Não foi possível remover o lançamento.");
    }
  }

  function selectPatient(id: string) {
    cancelEditingPayment();
    setFinancialFeedback(null);
    const selectedTracks = Array.from(new Set(prescriptionRecords.filter((item) => item.patientId === id).map((item) => treatmentTrack(item.treatment))));
    setSelectedId(id);
    setDraft(patients.find((item) => item.id === id) ?? null);
    setEditing(false);
    setMessage("");
    setFinancialTrack(selectedTracks[0] ?? "Rinite");
    window.history.replaceState(null, "", `#${id}`);
  }

  function chooseMethod(method: AdminTreatmentMethod, condition: "À vista" | "Parcelado", track: TreatmentTrack) {
    setFinancialFeedback(null);
    const total = treatmentMethodTotal(method);
    const agreedValue = condition === "À vista" && method.cashValue ? method.cashValue : total;
    setDraft((current) => {
      if (!current) return current;
      const payments = [...(current.treatmentPayments ?? [])];
      const index = payments.findIndex((item) => item.treatment === track);
      const previous: NonNullable<DemoPatientRecord["treatmentPayments"]>[number] = index >= 0 ? payments[index] : { treatment: track };
      const sameMethod = previous.methodSnapshotId === method.id;
      const installmentCount = condition === "À vista" ? 1 : method.category === "Recorrente" ? method.billingPeriodMonths : method.maxInstallments;
      const next = {
        ...previous,
        treatment: track,
        acquisitionMethod: method.name,
        methodCategory: method.category,
        bottlesIncluded: sameMethod ? previous.bottlesIncluded : undefined,
        agreedCondition: condition,
        methodSnapshotId: method.id,
        methodSnapshotVersion: method.version,
        contractValue: agreedValue,
        dueDate: previous.dueDate ?? sixMonthDueDate(),
        installmentValue: agreedValue / Math.max(1, installmentCount),
        discountAmount: Math.max(0, total - agreedValue),
        paymentMethod: method.paymentMethod,
        installments: installmentCount,
        paymentStatus: sameMethod ? previous.paymentStatus ?? "Pendente" : "Pendente" as const,
      };
      if (index >= 0) payments[index] = next; else payments.push(next);
      return { ...current, treatmentPayments: payments };
    });
    setEditing(true);
    setFinancialTrack(track);
    setMessage(`${method.name} selecionado para ${track}: ${condition.toLowerCase()} por ${money(agreedValue)}.`);
  }

  function openBottleEditor(number: number) {
    const item = bottleHistory.find((entry) => entry.number === number);
    if (!item) return;
    setEditingBottle(number);
    setBottleReason("");
    setBottleDraft({ receivedAt: item.receivedAt?.slice(0, 10) ?? "", startedAt: item.startedAt?.slice(0, 10) ?? "", finishedAt: item.finishedAt?.slice(0, 10) ?? "", status: item.status, phase: item.phase ?? "", bottleVolumeMl: treatmentTrack(item.treatment) === "Imunobacteriana" ? 9 : item.bottleVolumeMl ?? "", formulas: (item.formulas ?? []).map((formula) => ({ ...formula })) });
  }

  function openAddBottleForm() {
    const initialTrack = visibleTreatmentTracks[0] ?? (patient?.treatment ? treatmentTrack(patient.treatment) : "Rinite");
    const latestPrescription = prescriptionRecords
      .filter((item) => item.patientId === patient?.id && treatmentTrack(item.treatment) === initialTrack)
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())[0];
    setNewBottleTreatment(initialTrack);
    setNewBottleVolume(initialTrack === "Imunobacteriana" ? 9 : latestPrescription?.bottleVolumeMl ?? 4);
    setNewBottlePhase(latestPrescription?.phase ?? "");
    setNewBottleFormulas((latestPrescription?.formulas ?? []).map((formula) => ({ ...formula })));
    setNewBottleReceivedAt(new Date().toISOString().slice(0, 10));
    setAddingBottle(true);
  }

  function selectBottleTreatment(value: TreatmentTrack) {
    setNewBottleTreatment(value);
    const latestPrescription = prescriptionRecords
      .filter((item) => item.patientId === patient?.id && treatmentTrack(item.treatment) === value)
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())[0];
    setNewBottleVolume(value === "Imunobacteriana" ? 9 : latestPrescription?.bottleVolumeMl ?? 4);
    setNewBottlePhase(latestPrescription?.phase ?? "");
    setNewBottleFormulas((latestPrescription?.formulas ?? []).map((formula) => ({ ...formula })));
  }

  function addFormula(setFormulas: (update: (current: PrescriptionFormula[]) => PrescriptionFormula[]) => void) {
    setFormulas((current) => [...current, { id: crypto.randomUUID(), name: "", percentage: 0 }]);
  }

  async function addBottleToHistory() {
    if (!patient || !context) return;
    if (!newBottleReceivedAt) { setMessage("Informe a data de recebimento do frasco."); return; }
    if (!newBottlePhase.trim()) { setMessage("Informe a fase do frasco."); return; }
    if (newBottleFormulas.length === 0 || newBottleFormulas.some((formula) => !formula.name.trim() || !Number.isFinite(formula.percentage) || formula.percentage <= 0)) {
      setMessage("Informe ao menos uma fórmula com nome e concentração maior que zero.");
      return;
    }
    const quota = getBottleBillingState(patient, newBottleTreatment, stockRecords, batchRecords);
    if (quota.coveredBottles < 1) {
      setMessage(`Informe quantos frascos o pagamento cobre em Condições financeiras de ${newBottleTreatment} antes de registrar a entrega.`);
      return;
    }
    if (bottlesBeyondCoverage(quota, 1) > 0) {
      setMessage(`Limite de ${quota.coveredBottles} frasco(s) atingido. Registre uma nova cobrança na aba Financeiro e informe quantos frascos adicionais ela libera antes de registrar outra entrega.`);
      return;
    }
    setSavingBottle(true);
    const isImmunobacterial = newBottleTreatment === "Imunobacteriana";
    const deliveredAt = new Date(`${newBottleReceivedAt}T12:00:00`).toISOString();
    const item: DemoStockItem = {
      id: crypto.randomUUID(),
      batchId: "",
      batchCode: "ADICIONADO MANUALMENTE",
      prescriptionId: "",
      patientId: patient.id,
      patientName: patient.name,
      patientCpf: patient.cpf,
      doctor: patient.doctor,
      treatment: isImmunobacterial ? "Vacina Imunobacteriana" : "Vacina Rinite",
      phase: newBottlePhase.trim(),
      bottles: 1,
      bottleVolumeMl: isImmunobacterial ? 9 : newBottleVolume,
      formulas: newBottleFormulas.filter((formula) => formula.name.trim()).map((formula) => ({ ...formula, name: formula.name.trim() })),
      delivery: patient.delivery,
      laboratory: "Registro manual da Secretaria",
      receivedAt: newBottleReceivedAt,
      checkedBy: context.fullName,
      status: "entregue",
      deliveredAt,
    };
    try {
      const savedBottle = await saveSecretaryStockItem(context, item, patient.bottlesReceived ?? 0);
      const bottleNumber = savedBottle.bottleNumber ?? bottleHistory.length + 1;
      setStockRecords((current) => [savedBottle, ...current.filter((record) => record.id !== savedBottle.id)]);
      setPortals((current) => {
        const currentPortal = current[patient.id] ?? createDefaultPortalState(patient.id);
        if (currentPortal.bottles.some((bottle) => bottle.id === savedBottle.id)) return current;
        return {
          ...current,
          [patient.id]: {
            ...currentPortal,
            bottles: [...currentPortal.bottles, {
              id: savedBottle.id,
              number: bottleNumber,
              treatment: item.treatment,
              receivedAt: newBottleReceivedAt,
              startedAt: "",
              status: "recebido",
            }],
          },
        };
      });
      setAddingBottle(false);
      setMessage(`Frasco ${bottleNumber} vinculado diretamente ao paciente e registrado como entregue.`);
    } catch {
      setMessage("Não foi possível adicionar o frasco. Confira a conexão e a atualização do banco de dados.");
    } finally {
      setSavingBottle(false);
    }
  }

  async function saveBottleAdjustment() {
    if (!portal || !editingBottle) return;
    if (!bottleReason.trim()) { setMessage("Informe o motivo do ajuste no histórico do frasco."); return; }
    if (!context || !patient) return;
    const adjustment = { ...bottleDraft, bottleVolumeMl: bottleDraft.bottleVolumeMl === "" ? undefined : bottleDraft.bottleVolumeMl, reason: bottleReason.trim(), updatedAt: new Date().toISOString(), updatedBy: context.fullName };
    try {
      await saveSecretaryBottleAdjustment(context, patient.id, editingBottle, adjustment);
      setPortals((current) => ({
        ...current,
        [patient.id]: { ...portal, bottleHistoryAdjustments: { ...(portal.bottleHistoryAdjustments ?? {}), [editingBottle]: adjustment } },
      }));
      setStockRecords((current) => current.map((item) => item.patientId === patient.id && item.bottleNumber === editingBottle ? {
        ...item,
        phase: adjustment.phase ?? item.phase,
        bottleVolumeMl: (adjustment.bottleVolumeMl as BottleVolumeMl | undefined) ?? item.bottleVolumeMl,
        formulas: adjustment.formulas ?? item.formulas,
        receivedAt: adjustment.receivedAt ?? item.receivedAt,
      } : item));
      setEditingBottle(null);
      setMessage(`Histórico do frasco ${editingBottle} atualizado no Supabase.`);
    } catch {
      setMessage("Não foi possível salvar o ajuste do frasco.");
    }
  }

  async function deleteManualBottle(number: number) {
    if (!patient || !context) return;
    const item = stock.find((record) => record.bottleNumber === number && record.batchCode === "ADICIONADO MANUALMENTE");
    if (!item) return;
    const confirmed = window.confirm(`Excluir o frasco ${number} registrado manualmente? Ele sairá do histórico e de Pedidos e entregas. Esta ação ficará registrada no sistema.`);
    if (!confirmed) return;
    try {
      await deleteSecretaryManualBottle(context, patient.id, item.id);
      setStockRecords((current) => current.filter((record) => record.id !== item.id));
      setPortals((current) => {
        const currentPortal = current[patient.id] ?? createDefaultPortalState(patient.id);
        return {
          ...current,
          [patient.id]: {
            ...currentPortal,
            bottles: currentPortal.bottles.filter((bottle) => bottle.id !== item.id),
            deletedBottleNumbers: [...new Set([...(currentPortal.deletedBottleNumbers ?? []), number])],
            bottleHistoryAdjustments: Object.fromEntries(Object.entries(currentPortal.bottleHistoryAdjustments ?? {}).filter(([bottleNumber]) => Number(bottleNumber) !== number)),
          },
        };
      });
      setMessage(`Frasco manual ${number} excluído do histórico e de Pedidos e entregas.`);
    } catch {
      setMessage("Não foi possível excluir o frasco manual. Confira a conexão e tente novamente.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f5f2] p-4 text-[#34292d] sm:p-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#a3113a]">Secretaria</p><h1 className="mt-2 text-3xl font-bold">Cadastros completos</h1><p className="mt-2 text-sm text-[#817578]">Dados pessoais, tratamento e financeiro em um único lugar.</p></div>
          <Link href="/secretaria" className="rounded-xl border border-[#e6dbd6] bg-white px-4 py-3 text-sm font-semibold text-[#a3113a]">← Voltar</Link>
        </header>

        {financialFeedback && tab === "financeiro" && <div role={financialFeedback.kind === "error" ? "alert" : "status"} className={`fixed bottom-4 right-4 z-50 flex max-w-[min(460px,calc(100vw-2rem))] items-start gap-3 rounded-2xl border p-4 text-sm font-semibold shadow-xl ${financialFeedback.kind === "error" ? "border-[#efb8c4] bg-[#fff1f3] text-[#8b1734]" : "border-[#cfe9de] bg-[#edf8f3] text-[#187157]"}`}><span>{financialFeedback.text}</span><button type="button" onClick={() => setFinancialFeedback(null)} aria-label="Fechar mensagem financeira">×</button></div>}
        {message && <div className="mt-5 flex items-center justify-between rounded-2xl border border-[#cfe9de] bg-[#edf8f3] px-4 py-3 text-sm font-semibold text-[#187157]"><span>{message}</span><button type="button" onClick={() => setMessage("")} aria-label="Fechar mensagem">×</button></div>}

        <div className="mt-7 grid gap-5 lg:grid-cols-[340px_1fr]">
          <aside className="self-start rounded-3xl border border-[#eee5e0] bg-white p-5 lg:sticky lg:top-5">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou CPF" className="h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" />
            <p className="mt-3 text-xs text-[#817578]">{visible.length} paciente(s) encontrado(s)</p>
            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {visible.map((item) => <button key={item.id} type="button" onClick={() => selectPatient(item.id)} className={`w-full rounded-xl p-4 text-left transition ${selectedId === item.id ? "bg-[#fff0f3] text-[#a3113a] ring-1 ring-[#efc9d3]" : "bg-[#fbf7f5] hover:bg-[#f7efec]"}`}><strong className="text-sm">{item.name}</strong><p className="mt-1 text-xs opacity-70">{item.cpf}</p></button>)}
              {visible.length === 0 && <p className="py-8 text-center text-sm text-[#817578]">Nenhum paciente encontrado.</p>}
            </div>
          </aside>

          {patient && draft ? <section className="min-w-0 rounded-3xl border border-[#eee5e0] bg-white p-5 sm:p-7">
            <div className="flex flex-wrap justify-between gap-4">
              <div><h2 className="text-2xl font-bold text-[#86203b]">{patient.name}</h2><p className="mt-1 text-sm text-[#817578]">CPF {patient.cpf} · {patient.doctor}</p></div>
              <div className="flex items-center gap-2"><span className="rounded-full bg-[#edf8f3] px-3 py-2 text-xs font-semibold text-[#187157]">{statusOptions.find(([value]) => value === patient.status)?.[1] ?? "Em conversa"}</span><button type="button" onClick={() => { setDraft(patient); setEditing((current) => !current); }} className="rounded-xl border border-[#e5d9d4] px-4 py-2 text-xs font-bold text-[#a3113a]">{editing ? "Cancelar edição" : "Editar cadastro"}</button></div>
            </div>

            <nav className="mt-6 flex flex-wrap gap-2">{([["pessoais", "Dados pessoais"], ["tratamento", "Dados do tratamento"], ["financeiro", "Dados financeiros"]] as [Tab, string][]).map(([id, label]) => <button key={id} type="button" onClick={() => { setTab(id); setEditing(false); setDraft(patient); }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${tab === id ? "bg-[#a3113a] text-white" : "bg-[#f6efec] text-[#716569]"}`}>{label}</button>)}</nav>

            {tab === "pessoais" && <div className="mt-6">{editing ? <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo *"><input required value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} className={inputClass} /></Field>
              <Field label="CPF *"><input required inputMode="numeric" maxLength={14} value={draft.cpf} onChange={(event) => updateDraft("cpf", formatCpf(event.target.value))} placeholder="000.000.000-00" className={inputClass} /></Field>
              <Field label="Data de nascimento *"><input type="date" required value={draft.birthDate} onChange={(event) => updateDraft("birthDate", event.target.value)} onPaste={(event) => { const date = normalizeBirthDate(event.clipboardData.getData("text")); if (!date) return; event.preventDefault(); updateDraft("birthDate", date); }} className={inputClass} /><span className="mt-1 block text-xs text-[#817578]">Você pode selecionar ou colar DD/MM/AAAA.</span></Field>
              <Field label="Telefone / WhatsApp (opcional)"><input value={draft.phone ?? ""} onChange={(event) => updateDraft("phone", event.target.value)} className={inputClass} /></Field>
              <Field label="E-mail (opcional)"><input type="email" value={draft.email ?? ""} onChange={(event) => updateDraft("email", event.target.value)} placeholder="paciente@exemplo.com" className={inputClass} /></Field>
              <Field label="Médico responsável"><input value={draft.doctor} onChange={(event) => updateDraft("doctor", event.target.value)} className={inputClass} /></Field>
              <Field label="CEP"><input inputMode="numeric" maxLength={9} value={draft.zipCode ?? ""} onChange={(event) => updateDraft("zipCode", event.target.value.replace(/\D/g, "").replace(/(\d{5})(\d)/, "$1-$2"))} onBlur={(event) => fillAddressFromZipCode(event.target.value)} placeholder="00000-000" className={inputClass} /><span className="mt-1 block text-xs text-[#817578]">Ao informar o CEP, rua, bairro, cidade e estado são preenchidos automaticamente.</span></Field>
              <Field label="Rua"><input value={draft.street ?? draft.address ?? ""} onChange={(event) => updateDraft("street", event.target.value)} className={inputClass} /></Field>
              <Field label="Número"><input value={draft.addressNumber ?? ""} onChange={(event) => updateDraft("addressNumber", event.target.value)} className={inputClass} /></Field>
              <Field label="Complemento"><input value={draft.addressComplement ?? ""} onChange={(event) => updateDraft("addressComplement", event.target.value)} className={inputClass} /></Field>
              <Field label="Bairro"><input value={draft.neighborhood ?? ""} onChange={(event) => updateDraft("neighborhood", event.target.value)} className={inputClass} /></Field>
              <Field label="Cidade"><input value={draft.city ?? ""} onChange={(event) => updateDraft("city", event.target.value)} className={inputClass} /></Field>
              <Field label="Estado"><input value={draft.state ?? ""} onChange={(event) => updateDraft("state", event.target.value)} maxLength={2} className={inputClass} /></Field>
              <Field label="Nome para nota fiscal"><input value={draft.billingName ?? ""} onChange={(event) => updateDraft("billingName", event.target.value)} className={inputClass} /></Field>
              <Field label="Tipo de documento"><select value={draft.billingDocumentType ?? "cpf"} onChange={(event) => updateDraft("billingDocumentType", event.target.value as "cpf" | "cnpj")} className={inputClass}><option value="cpf">CPF</option><option value="cnpj">CNPJ</option></select></Field>
              <Field label={`${draft.billingDocumentType === "cnpj" ? "CNPJ" : "CPF"} para nota fiscal`}><input inputMode="numeric" maxLength={draft.billingDocumentType === "cnpj" ? 18 : 14} value={draft.billingCpf ?? ""} onChange={(event) => updateDraft("billingCpf", formatBillingDocument(event.target.value, draft.billingDocumentType ?? "cpf"))} placeholder={draft.billingDocumentType === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"} className={inputClass} /></Field>
              <Field label="Situação do cadastro"><select value={draft.registrationStatus} onChange={(event) => updateDraft("registrationStatus", event.target.value as DemoPatientRecord["registrationStatus"])} className={inputClass}><option value="pending-secretary">Pendente da secretaria</option><option value="completed">Completo</option></select></Field>
              <Field label="Observações de entrega" wide><textarea rows={3} value={draft.deliveryNotes ?? ""} onChange={(event) => updateDraft("deliveryNotes", event.target.value)} className={textareaClass} /></Field>
              <Field label="Observações da secretaria" wide><textarea rows={4} value={draft.notes ?? ""} onChange={(event) => updateDraft("notes", event.target.value)} className={textareaClass} /></Field>
              <div className="flex justify-end sm:col-span-2"><button type="button" onClick={() => saveDraft("Dados pessoais")} className={primaryButtonClass}>Salvar dados pessoais</button></div>
            </div> : <div className="grid gap-4 text-sm sm:grid-cols-2">{[
              ["Nascimento", formatDate(patient.birthDate)], ["Telefone", patient.phone || "Não informado"], ["E-mail", patient.email || "Não informado"], ["Médico responsável", patient.doctor], ["CEP", patient.zipCode || "Não informado"], ["Endereço", `${patient.street ?? patient.address ?? "Não informado"}, ${patient.addressNumber || "s/n"}`], ["Complemento", patient.addressComplement || "Não informado"], ["Bairro", patient.neighborhood || "Não informado"], ["Cidade/Estado", `${patient.city || "Não informada"}/${patient.state || "--"}`], ["Dados para nota fiscal", `${patient.billingName || patient.name} · ${patient.billingDocumentType === "cnpj" ? "CNPJ" : "CPF"} ${patient.billingCpf || patient.cpf || "Pendente"}`], ["Observações de entrega", patient.deliveryNotes || "Nenhuma"], ["Observações da secretaria", patient.notes || "Nenhuma"],
            ].map(([label, value]) => <DataCard key={label} label={label} value={value} />)}</div>}</div>}

            {tab === "tratamento" && <div className="mt-6 space-y-5">
              {overdueBottles.length > 0 && <section className="rounded-2xl border border-[#f1cf8f] bg-[#fff8e8] p-4 text-sm text-[#76521e]"><strong>Próximo pedido necessário.</strong><p className="mt-1">{overdueBottles.map((item) => `${treatmentTrack(item.treatment)} · frasco ${item.number}`).join(" · ")}. O prazo de uso foi atingido ou o frasco foi concluído; confira se o pedido já está em andamento.</p></section>}
              {visibleTreatmentTracks.length > 0 ? <div className="grid min-w-0 grid-cols-1 gap-5">{visibleTreatmentTracks.map((track) => {
                const trackPrescriptions = prescriptions.filter((item) => treatmentTrack(item.treatment) === track);
                const latest = trackPrescriptions[0];
                const trackStock = stock.filter((item) => treatmentTrack(item.treatment) === track);
                const trackBottles = (portal?.bottles ?? []).filter((item) => treatmentTrack(item.treatment ?? prescriptions.find((prescription) => prescription.id === item.prescriptionId)?.treatment) === track);
                const current = trackBottles.find((item) => item.status === "em-uso");
                const received = trackStock.reduce((sum, item) => sum + item.bottles, 0);
                return <article key={track} className={`w-full min-w-0 rounded-3xl border p-5 ${track === "Rinite" ? "border-[#ead5dc] bg-[#fff9fb]" : "border-[#d9e4f3] bg-[#f7faff]"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a3113a]">Tratamento independente</p><h3 className="mt-1 text-xl font-bold">{track}</h3></div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-[#e5dfe1]">{trackPrescriptions.length} receita(s)</span></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Recebidos" value={String(received)} /><Metric label="Iniciados" value={String(trackBottles.filter((item) => item.startedAt).length)} /><Metric label="Concluídos" value={String(trackBottles.filter((item) => item.status === "finalizado").length)} /><Metric label="Frasco atual" value={current ? String(current.number) : "Nenhum"} /></div><div className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6"><p><strong>Última receita:</strong> {latest ? formatDate(latest.createdAt) : "Não informada"}</p><p><strong>Fase:</strong> {latest?.phase || (track === "Imunobacteriana" ? "Não se aplica" : "Não informada")}</p><p><strong>Posologia:</strong> {latest?.posology || "Não informada"}</p><p><strong>Frascos prescritos:</strong> {latest?.bottles ?? 0}</p></div></article>;
              })}</div> : <Info title="Tratamentos">Nenhuma receita de Rinite ou Imunobacteriana registrada.</Info>}
              {editing && <div className="grid gap-4 rounded-2xl border border-[#eee5e0] p-5 sm:grid-cols-2"><Field label="Status geral do cadastro"><select value={draft.status ?? "em-conversa"} onChange={(event) => updateDraft("status", event.target.value as DemoPatientRecord["status"])} className={inputClass}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Método de recebimento"><select value={draft.delivery ?? "Retirada"} onChange={(event) => updateDraft("delivery", event.target.value as DemoPatientRecord["delivery"])} className={inputClass}>{["Motoboy", "Retirada", "Sedex", "Aéreo"].map((value) => <option key={value}>{value}</option>)}</select></Field>{draft.status === "desistente" && <Field label="Motivo da desistência" wide><textarea rows={3} value={draft.abandonmentReason ?? ""} onChange={(event) => updateDraft("abandonmentReason", event.target.value)} className={textareaClass} /></Field>}<div className="flex justify-end sm:col-span-2"><button type="button" onClick={() => saveDraft("Dados do tratamento")} className={primaryButtonClass}>Salvar dados gerais</button></div></div>}
              <Info title="Observações dos médicos">{prescriptions.filter((item) => item.notes.trim()).map((item) => `${formatDate(item.createdAt)} · ${item.doctor}\n${item.notes}`).join("\n\n") || "Nenhuma observação médica registrada nas receitas."}</Info>
              <div className="rounded-2xl bg-[#fbf7f5] p-5"><h3 className="font-bold">Histórico completo de receitas e fórmulas ({prescriptions.length})</h3><div className="mt-4 space-y-3">{prescriptions.map((item) => <article key={item.id} className="rounded-xl border border-[#eadfd9] bg-white p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{treatmentTrack(item.treatment)} · {formatDate(item.createdAt)}{item.phase ? ` · ${item.phase}` : ""}</strong><span>{item.bottles} frasco(s) · {item.bottleVolumeMl ? `${item.bottleVolumeMl} mL por frasco` : "volume não informado"}</span></div><p className="mt-2 text-[#66595d]">{item.formulas.map((formula) => `${formula.name} ${formula.percentage}%`).join(" · ")}</p><p className="mt-2 text-xs text-[#817578]">{item.posology} · {item.doctor} · CRM {item.doctorCrm}</p></article>)}{prescriptions.length === 0 && <p className="text-sm text-[#817578]">Nenhuma receita registrada.</p>}</div></div>
              <div className="rounded-2xl bg-[#fbf7f5] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Histórico das avaliações ({portal?.assessments.length ?? 0})</h3><Link href="/secretaria/avaliacoes" className="rounded-xl border border-[#e5d9d4] bg-white px-4 py-2 text-xs font-bold text-[#a3113a]">Gerenciar avaliações</Link></div><div className="mt-4 space-y-3">{portal?.assessments.map((item) => <article key={item.id} className="rounded-xl border border-[#eadfd9] bg-white p-4 text-sm leading-6"><strong>Frasco {item.bottleNumber} · {formatDate(item.createdAt)}</strong><p>Frequência: {item.symptomFrequency ?? "Avaliação anterior"}</p><p>Severidade: {item.symptomSeverity ?? item.feeling ?? "Não informada"}</p><p>Uso de medicamentos: {item.medicationFrequency ?? "Não informado"}</p><p>Relato: {item.notes || "Sem comentário"}</p><p className="mt-2 text-xs text-[#817578]">{item.viewedAt ? `Conferida por ${item.viewedBy ?? "equipe"} em ${formatDate(item.viewedAt, true)}` : "Aguardando conferência da equipe"}</p>{item.response && <p className="mt-2 rounded-lg bg-[#edf8f3] px-3 py-2 text-[#187157]">Resposta: {item.response}</p>}</article>)}{!portal?.assessments.length && <p className="text-sm text-[#817578]">Nenhuma avaliação registrada.</p>}</div></div>
              <div className="rounded-2xl bg-[#fbf7f5] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="font-bold">Histórico por frasco</h3><p className="mt-1 text-xs text-[#817578]">Cada frasco permanece identificado como Rinite ou Imunobacteriana.</p></div>
                  <button type="button" onClick={openAddBottleForm} className="rounded-xl border border-[#a3113a] bg-white px-4 py-2 text-xs font-bold text-[#a3113a]">+ Adicionar frasco</button>
                </div>
                {addingBottle && <div className="mt-4 grid gap-3 rounded-xl border border-[#eadfd9] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Tratamento"><select value={newBottleTreatment} onChange={(event) => selectBottleTreatment(event.target.value as TreatmentTrack)} className={inputClass}><option value="Rinite">Rinite</option><option value="Imunobacteriana">Imunobacteriana</option></select></Field>
                  <Field label="Fase"><input value={newBottlePhase} onChange={(event) => setNewBottlePhase(event.target.value)} placeholder="Ex.: Fase 1:10" className={inputClass} /></Field>
                  <Field label="Volume por frasco">{newBottleTreatment === "Imunobacteriana" ? <div className={`${inputClass} flex items-center bg-[#f7f4f2]`}>9 mL · fixo</div> : <select value={newBottleVolume} onChange={(event) => setNewBottleVolume(Number(event.target.value) as BottleVolumeMl)} className={inputClass}>{bottleVolumeOptions.map((volume) => <option key={volume} value={volume}>{volume} mL</option>)}</select>}</Field>
                  <Field label="Data de recebimento"><input type="date" value={newBottleReceivedAt} onChange={(event) => setNewBottleReceivedAt(event.target.value)} className={inputClass} /></Field>
                  {newBottleBilling && <p className="rounded-xl bg-[#fbf7f5] px-3 py-2 text-xs text-[#66595d] sm:col-span-2 lg:col-span-4">Cobertura: {newBottleBilling.coveredBottles} frasco(s) · já registrados/comprometidos: {newBottleBilling.committedBottles} · saldo: {Math.max(0, newBottleBilling.coveredBottles - newBottleBilling.committedBottles)}.</p>}
                  <div className="rounded-xl bg-[#fbf7f5] p-3 sm:col-span-2 lg:col-span-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Fórmulas do frasco</strong><button type="button" onClick={() => addFormula(setNewBottleFormulas)} className="rounded-lg border border-[#e5d9d4] bg-white px-3 py-2 text-xs font-bold text-[#a3113a]">+ Adicionar fórmula</button></div>
                    <div className="mt-2 space-y-2">{newBottleFormulas.map((formula, index) => <div key={formula.id} className="grid gap-2 sm:grid-cols-[1fr_130px_auto] sm:items-end"><Field label="Nome da fórmula"><input value={formula.name} onChange={(event) => setNewBottleFormulas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Nome" className={inputClass} /></Field><Field label="Concentração (%)"><input type="number" min={0} step="any" value={formula.percentage} onChange={(event) => setNewBottleFormulas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, percentage: Number(event.target.value) } : item))} className={inputClass} /></Field><button type="button" onClick={() => setNewBottleFormulas((current) => current.filter((item) => item.id !== formula.id))} className="h-11 rounded-lg bg-[#fff1f3] px-3 text-xs font-bold text-[#a3113a]">Remover</button></div>)}{newBottleFormulas.length === 0 && <p className="text-xs text-[#817578]">Nenhuma fórmula adicionada.</p>}</div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4"><button type="button" disabled={savingBottle} onClick={addBottleToHistory} className={`${primaryButtonClass} disabled:opacity-60`}>{savingBottle ? "Salvando…" : "Adicionar ao histórico"}</button><button type="button" disabled={savingBottle} onClick={() => setAddingBottle(false)} className="h-11 rounded-xl border border-[#e5d9d4] px-3 text-sm font-semibold disabled:opacity-60">Cancelar</button></div>
                </div>}
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-sm"><thead className="text-xs uppercase text-[#817578]"><tr><th className="pb-3">Tratamento</th><th className="pb-3">Frasco</th><th className="pb-3">Fase</th><th className="pb-3">Fórmula</th><th className="pb-3">mL</th><th className="pb-3">Recebimento</th><th className="pb-3">Início</th><th className="pb-3">Conclusão</th><th className="pb-3">Status</th><th className="pb-3">Ação</th></tr></thead><tbody>{bottleHistory.slice().sort((first, second) => (second.receivedAt ?? "").localeCompare(first.receivedAt ?? "") || second.number - first.number).map((item) => {
                  const manualRecord = stock.find((record) => record.bottleNumber === item.number && record.batchCode === "ADICIONADO MANUALMENTE");
                  return <tr key={`${item.treatment ?? "tratamento"}-${item.number}`} className="border-t border-[#eadfd9]"><td className="py-3 font-bold text-[#86203b]">{treatmentTrack(item.treatment)}</td><td className="font-bold">{item.number}</td><td>{item.phase || "—"}</td><td>{item.formulas?.map((formula) => `${formula.name.trim()} ${formula.percentage}%`).join(" · ") || item.formulaText || "—"}</td><td>{item.bottleVolumeMl ? `${item.bottleVolumeMl} mL` : "—"}</td><td>{formatDate(item.receivedAt)}</td><td>{formatDate(item.startedAt)}</td><td>{formatDate(item.finishedAt)}</td><td>{item.historicalImport ? "Histórico" : item.status === "finalizado" ? "Concluído" : item.status === "em-uso" ? "Em uso" : "Recebido"}</td><td><div className="flex items-center gap-2"><button type="button" onClick={() => openBottleEditor(item.number)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#a3113a] ring-1 ring-[#e9dfda]">Editar</button>{manualRecord && <button type="button" onClick={() => void deleteManualBottle(item.number)} className="rounded-lg bg-[#fff1f3] px-3 py-2 text-xs font-bold text-[#a3113a] ring-1 ring-[#f3c8d3]">Excluir</button>}</div></td></tr>;
                })}</tbody></table>{bottleHistory.length === 0 && <p className="py-5 text-sm text-[#817578]">Nenhum frasco recebido.</p>}</div>
              </div>
              <Info title={`Pedidos e entregas (${stock.length})`}>{stock.map((item) => `${treatmentTrack(item.treatment)} · ${item.batchCode} — ${item.bottles} frasco(s)${item.phase ? ` — ${item.phase}` : ""}${item.formulas?.length ? ` — ${item.formulas.map((formula) => `${formula.name} ${formula.percentage}%`).join(" · ")}` : ""}${item.bottleVolumeMl ? ` — ${item.bottleVolumeMl} mL` : ""} — ${item.status} — recebido no estoque em ${formatDate(item.receivedAt)} — entregue em ${formatDate(item.deliveredAt)}`).join("\n") || "Nenhum pedido ou entrega registrado."}</Info>
            </div>}

            {tab === "financeiro" && <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-[#eee5e0] bg-[#fffdfc] p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a3113a]">Financeiro por tratamento</p><div className="mt-3 flex flex-wrap gap-2">{visibleTreatmentTracks.map((track) => <button key={track} type="button" onClick={() => { cancelEditingPayment(); setFinancialTrack(track); setEditing(false); setDraft(patient); }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${activeFinancialTrack === track ? "bg-[#a3113a] text-white" : "bg-[#f6efec] text-[#716569]"}`}>{track}</button>)}</div></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label={`Total · ${activeFinancialTrack}`} value={money(activeContractValue)} /><Metric label="Pago" value={money(totalPaid)} /><Metric label="Saldo" value={money(remaining)} /><Metric label="Status" value={activeTreatmentPayment?.paymentStatus ?? (legacyFinancialAllowed ? patient.paymentStatus : undefined) ?? "A definir"} /></div>
              <div className="rounded-2xl border border-[#eee5e0] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Condições financeiras de {activeFinancialTrack}</h3><p className="mt-1 text-xs text-[#817578]">Estes dados pertencem exclusivamente a este tratamento.</p></div>{!editing && <button type="button" onClick={() => setEditing(true)} className="rounded-xl border border-[#e5d9d4] px-4 py-2 text-xs font-bold text-[#a3113a]">Editar financeiro</button>}</div>
                {editing ? <><TreatmentPaymentEditor patient={draft} track={activeFinancialTrack} methods={adminMethods} onSelectMethod={(method, condition) => chooseMethod(method, condition, activeFinancialTrack)} onChange={(update) => setDraft((current) => current ? update(current) : current)} /><div className="mt-5 flex justify-end"><button type="button" disabled={savingFinancial} onClick={() => saveDraft(`Financeiro de ${activeFinancialTrack}`)} className={`${primaryButtonClass} disabled:opacity-60`}>{savingFinancial ? "Salvando…" : `Salvar financeiro de ${activeFinancialTrack}`}</button></div></> : <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3"><DataCard label="Método de aquisição" value={`${activeTreatmentPayment?.acquisitionMethod ?? (legacyFinancialAllowed ? patient.acquisitionMethod : undefined) ?? "Não definido"}${activeTreatmentPayment?.methodSnapshotVersion ? ` · versão ${activeTreatmentPayment.methodSnapshotVersion}` : ""}`} /><DataCard label="Condição escolhida" value={activeTreatmentPayment?.agreedCondition ?? (legacyFinancialAllowed ? patient.agreedCondition : undefined) ?? "Não definida"} /><DataCard label="Forma de pagamento" value={activeTreatmentPayment?.paymentMethod ?? (legacyFinancialAllowed ? patient.paymentMethod : undefined) ?? "Não definida"} /><DataCard label="Parcelas" value={(activeTreatmentPayment?.installments ?? (legacyFinancialAllowed ? patient.paymentInstallments : undefined)) ? `${activeTreatmentPayment?.installments ?? patient.paymentInstallments}x` : "Não informado"} /><DataCard label="Desconto registrado" value={money(activeTreatmentPayment?.discountAmount ?? (legacyFinancialAllowed ? patient.discountAmount : undefined) ?? 0)} /><DataCard label="Vencimento" value={formatDate(activeTreatmentPayment?.dueDate ?? (legacyFinancialAllowed ? patient.paymentDueDate : undefined))} /><DataCard label="Frascos cobertos por este valor" value={activeTreatmentPayment?.bottlesIncluded ? String(activeTreatmentPayment.bottlesIncluded) : "Não informado"} /><DataCard label="Referência ASAAS" value={activeTreatmentPayment?.asaasReference ?? (legacyFinancialAllowed ? patient.asaasReference : undefined) ?? "Não informada"} /><DataCard label="Observações" value={activeTreatmentPayment?.notes ?? (legacyFinancialAllowed ? patient.financialNotes : undefined) ?? "Nenhuma"} /></div>}
              </div>
              <div className="rounded-2xl border border-[#eee5e0] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Registrar pagamento · {activeFinancialTrack}</h3><span className="text-xs text-[#817578]">A cobertura inicial fica nas condições financeiras.</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><Field label="Valor pago (R$)"><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" className={inputClass} /></Field><Field label="Data"><input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} className={inputClass} /></Field><Field label="Parcela"><input type="number" min={1} value={installmentNumber} onChange={(event) => setInstallmentNumber(Math.max(1, Number(event.target.value)))} className={inputClass} /></Field><Field label="Frasco"><select value={paymentBottlePlanId} onChange={(event) => setPaymentBottlePlanId(event.target.value)} className={inputClass}><option value="">Não vincular</option>{activeBottlePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.quantity}x {plan.volumeMl} mL</option>)}</select></Field><Field label="Frascos adicionais liberados"><input type="number" min={0} step={1} value={paymentAdditionalBottles} onChange={(event) => setPaymentAdditionalBottles(Math.max(0, Math.trunc(Number(event.target.value))))} className={inputClass} /><span className="mt-1 block text-xs text-[#817578]">Use 0 para parcela sem nova cota; informe a quantidade liberada por uma nova cobrança.</span></Field><Field label="Referência ASAAS"><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className={inputClass} /></Field><Field label="Observação" wide><input value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} placeholder="Ex.: pagamento de frascos adicionais" className={inputClass} /></Field></div><button type="button" onClick={addPayment} className="mt-3 rounded-xl bg-[#187157] px-4 py-2.5 text-sm font-semibold text-white">Registrar pagamento</button></div>
              <div className="rounded-2xl bg-[#fbf7f5] p-4">
                <h3 className="font-bold">Histórico de pagamentos de {activeFinancialTrack} ({activePayments.length})</h3>
                <div className="mt-3 space-y-2">
                  {activePayments.map((item) => {
                    const linkedPlan = (patient.treatmentBottles ?? []).find((plan) => plan.id === item.bottlePlanId);
                    const isEditingPayment = editingPaymentId === item.id;
                    return <article key={item.id} className="rounded-xl border border-[#eadfd9] bg-white p-3">
                      {isEditingPayment ? <div>
                        <p className="mb-3 text-sm font-bold text-[#86203b]">Editar pagamento · {item.treatment ?? activeFinancialTrack}</p>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                          <Field label="Valor pago (R$)"><input value={editingPaymentAmount} onChange={(event) => setEditingPaymentAmount(event.target.value)} className={inputClass} /></Field>
                          <Field label="Data"><input type="date" value={editingPaymentDate} onChange={(event) => setEditingPaymentDate(event.target.value)} className={inputClass} /></Field>
                          <Field label="Parcela"><input type="number" min={1} max={item.installments} value={editingPaymentInstallmentNumber} onChange={(event) => setEditingPaymentInstallmentNumber(Math.max(1, Number(event.target.value)))} className={inputClass} /></Field>
                          <Field label="Forma de pagamento"><select value={editingPaymentMethod} onChange={(event) => setEditingPaymentMethod(event.target.value)} className={inputClass}>{Array.from(new Set([editingPaymentMethod, ...paymentOptions])).map((method) => <option key={method} value={method}>{method}</option>)}</select></Field>
                          <Field label="Frasco"><select value={editingPaymentBottlePlanId} onChange={(event) => setEditingPaymentBottlePlanId(event.target.value)} className={inputClass}>
                            <option value="">Não vincular</option>
                            {item.bottlePlanId && !activeBottlePlans.some((plan) => plan.id === item.bottlePlanId) && <option value={item.bottlePlanId}>Vínculo antigo</option>}
                            {activeBottlePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.quantity}x {plan.volumeMl} mL</option>)}
                          </select></Field>
                          <Field label="Frascos adicionais liberados"><input type="number" min={0} step={1} value={editingPaymentAdditionalBottles} onChange={(event) => setEditingPaymentAdditionalBottles(Math.max(0, Math.trunc(Number(event.target.value))))} className={inputClass} /></Field>
                          <Field label="Referência ASAAS"><input value={editingPaymentReference} onChange={(event) => setEditingPaymentReference(event.target.value)} className={inputClass} /></Field>
                          <Field label="Observação" wide><input value={editingPaymentNotes} onChange={(event) => setEditingPaymentNotes(event.target.value)} className={inputClass} /></Field>
                        </div>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={cancelEditingPayment} className="rounded-lg border border-[#e5d9d4] px-3 py-2 text-xs font-semibold text-[#66595d]">Cancelar</button>
                          <button type="button" onClick={() => void saveEditedPayment()} className="rounded-lg bg-[#187157] px-3 py-2 text-xs font-semibold text-white">Salvar alterações</button>
                        </div>
                      </div> : <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div><strong>{money(item.amount)}</strong><p className="mt-1 text-xs text-[#817578]">{item.treatment ?? activeFinancialTrack} · {formatDate(item.paidAt)} · {item.method}{item.installments ? ` · ${item.installmentNumber ?? 1}/${item.installments}` : ""}{item.additionalBottles ? ` · +${item.additionalBottles} frasco(s)` : ""}{linkedPlan ? ` · Frasco ${linkedPlan.volumeMl} mL` : ""}{item.asaasReference ? ` · ASAAS ${item.asaasReference}` : ""}</p>{item.notes && <p className="mt-1 text-sm text-[#66595d]">{item.notes}</p>}</div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => startEditingPayment(item)} className="rounded-lg bg-[#f7f1ee] px-3 py-2 text-xs font-semibold text-[#a3113a]">Editar</button>
                          <button type="button" onClick={() => removePayment(item.id)} className="rounded-lg bg-[#fff1f3] px-3 py-2 text-xs font-semibold text-[#a3113a]">Remover</button>
                        </div>
                      </div>}
                    </article>;
                  })}
                  {!activePayments.length && <p className="text-sm text-[#817578]">Nenhum pagamento de {activeFinancialTrack} registrado.</p>}
                </div>
              </div>
              {!legacyFinancialAllowed && unassignedPayments.length > 0 && <Info title={`Pagamentos antigos sem tratamento definido (${unassignedPayments.length})`}>Esses registros anteriores foram preservados, mas não entram nos totais de Rinite nem de Imunobacteriana para evitar mistura. A Secretaria poderá identificá-los antes de vinculá-los ao tratamento correto.</Info>}
              <div className="rounded-2xl bg-[#fbf7f5] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Notas fiscais ({invoices.length})</h3><p className="mt-1 text-xs text-[#817578]">Documentos vinculados automaticamente ao CPF.</p></div><Link href="/secretaria/notas-fiscais" className="rounded-xl border border-[#e5d9d4] px-4 py-2 text-xs font-bold text-[#a3113a]">Gerenciar notas</Link></div><div className="mt-4 space-y-3">{invoices.map((invoice) => <article key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eadfd9] bg-white p-4"><div><strong className="text-sm">{invoice.fileName}</strong><p className="mt-1 text-xs text-[#817578]">Enviada em {formatDate(invoice.uploadedAt, true)}</p></div><button type="button" onClick={() => { if (!openDemoInvoicePdf(invoice)) setMessage("Permita a abertura de janelas para visualizar o PDF."); }} className="rounded-lg bg-[#a3113a] px-3 py-2 text-xs font-semibold text-white">Abrir PDF</button></article>)}{invoices.length === 0 && <p className="text-sm text-[#817578]">Nenhuma nota fiscal vinculada.</p>}</div></div>
            </div>}
          </section> : <section className="rounded-3xl border border-[#eee5e0] bg-white p-12 text-center text-sm text-[#817578]">Selecione um paciente para abrir o cadastro completo.</section>}
        </div>
      </div>
      {editingBottle && <div className="fixed inset-0 z-[100] flex items-end bg-[#29151b]/55 p-3 sm:items-center sm:justify-center"><div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-[#a3113a]">Editar frasco</p><h2 className="mt-1 text-xl font-bold">Frasco {editingBottle}</h2></div><button type="button" onClick={() => setEditingBottle(null)} className="rounded-full bg-[#f7f1ee] px-3 py-2">×</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Fase"><input value={bottleDraft.phase} onChange={(event) => setBottleDraft((item) => ({ ...item, phase: event.target.value }))} className={inputClass} /></Field><Field label="Volume por frasco">{treatmentTrack(bottleHistory.find((item) => item.number === editingBottle)?.treatment) === "Imunobacteriana" ? <div className={`${inputClass} flex items-center bg-[#f7f4f2]`}>9 mL · fixo</div> : <select value={bottleDraft.bottleVolumeMl} onChange={(event) => setBottleDraft((item) => ({ ...item, bottleVolumeMl: event.target.value ? Number(event.target.value) as BottleVolumeMl : item.bottleVolumeMl }))} className={inputClass}><option value="">Não informado</option>{bottleVolumeOptions.map((volume) => <option key={volume} value={volume}>{volume} mL</option>)}</select>}</Field><Field label="Data de recebimento"><input type="date" value={bottleDraft.receivedAt} onChange={(event) => setBottleDraft((item) => ({ ...item, receivedAt: event.target.value }))} className={inputClass} /></Field><Field label="Data de início"><input type="date" value={bottleDraft.startedAt} onChange={(event) => setBottleDraft((item) => ({ ...item, startedAt: event.target.value }))} className={inputClass} /></Field><Field label="Data de conclusão"><input type="date" value={bottleDraft.finishedAt} onChange={(event) => setBottleDraft((item) => ({ ...item, finishedAt: event.target.value }))} className={inputClass} /><span className="mt-1 block text-xs text-[#817578]">Deixe em branco se ainda estiver em andamento.</span></Field><Field label="Status"><select value={bottleDraft.status} onChange={(event) => setBottleDraft((item) => ({ ...item, status: event.target.value as typeof item.status }))} className={inputClass}><option value="recebido">Recebido</option><option value="em-uso">Em uso</option><option value="finalizado">Concluído</option></select></Field>
        <div className="rounded-xl bg-[#fbf7f5] p-3 sm:col-span-2"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Fórmulas</strong><button type="button" onClick={() => addFormula((update) => setBottleDraft((current) => ({ ...current, formulas: update(current.formulas) })))} className="rounded-lg border border-[#e5d9d4] bg-white px-3 py-2 text-xs font-bold text-[#a3113a]">+ Adicionar fórmula</button></div><div className="mt-2 space-y-2">{bottleDraft.formulas.map((formula, index) => <div key={formula.id} className="grid gap-2 sm:grid-cols-[1fr_130px_auto] sm:items-end"><Field label="Nome da fórmula"><input value={formula.name} onChange={(event) => setBottleDraft((current) => ({ ...current, formulas: current.formulas.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} className={inputClass} /></Field><Field label="Concentração (%)"><input type="number" min={0} step="any" value={formula.percentage} onChange={(event) => setBottleDraft((current) => ({ ...current, formulas: current.formulas.map((item, itemIndex) => itemIndex === index ? { ...item, percentage: Number(event.target.value) } : item) }))} className={inputClass} /></Field><button type="button" onClick={() => setBottleDraft((current) => ({ ...current, formulas: current.formulas.filter((item) => item.id !== formula.id) }))} className="h-11 rounded-lg bg-[#fff1f3] px-3 text-xs font-bold text-[#a3113a]">Remover</button></div>)}{bottleDraft.formulas.length === 0 && <p className="text-xs text-[#817578]">Nenhuma fórmula informada.</p>}</div></div>
        <Field label="Motivo do ajuste *" wide><textarea rows={3} value={bottleReason} onChange={(event) => setBottleReason(event.target.value)} placeholder="Ex.: atualização da fase, fórmula ou data de início." className={textareaClass} /></Field></div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditingBottle(null)} className="rounded-xl border border-[#e6dbd6] px-4 py-3 text-sm font-semibold">Cancelar</button><button type="button" onClick={saveBottleAdjustment} className={primaryButtonClass}>Salvar alterações</button></div></div></div>}
    </main>
  );
}

const inputClass = "mt-2 h-11 w-full rounded-xl border border-[#e9dfda] bg-white px-3 outline-none focus:border-[#b91142]";
const textareaClass = "mt-2 w-full rounded-xl border border-[#e9dfda] bg-white px-3 py-3 outline-none focus:border-[#b91142]";
const primaryButtonClass = "rounded-xl bg-[#a3113a] px-5 py-3 text-sm font-semibold text-white";

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`text-sm font-medium text-[#544449] ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>;
}

function DataCard({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-2xl bg-[#fbf7f5] p-4"><p className="text-xs text-[#817578]">{label}</p><div className="mt-2 whitespace-pre-line font-semibold leading-6">{value}</div></div>;
}

function Info({ title, children }: { title: string; children: ReactNode }) {
  return <article className="rounded-2xl bg-[#fbf7f5] p-5"><h3 className="font-bold">{title}</h3><div className="mt-3 whitespace-pre-line text-sm leading-7 text-[#66595d]">{children}</div></article>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#fbf7f5] px-3 py-2.5"><p className="text-[10px] uppercase tracking-wide text-[#817578]">{label}</p><p className="mt-1 text-base font-bold text-[#a3113a]">{value}</p></div>;
}

function TreatmentPaymentEditor({ patient, track, methods, onSelectMethod, onChange }: {
  patient: DemoPatientRecord;
  track: TreatmentTrack;
  methods: AdminTreatmentMethod[];
  onSelectMethod: (method: AdminTreatmentMethod, condition: "À vista" | "Parcelado") => void;
  onChange: (update: (current: DemoPatientRecord) => DemoPatientRecord) => void;
}) {
  function updatePayment(field: "agreedCondition" | "contractValue" | "installments" | "installmentValue" | "paymentMethod" | "paymentStatus" | "dueDate" | "bottlesIncluded" | "asaasReference" | "notes", value: string | number | undefined) {
    onChange((current) => {
      const payments = [...(current.treatmentPayments ?? [])];
      const index = payments.findIndex((payment) => payment.treatment === track);
      const previous: NonNullable<DemoPatientRecord["treatmentPayments"]>[number] = index >= 0 ? payments[index] : { treatment: track, paymentMethod: current.paymentMethod, dueDate: current.paymentDueDate, agreedCondition: current.agreedCondition };
      const next = { ...previous, [field]: value } as NonNullable<DemoPatientRecord["treatmentPayments"]>[number];
      const isRecurring = selectedMethod?.category === "Recorrente" || previous.methodCategory === "Recorrente";
      if (field === "contractValue") next.installmentValue = Number(value) / Math.max(1, next.installments ?? 1);
      if (field === "installments") {
        const installmentCount = Math.max(1, Math.trunc(Number(value)));
        if (isRecurring) {
          const currentMonthlyValue = typeof previous.installmentValue === "number"
            ? previous.installmentValue
            : typeof previous.contractValue === "number"
              ? previous.contractValue / Math.max(1, previous.installments ?? 1)
              : selectedMethod?.value ?? 0;
          next.installmentValue = currentMonthlyValue;
          next.contractValue = currentMonthlyValue * installmentCount;
        } else {
          next.installmentValue = (next.contractValue ?? 0) / installmentCount;
        }
      }
      if (field === "installmentValue") next.contractValue = Number(value) * Math.max(1, next.installments ?? 1);
      if (index >= 0) payments[index] = next; else payments.push(next);
      return { ...current, treatmentPayments: payments };
    });
  }

  const payment = patient.treatmentPayments?.find((item) => item.treatment === track);
  const selectedMethod = methods.find((method) => method.id === payment?.methodSnapshotId)
    ?? methods.find((method) => method.name === payment?.acquisitionMethod);
  const usesAsaas = (payment?.paymentMethod ?? "").toLocaleLowerCase("pt-BR").includes("asaas");
  const installmentLimit = selectedMethod?.category === "Recorrente"
    ? 36
    : selectedMethod
      ? selectedMethod.maxInstallments
    // Cadastros antigos podem não ter o vínculo com a modalidade; nesse caso,
    // não deixe o valor atual (muitas vezes 1) travar a edição das parcelas.
    : 36;
  const installmentsLabel = selectedMethod?.category === "Recorrente" ? "Meses de cobrança" : "Parcelas";

  return <div className="mt-5 grid gap-4 sm:grid-cols-2">
    <Field label="Método de aquisição">
      <select value={selectedMethod?.id ?? ""} onChange={(event) => {
        const method = methods.find((item) => item.id === event.target.value);
        if (method) onSelectMethod(method, "Parcelado");
      }} className={inputClass}>
        <option value="">Selecione uma modalidade</option>
        {methods.map((method) => <option key={method.id} value={method.id}>{method.name} · {method.category}</option>)}
      </select>
      {selectedMethod && <span className="mt-1 block text-xs text-[#817578]">Modalidade {selectedMethod.version} · {selectedMethod.paymentMethod} · {selectedMethod.category === "Recorrente" ? `padrão de ${selectedMethod.billingPeriodMonths} mês(es), ajustável até 36` : `até ${installmentLimit} parcela(s)`}</span>}
      {!methods.length && <span className="mt-1 block text-xs text-[#a3113a]">Nenhuma modalidade ativa cadastrada.</span>}
    </Field>
    <Field label="Condição">
      <select value={payment?.agreedCondition ?? "Parcelado"} onChange={(event) => {
        const condition = event.target.value as "À vista" | "Parcelado";
        if (selectedMethod) onSelectMethod(selectedMethod, condition);
        else updatePayment("agreedCondition", condition);
      }} className={inputClass}>
        <option value="Parcelado">Parcelado</option>
        {selectedMethod?.cashValue && <option value="À vista">À vista</option>}
      </select>
    </Field>
    <Field label="Forma de pagamento"><select value={payment?.paymentMethod ?? "A definir"} onChange={(event) => updatePayment("paymentMethod", event.target.value)} className={inputClass}>
      {Array.from(new Set([payment?.paymentMethod ?? "A definir", ...paymentOptions])).map((value) => <option key={value}>{value}</option>)}
    </select></Field>
    <Field label="Situação do pagamento"><select value={payment?.paymentStatus ?? "A definir"} onChange={(event) => updatePayment("paymentStatus", event.target.value)} className={inputClass}>{paymentStatusOptions.map((value) => <option key={value}>{value}</option>)}</select></Field>
    <Field label={selectedMethod?.category === "Recorrente" ? "Valor do período (R$)" : "Valor total (R$)"}><input type="number" min={0} step="0.01" value={payment?.contractValue ?? ""} onChange={(event) => updatePayment("contractValue", Number(event.target.value))} className={inputClass} /></Field>
    <Field label={installmentsLabel}><input type="number" min={1} max={installmentLimit} step={1} value={payment?.installments ?? 1} onChange={(event) => updatePayment("installments", Math.min(installmentLimit, Math.max(1, Math.trunc(Number(event.target.value)))))} className={inputClass} /></Field>
    <Field label="Valor por parcela (R$)"><input type="number" min={0} step="0.01" value={payment?.installmentValue ?? ""} onChange={(event) => updatePayment("installmentValue", Number(event.target.value))} className={inputClass} /></Field>
    <Field label="Vencimento"><input type="date" value={payment?.dueDate ?? sixMonthDueDate()} onChange={(event) => updatePayment("dueDate", event.target.value)} className={inputClass} /></Field>
    <div className="sm:col-start-2"><Field label="Quantidade de frascos cobertos por este valor"><input type="number" min={1} step={1} value={payment?.bottlesIncluded ?? ""} onChange={(event) => updatePayment("bottlesIncluded", event.target.value === "" ? undefined : Math.max(1, Math.trunc(Number(event.target.value))))} placeholder="Preencha a quantidade" className={inputClass} /><span className="mt-1 block text-xs text-[#817578]">Deixe vazio até confirmar quantos frascos esse valor cobre.</span></Field></div>
    {usesAsaas && <Field label="Referência ASAAS"><input value={payment?.asaasReference ?? ""} onChange={(event) => updatePayment("asaasReference", event.target.value)} className={inputClass} /></Field>}
    <Field label="Observações" wide><textarea rows={3} value={payment?.notes ?? ""} onChange={(event) => updatePayment("notes", event.target.value)} className={textareaClass} /></Field>
  </div>;
}
