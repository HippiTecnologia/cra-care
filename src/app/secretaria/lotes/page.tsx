"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DemoBatch,
  DemoBatchItem,
  DemoBatchStatus,
  DemoPatientRecord,
  DemoPrescription,
  PrescriptionFormula,
  availableFormulas,
  treatmentPhases,
} from "../../medico/patient-store";
import {
  confirmSecretaryBatch,
  loadSecretaryBatches,
  loadSecretaryPatients,
  loadSecretaryPrescriptions,
  saveSecretaryBatch,
  SecretaryContext,
} from "../../../lib/supabase/secretary-records";

type BatchFilter = "todos" | DemoBatchStatus;

const technicalDoctor = {
  name: "Dr. Sérgio Fabricio Maniglia",
  crm: "20762",
};

const batchStatuses: Record<
  DemoBatchStatus,
  { label: string; description: string; badge: string; step: number }
> = {
  rascunho: {
    label: "Rascunho",
    description: "Aguardando envio pela secretaria",
    badge: "bg-[#fff6e7] text-[#966419]",
    step: 0,
  },
  enviado: {
    label: "Enviado ao laboratório",
    description: "Aguardando início da produção",
    badge: "bg-[#eef3ff] text-[#3c5da0]",
    step: 1,
  },
  "em-producao": {
    label: "Em produção",
    description: "Manipulação em andamento",
    badge: "bg-[#f3edff] text-[#7351a3]",
    step: 2,
  },
  pronto: {
    label: "Pronto para conferência",
    description: "Produção finalizada pelo laboratório",
    badge: "bg-[#eaf8f3] text-[#187157]",
    step: 3,
  },
  conferido: {
    label: "Conferido",
    description: "Liberado para estoque e entrega",
    badge: "bg-[#e8f7ef] text-[#176546]",
    step: 4,
  },
};

const productionSteps = [
  "Lote criado",
  "Enviado",
  "Em produção",
  "Conferência",
  "Liberado",
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-/]/g, "");
}

function defaultBatchName() {
  const today = new Date();
  return `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;
}

export default function SecretariaLotesPage() {
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<DemoPrescription[]>([]);
  const [batches, setBatches] = useState<DemoBatch[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BatchFilter>("todos");
  const [laboratory, setLaboratory] = useState("Laboratório CRA");
  const [batchName, setBatchName] = useState(defaultBatchName);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conferenceResponsible, setConferenceResponsible] = useState("Equipe da secretaria CRA");
  const [conferenceNotes, setConferenceNotes] = useState("");
  const [orderType, setOrderType] = useState<"pedido-paciente" | "pronta-entrega">("pedido-paciente");
  const [paymentConfirmations, setPaymentConfirmations] = useState<Record<string, { payment: boolean; asaas: boolean }>>({});
  const [readyItems, setReadyItems] = useState<DemoBatchItem[]>([]);
  const [readyFormula, setReadyFormula] = useState(availableFormulas[0]);
  const [readyFormulaPercentage, setReadyFormulaPercentage] = useState("");
  const [readyFormulas, setReadyFormulas] = useState<PrescriptionFormula[]>([]);
  const [readyPhase, setReadyPhase] = useState(treatmentPhases[0]);
  const [readyBottles, setReadyBottles] = useState(1);
  const [context, setContext] = useState<SecretaryContext | null>(null);

  const readyFormulaTotal = useMemo(
    () => readyFormulas.reduce((total, formula) => total + formula.percentage, 0),
    [readyFormulas],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const workspace = await loadSecretaryPatients();
        const [loadedPrescriptions, loadedBatches] = await Promise.all([
          loadSecretaryPrescriptions(workspace.context),
          loadSecretaryBatches(workspace.context),
        ]);
        if (!active) return;
        setContext(workspace.context);
        setPatients(workspace.patients);
        setPrescriptions(loadedPrescriptions);
        setBatches(loadedBatches);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os lotes reais.");
      }
    })();
    return () => { active = false; };
  }, []);

  async function persistBatch(batch: DemoBatch) {
    if (!context) throw new Error("A sessão da Secretaria ainda não foi carregada.");
    const saved = await saveSecretaryBatch(context, batch);
    setBatches((current) => {
      const exists = current.some((item) => item.id === saved.id);
      return exists ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current];
    });
    return saved;
  }

  function getBillingRequirement(patient: DemoPatientRecord, requestedBottles = 1) {
    const acquisitionMethod = patient.acquisitionMethod ?? "Por frasco";
    const paymentMethod = patient.paymentMethod ?? "A definir";
    const pendingBatchBottles = batches.reduce((total, batch) => total + batch.items
      .filter((item) => item.patientId === patient.id)
      .reduce((count, item) => count + item.bottles, 0), 0);
    const nextBottleNumber = (patient.bottlesReceived ?? 0) + pendingBatchBottles + 1;
    const bottleNumbers = Array.from({ length: Math.max(1, Math.trunc(requestedBottles)) }, (_, index) => nextBottleNumber + index);
    const renewalBottle = bottleNumbers.find((number) => number > 3 && (number - 1) % 3 === 0);
    const recurringAsaas = acquisitionMethod === "Recorrente — ASAAS";
    const paymentRequired = !recurringAsaas && (acquisitionMethod === "Por frasco" || Boolean(renewalBottle));
    const asaasRequired = recurringAsaas || (paymentRequired && paymentMethod === "Asaas");
    const explanation = recurringAsaas
      ? "Pagamento recorrente: confirme no ASAAS se a cobrança está em dia."
      : acquisitionMethod === "Por frasco"
        ? "Cada novo frasco precisa de pagamento confirmado."
        : paymentRequired
          ? `Novo pagamento necessário: o pedido inclui o ${renewalBottle}º frasco.`
          : `Frasco ${nextBottleNumber} incluído no pagamento do tratamento.`;
    return { acquisitionMethod, paymentMethod, nextBottleNumber, paymentRequired, asaasRequired, explanation };
  }

  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const includedPrescriptionIds = useMemo(
    () =>
      new Set(
        batches.flatMap((batch) =>
          batch.items.map((item) => item.prescriptionId),
        ),
      ),
    [batches],
  );

  const availablePrescriptions = useMemo(() => {
    const latestPatientIds = new Set<string>();

    return prescriptions.filter((prescription) => {
      if (latestPatientIds.has(prescription.patientId)) {
        return false;
      }

      latestPatientIds.add(prescription.patientId);

      const patient = patientById.get(prescription.patientId);

      return (
        Boolean(patient) &&
        ["com-pedido", "ativo", "em-conversa"].includes(patient?.status ?? "") &&
        !includedPrescriptionIds.has(prescription.id)
      );
    });
  }, [includedPrescriptionIds, patientById, prescriptions]);

  const filteredPrescriptions = useMemo(() => {
    const normalized = normalizeSearch(search);

    if (!normalized) return availablePrescriptions;

    return availablePrescriptions.filter((prescription) => {
      const patient = patientById.get(prescription.patientId);

      return normalizeSearch(
        `${patient?.name ?? ""} ${patient?.cpf ?? ""} ${prescription.doctor}`,
      ).includes(normalized);
    });
  }, [availablePrescriptions, patientById, search]);

  const selectedPrescriptions = availablePrescriptions.filter((prescription) =>
    selectedIds.includes(prescription.id),
  );

  const selectedBottleCount = orderType === "pronta-entrega"
    ? readyItems.reduce((total, item) => total + item.bottles, 0)
    : selectedPrescriptions.reduce((total, prescription) => total + prescription.bottles, 0);
  const selectedItemCount = orderType === "pronta-entrega" ? readyItems.length : selectedPrescriptions.length;
  const editingBatch = batches.find((batch) => batch.id === editingBatchId && batch.status === "rascunho");

  const filteredBatches = batches.filter(
    (batch) => filter === "todos" || batch.status === filter,
  );

  function togglePrescription(prescription: DemoPrescription) {
    const patient = patientById.get(prescription.patientId);

    if (patient?.registrationStatus !== "completed") {
      setError(
        `Complete o cadastro de ${patient?.name ?? "este paciente"} antes de incluir a receita no lote.`,
      );
      return;
    }

    setSelectedIds((current) =>
      current.includes(prescription.id)
        ? current.filter((id) => id !== prescription.id)
        : [...current, prescription.id],
    );
    setError("");
  }

  function validateSelectedPayments() {
    const delinquent = orderType === "pedido-paciente"
      ? selectedPrescriptions.find((prescription) => patientById.get(prescription.patientId)?.paymentStatus === "Vencido")
      : undefined;
    if (delinquent) {
      const patient = patientById.get(delinquent.patientId);
      setError(`${patient?.name ?? "Paciente"} está inadimplente. Regularize a situação financeira antes de incluir no lote.`);
      return false;
    }
    const missingPayment = orderType === "pedido-paciente"
      ? selectedPrescriptions.find((prescription) => {
          const patient = patientById.get(prescription.patientId);
          if (!patient) return true;
          const billing = getBillingRequirement(patient, prescription.bottles);
          const confirmation = paymentConfirmations[prescription.id];
          return (billing.paymentRequired && !confirmation?.payment) || (billing.asaasRequired && !confirmation?.asaas);
        })
      : undefined;

    if (missingPayment) {
      const patient = patientById.get(missingPayment.patientId);
      const billing = patient ? getBillingRequirement(patient, missingPayment.bottles) : undefined;
      setError(billing?.asaasRequired && !paymentConfirmations[missingPayment.id]?.asaas
        ? `Confirmar no ASAAS se o pagamento de ${patient?.name} está em dia.`
        : `Confirme o pagamento de ${patient?.name ?? "todos os pacientes"} antes de incluir no lote.`);
      return false;
    }

    return true;
  }

  function createSelectedPatientItems(): DemoBatchItem[] {
    return selectedPrescriptions.flatMap(
      (prescription) => {
        const patient = patientById.get(prescription.patientId);

        if (!patient) return [];
        const billing = getBillingRequirement(patient, prescription.bottles);
        const confirmedAt = new Date().toISOString();

        return [
          {
            prescriptionId: prescription.id,
            orderType: "pedido-paciente" as const,
            patientId: patient.id,
            patientName: patient.name,
            patientCpf: patient.cpf,
            doctor: prescription.doctor,
            treatment: prescription.treatment,
            phase: prescription.phase,
            bottles: prescription.bottles,
            formulas: prescription.formulas,
            acquisitionMethod: billing.acquisitionMethod,
            paymentMethod: billing.paymentMethod,
            billingBottleNumber: billing.nextBottleNumber,
            paymentRequired: billing.paymentRequired,
            paymentConfirmedAt: billing.paymentRequired ? confirmedAt : undefined,
            asaasConfirmedAt: billing.asaasRequired ? confirmedAt : undefined,
          },
        ];
      },
    );
  }

  async function createBatch() {
    if (!batchName.trim()) {
      setError("Informe o nome do lote, por exemplo: 15-08-2026.");
      return;
    }

    if (orderType === "pronta-entrega" && selectedItemCount === 0) {
      setError("Cadastre pelo menos um frasco para pronta entrega.");
      return;
    }

    if (!laboratory.trim()) {
      setError("Informe o laboratório responsável pela produção.");
      return;
    }

    if (!validateSelectedPayments()) return;

    const items = orderType === "pronta-entrega" ? readyItems : createSelectedPatientItems();

    const createdAt = new Date().toISOString();
    const nextNumber = String(batches.length + 1).padStart(3, "0");
    const batch: DemoBatch = {
      id: crypto.randomUUID(),
      code: `CRA-${new Date().getFullYear()}-${nextNumber}`,
      name: batchName.trim(),
      createdAt,
      orderType,
      status: "rascunho",
      laboratory: laboratory.trim(),
      notes: notes.trim(),
      items,
    };

    const savedBatch = await persistBatch(batch);
    setSelectedIds([]);
    setReadyItems([]);
    setPaymentConfirmations({});
    setNotes("");
    setEditingBatchId(orderType === "pedido-paciente" ? savedBatch.id : null);
    setExpandedBatchId(savedBatch.id);
    setError("");
    setMessage(`Lote ${batch.name} criado em ${formatDate(createdAt)}. Adicione os pacientes e envie manualmente ao laboratório quando estiver pronto.`);
  }

  async function addSelectedPatientsToBatch() {
    if (!editingBatch || selectedPrescriptions.length === 0) {
      setError("Selecione ao menos um paciente para adicionar ao lote.");
      return;
    }

    if (!validateSelectedPayments()) return;

    const items = createSelectedPatientItems();
    await persistBatch({ ...editingBatch, items: [...editingBatch.items, ...items] });
    setSelectedIds([]);
    setPaymentConfirmations({});
    setExpandedBatchId(editingBatch.id);
    setError("");
    setMessage(`${items.length} paciente(s) adicionado(s) ao lote ${editingBatch.name ?? editingBatch.code}.`);
  }

  async function removeBatchItem(batch: DemoBatch, item: DemoBatchItem) {
    if (batch.status !== "rascunho") return;

    await persistBatch({
      ...batch,
      items: batch.items.filter((current) => current.prescriptionId !== item.prescriptionId),
    });
    setMessage(`${item.patientName} removido do lote ${batch.name ?? batch.code}.`);
    setError("");
  }

  function editDraftBatch(batch: DemoBatch) {
    if (batch.status !== "rascunho") return;

    setEditingBatchId(batch.id);
    setExpandedBatchId(batch.id);
    setBatchName(batch.name ?? defaultBatchName());
    setOrderType(batch.orderType ?? "pedido-paciente");
    setLaboratory(batch.laboratory);
    setSearch("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addReadyFormula() {
    const percentage = Number(readyFormulaPercentage);
    const remaining = 100 - readyFormulaTotal;

    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > remaining) {
      setError(`Informe uma porcentagem entre 1 e ${remaining}%.`);
      return;
    }

    setReadyFormulas((current) => [
      ...current,
      { id: crypto.randomUUID(), name: readyFormula, percentage },
    ]);
    setReadyFormulaPercentage("");
    setError("");
  }

  function addReadyItem() {
    if (readyBottles < 1) {
      setError("Informe pelo menos um frasco para pronta entrega.");
      return;
    }

    if (readyFormulas.length === 0 || readyFormulaTotal !== 100) {
      setError("A composição da pronta entrega precisa totalizar 100% antes de adicionar ao lote.");
      return;
    }

    const identifier = crypto.randomUUID();
    setReadyItems((current) => [
      ...current,
      {
        prescriptionId: `ready-${identifier}`,
        orderType: "pronta-entrega",
        patientId: "",
        patientName: "Pronta entrega · sem paciente",
        patientCpf: "",
        doctor: technicalDoctor.name,
        doctorCrm: technicalDoctor.crm,
        preparedBy: "Secretaria CRA",
        prescriptionStatus: "aguardando-aprovacao",
        treatment: "Imunoterapia para pronta entrega",
        phase: readyPhase,
        bottles: readyBottles,
        formulas: readyFormulas.map((formula) => ({ ...formula, id: `formula-${identifier}-${formula.id}` })),
      },
    ]);
    setError("");
    setReadyBottles(1);
    setReadyFormulas([]);
    setReadyFormulaPercentage("");
  }

  async function sendBatch(batch: DemoBatch) {
    if (batch.items.length === 0) {
      setError("Adicione pelo menos um paciente ou frasco antes de enviar o lote ao laboratório.");
      setExpandedBatchId(batch.id);
      return;
    }

    await persistBatch({
      ...batch,
      status: "enviado",
      sentAt: new Date().toISOString(),
    });
    if (editingBatchId === batch.id) setEditingBatchId(null);
    setMessage(`Lote ${batch.name ?? batch.code} enviado ao ${batch.laboratory}.`);
    setError("");
  }

  function openBatchDetails(batch: DemoBatch) {
    if (expandedBatchId === batch.id) {
      setExpandedBatchId(null);
      return;
    }

    setExpandedBatchId(batch.id);
    setConferenceResponsible(batch.checkedBy ?? "Equipe da secretaria CRA");
    setConferenceNotes(batch.conferenceNotes ?? "");
    setError("");
  }

  async function toggleCheckedItem(batch: DemoBatch, prescriptionId: string) {
    if (batch.status !== "pronto") return;

    const current = batch.checkedPrescriptionIds ?? [];
    const checkedPrescriptionIds = current.includes(prescriptionId)
      ? current.filter((id) => id !== prescriptionId)
      : [...current, prescriptionId];

    await persistBatch({ ...batch, checkedPrescriptionIds });
    setError("");
  }

  async function approveBatch(batch: DemoBatch) {
    try {
      if (!context) throw new Error("A sessão da Secretaria ainda não foi carregada.");
      const stockItems = await confirmSecretaryBatch(
        context,
        batch,
        conferenceResponsible,
        conferenceNotes,
        patients,
      );
      setBatches((current) => current.map((item) => item.id === batch.id ? {
        ...item,
        status: "conferido",
        checkedAt: new Date().toISOString(),
        checkedBy: conferenceResponsible.trim(),
        conferenceNotes: conferenceNotes.trim(),
      } : item));
      const bottleCount = stockItems.reduce((total, item) => total + item.bottles, 0);

      setError("");
      setConferenceNotes("");
      setMessage(
        `Lote ${batch.code} conferido! ${bottleCount} frasco(s) ${batch.orderType === "pronta-entrega" ? "de pronta entrega" : `de ${stockItems.length} paciente(s)`} entraram no estoque.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir a conferência do lote.",
      );
    }
  }

  const summaryCards = [
    {
      label: "Receitas disponíveis",
      value: availablePrescriptions.length,
      description: "Aguardando composição de lote",
      color: "text-[#a3113a]",
    },
    {
      label: "Lotes em rascunho",
      value: batches.filter((batch) => batch.status === "rascunho").length,
      description: "Pendentes de envio",
      color: "text-[#966419]",
    },
    {
      label: "Com o laboratório",
      value: batches.filter((batch) =>
        ["enviado", "em-producao"].includes(batch.status),
      ).length,
      description: "Em fila ou em produção",
      color: "text-[#4863a0]",
    },
    {
      label: "Para conferência",
      value: batches.filter((batch) => batch.status === "pronto").length,
      description: "Produção finalizada",
      color: "text-[#187157]",
    },
  ];

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
            <p className="mt-4 text-sm text-white/70">Painel da Secretaria</p>
          </div>

          <nav className="mt-8 space-y-2">
            <Link
              href="/secretaria"
              className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10"
            >
              Dashboard
            </Link>
            <Link
              href="/secretaria#kanban-pacientes"
              className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10"
            >
              Kanban de pacientes
            </Link>
            <Link
              href="/secretaria/lotes"
              className="block rounded-2xl bg-white/15 px-4 py-3 text-sm font-semibold"
            >
              Lotes
            </Link>
            <Link
              href="/secretaria/estoque"
              className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10"
            >
              Vacinas em estoque
            </Link>
            {["Notas fiscais", "Contratos", "Notificações aos pacientes", "Configurações"].map(
              (item) => (
                <Link
                  key={item}
                  href={item === "Notas fiscais" ? "/secretaria/notas-fiscais" : item === "Contratos" ? "/secretaria/contratos" : item === "Notificações aos pacientes" ? "/secretaria/notificacoes" : "/secretaria/configuracoes"}
                  className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10"
                >
                  {item}
                </Link>
              ),
            )}
            <Link href="/" className="block rounded-2xl px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10">
              Sair
            </Link>
          </nav>

          <div className="mt-12 rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-sm font-semibold">CRA Care</p>
            <p className="mt-1 text-xs text-white/70">Desenvolvido pela Hippi</p>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c173c]">
                Secretaria · produção
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#86203b] sm:text-4xl">
                Gestão de lotes
              </h1>
              <p className="mt-2 text-sm text-[#776b6e]">
                Reúna as receitas médicas e acompanhe o encaminhamento ao laboratório.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 self-start">
              <Link
                href="/secretaria"
                className="rounded-2xl border border-[#eadfd9] bg-white px-5 py-3 text-sm font-semibold text-[#a3113a] shadow-sm hover:bg-[#fff8f8]"
              >
                ← Voltar ao dashboard
              </Link>
              <Link href="/" className="rounded-2xl border border-[#eadfd9] bg-white px-4 py-3 text-sm font-semibold text-[#a3113a] shadow-sm hover:bg-[#fff8f8]">
                Sair
              </Link>
            </div>
          </header>

          {message && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-[#cfe9df] bg-[#edf8f3] px-4 py-3 text-sm text-[#187157]">
              <span>{message}</span>
              <button type="button" onClick={() => setMessage("")} aria-label="Fechar mensagem">
                ×
              </button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {summaryCards.map((card) => (
              <article
                key={card.label}
                className="rounded-[24px] border border-[#eee5e0] bg-white p-5 shadow-sm"
              >
                <p className="text-sm font-medium text-[#76696d]">{card.label}</p>
                <p className={`mt-3 text-4xl font-bold ${card.color}`}>{card.value}</p>
                <p className="mt-2 text-xs text-[#8a7c80]">{card.description}</p>
              </article>
            ))}
          </div>

          <div className="mt-7 rounded-[24px] border border-[#eee5e0] bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Tipo de pedido no lote</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([
                { value: "pedido-paciente", title: "Pedido de paciente", description: "Busca a última receita e exige conferência financeira." },
                { value: "pronta-entrega", title: "Pronta entrega", description: "Produz frascos para estoque sem paciente definido." },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setOrderType(option.value); setError(""); }}
                  className={`rounded-2xl border p-4 text-left ${orderType === option.value ? "border-[#b91142] bg-[#fff5f7]" : "border-[#eee6e2] bg-[#fcfaf8]"}`}
                >
                  <p className="text-sm font-bold text-[#433438]">{option.title}</p>
                  <p className="mt-1 text-xs text-[#817578]">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-7 grid gap-6 2xl:grid-cols-[minmax(0,1.18fr)_410px]">
            <section className="rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-7">
              {orderType === "pedido-paciente" ? (
                <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#433438]">Adicionar paciente ao lote</h2>
                  <p className="mt-1 text-sm text-[#817578]">
                    Digite o nome ou CPF do paciente solicitante. A última receita médica será carregada automaticamente.
                  </p>
                </div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Digite o nome ou CPF do paciente"
                  className="h-11 w-full rounded-xl border border-[#e9dfda] px-4 text-sm outline-none focus:border-[#b91142] lg:w-72"
                />
              </div>

              <div className="mt-6 space-y-3">
                {filteredPrescriptions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#e8dcd6] bg-[#fcfaf8] px-6 py-12 text-center">
                    <p className="font-semibold text-[#53454a]">Nenhuma receita disponível</p>
                    <p className="mt-2 text-sm text-[#817578]">
                      Novas prescrições médicas aparecerão automaticamente nesta lista.
                    </p>
                  </div>
                ) : (
                  filteredPrescriptions.map((prescription) => {
                    const patient = patientById.get(prescription.patientId);
                    const selected = selectedIds.includes(prescription.id);
                    const registrationPending =
                      patient?.registrationStatus !== "completed";
                    const billing = patient ? getBillingRequirement(patient, prescription.bottles) : undefined;

                    return (
                      <button
                        key={prescription.id}
                        type="button"
                        onClick={() => togglePrescription(prescription)}
                        className={`w-full rounded-2xl border p-4 text-left transition sm:p-5 ${
                          selected
                            ? "border-[#b91142] bg-[#fff5f7]"
                            : "border-[#eee6e2] bg-[#fdfbf9] hover:border-[#dcb8c1]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-bold text-[#433438]">
                                {patient?.name}
                              </h3>
                              {registrationPending && (
                                <span className="rounded-full bg-[#fff4e4] px-2.5 py-1 text-[11px] font-semibold text-[#986617]">
                                  Cadastro incompleto
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-[#817578]">
                              CPF {patient?.cpf} · {prescription.doctor}
                            </p>
                          </div>
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-sm ${
                              selected
                                ? "border-[#a3113a] bg-[#a3113a] text-white"
                                : "border-[#d9ccc6] bg-white text-transparent"
                            }`}
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 text-xs text-[#6e6165] sm:grid-cols-3">
                          <span><strong>Fase:</strong> {prescription.phase}</span>
                          <span><strong>Frascos:</strong> {prescription.bottles}</span>
                          <span><strong>Receita:</strong> {formatDate(prescription.createdAt)}</span>
                        </div>
                        <p className="mt-3 text-xs text-[#766a6d]">
                          <strong>Composição:</strong>{" "}
                          {prescription.formulas
                            .map((formula) => `${formula.name} ${formula.percentage}%`)
                            .join(" · ")}
                        </p>
                        {billing && (
                          <div className={`mt-3 rounded-xl px-3 py-2 text-xs ${billing.paymentRequired ? "bg-[#fff4e4] text-[#966419]" : "bg-[#eaf8f3] text-[#187157]"}`}>
                            <strong>{billing.acquisitionMethod}</strong> · {billing.nextBottleNumber}º frasco
                            {billing.paymentMethod === "Asaas" && " · Pagamento ASAAS"}
                            <p className="mt-1">{billing.explanation}</p>
                          </div>
                        )}
                        <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${patient?.paymentStatus === "Vencido" ? "bg-[#ffe6e8] text-[#a3113a]" : "bg-[#eaf8f3] text-[#187157]"}`}>{patient?.paymentStatus === "Vencido" ? "● Inadimplente" : "● Em dia"}</div>
                      </button>
                    );
                  })
                )}
              </div>
              </>
              ) : (
                <div>
                  <h2 className="text-xl font-bold text-[#433438]">Frascos para pronta entrega</h2>
                  <p className="mt-1 text-sm text-[#817578]">A secretaria prepara a receita de pronta entrega e seleciona o médico que deverá conferi-la e aprová-la.</p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-[#544449] sm:col-span-2">Médico responsável pela pronta entrega
                      <input value={`${technicalDoctor.name} · CRM ${technicalDoctor.crm}`} readOnly className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-[#f7f4f2] px-3 text-sm font-normal text-[#786c70] outline-none" />
                      <span className="mt-2 block text-xs font-normal leading-5 text-[#817578]">Pedidos de pronta entrega saem com o nome final e a assinatura técnica do Dr. Sérgio.</span>
                    </label>
                    <label className="text-sm font-semibold text-[#544449]">Composição
                      <select value={readyFormula} onChange={(event) => setReadyFormula(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm font-normal outline-none focus:border-[#b91142]">
                        {availableFormulas.map((formula) => <option key={formula} value={formula}>{formula}</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-[#544449]">Porcentagem
                      <input type="number" min={1} max={100 - readyFormulaTotal} value={readyFormulaPercentage} onChange={(event) => setReadyFormulaPercentage(event.target.value)} placeholder={`${100 - readyFormulaTotal}% disponível`} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm font-normal outline-none focus:border-[#b91142]" />
                    </label>
                    <div className="sm:col-span-2">
                      <button type="button" onClick={addReadyFormula} disabled={readyFormulaTotal >= 100} className="h-11 rounded-xl border border-[#b91142] px-4 text-sm font-semibold text-[#a3113a] disabled:cursor-not-allowed disabled:opacity-50">+ Adicionar composição</button>
                      <div className="mt-3 rounded-xl bg-[#f7f4f2] px-4 py-3">
                        {readyFormulas.length === 0 ? <p className="text-sm text-[#817578]">Adicione as composições que formarão a receita de pronta entrega.</p> : <div className="space-y-2">{readyFormulas.map((formula) => <div key={formula.id} className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-[#433438]">{formula.name}</span><span className="flex items-center gap-3"><strong>{formula.percentage}%</strong><button type="button" onClick={() => setReadyFormulas((current) => current.filter((item) => item.id !== formula.id))} className="text-[#a3113a]" aria-label={`Remover ${formula.name}`}>Remover</button></span></div>)}</div>}
                        <p className={`mt-3 border-t border-[#e7ddd8] pt-3 text-sm font-bold ${readyFormulaTotal === 100 ? "text-[#187157]" : "text-[#a3113a]"}`}>Total da composição: {readyFormulaTotal}%</p>
                      </div>
                    </div>
                    <label className="text-sm font-semibold text-[#544449]">Fase
                      <select value={readyPhase} onChange={(event) => setReadyPhase(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm font-normal outline-none focus:border-[#b91142]">
                        {treatmentPhases.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-[#544449]">Quantidade de frascos
                      <input type="number" min={1} value={readyBottles} onChange={(event) => setReadyBottles(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm font-normal outline-none focus:border-[#b91142]" />
                    </label>
                    <div className="flex items-end"><button type="button" onClick={addReadyItem} disabled={readyFormulaTotal !== 100} className="h-12 w-full rounded-xl bg-[#a3113a] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Adicionar ao lote</button></div>
                  </div>

                  <div className="mt-6 space-y-3">
                    {readyItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#e8dcd6] bg-[#fcfaf8] px-5 py-10 text-center"><p className="text-sm font-semibold text-[#53454a]">Nenhum frasco adicionado</p><p className="mt-2 text-xs text-[#817578]">Escolha a fórmula, a fase e a quantidade para criar o estoque de pronta entrega.</p></div>
                    ) : readyItems.map((item) => (
                      <article key={item.prescriptionId} className="rounded-2xl border border-[#eee6e2] bg-[#fdfbf9] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#433438]">{item.formulas.map((formula) => `${formula.name} (${formula.percentage}%)`).join(" · ")}</p><p className="mt-2 text-xs text-[#776b6e]">{item.phase} · {item.bottles} frasco(s) · {item.doctor}</p><span className="mt-3 inline-flex rounded-full bg-[#fff4e4] px-2.5 py-1 text-[11px] font-semibold text-[#966419]">Receita preparada · aguardando aprovação médica</span></div><button type="button" onClick={() => setReadyItems((current) => current.filter((saved) => saved.prescriptionId !== item.prescriptionId))} className="rounded-lg px-2 py-1 text-[#a3113a]" aria-label="Remover item">×</button></div></article>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="self-start rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a3113a]">
                Novo encaminhamento
              </p>
              <h2 className="mt-2 text-xl font-bold text-[#433438]">Montar lote</h2>
              <p className="mt-1 text-sm text-[#817578]">
                {editingBatch ? `Você está adicionando pacientes ao lote ${editingBatch.name ?? editingBatch.code}.` : orderType === "pronta-entrega" ? "Monte um lote sem paciente para abastecer a pronta entrega." : "Crie o lote com a data e adicione os pacientes aos poucos."}
              </p>

              <label className="mt-5 block text-sm font-semibold text-[#544449]">
                Nome do lote *
                <input
                  value={batchName}
                  disabled={Boolean(editingBatch)}
                  onChange={(event) => setBatchName(event.target.value)}
                  placeholder="Ex.: 15-08-2026"
                  className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 font-normal outline-none focus:border-[#b91142] disabled:bg-[#f8f5f2]"
                />
              </label>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#fbf5f2] p-4">
                  <p className="text-xs text-[#817578]">{orderType === "pronta-entrega" ? "Fórmulas" : "Receitas"}</p>
                  <p className="mt-2 text-2xl font-bold text-[#a3113a]">
                    {selectedItemCount}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#fbf5f2] p-4">
                  <p className="text-xs text-[#817578]">Total de frascos</p>
                  <p className="mt-2 text-2xl font-bold text-[#a3113a]">
                    {selectedBottleCount}
                  </p>
                </div>
              </div>

              {orderType === "pedido-paciente" && selectedPrescriptions.length > 0 && (
                <div className="mt-5 space-y-3">
                  <h3 className="text-sm font-bold text-[#433438]">Conferência financeira</h3>
                  {selectedPrescriptions.map((prescription) => {
                    const patient = patientById.get(prescription.patientId);
                    if (!patient) return null;
                    const billing = getBillingRequirement(patient, prescription.bottles);
                    const confirmation = paymentConfirmations[prescription.id] ?? { payment: false, asaas: false };

                    return (
                      <div key={prescription.id} className={`rounded-2xl border p-4 ${patient.paymentStatus === "Vencido" ? "border-[#f0bcc5] bg-[#fff2f3]" : billing.paymentRequired ? "border-[#f0dfc0] bg-[#fff9ef]" : "border-[#d7e9df] bg-[#f5fbf7]"}`}>
                        <p className="text-xs font-bold text-[#433438]">{patient.name}</p>
                        <p className="mt-1 text-xs text-[#66595d]">{billing.acquisitionMethod} · {billing.nextBottleNumber}º frasco</p>
                        <p className={`mt-2 text-xs font-bold ${patient.paymentStatus === "Vencido" ? "text-[#a3113a]" : "text-[#187157]"}`}>{patient.paymentStatus === "Vencido" ? "● INADIMPLENTE — não liberar até regularizar" : "● EM DIA"}</p>
                        <p className={`mt-2 text-xs font-semibold ${billing.paymentRequired ? "text-[#966419]" : "text-[#187157]"}`}>{billing.explanation}</p>
                        {billing.paymentRequired && (
                          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-[#544449]"><input type="checkbox" checked={confirmation.payment} onChange={(event) => setPaymentConfirmations((current) => ({ ...current, [prescription.id]: { ...confirmation, payment: event.target.checked } }))} className="mt-0.5 accent-[#a3113a]" />Confirmo que a cobrança deste frasco foi realizada e paga.</label>
                        )}
                        {billing.asaasRequired && (
                          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-[#eef3ff] p-3 text-xs text-[#3c5da0]"><input type="checkbox" checked={confirmation.asaas} onChange={(event) => setPaymentConfirmations((current) => ({ ...current, [prescription.id]: { ...confirmation, asaas: event.target.checked } }))} className="mt-0.5 accent-[#3c5da0]" /><span><strong>Confirmar no ASAAS se o pagamento está em dia.</strong><br />Verifiquei diretamente no ASAAS e o pagamento está regular.</span></label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <label className="mt-6 block text-sm font-semibold text-[#544449]">
                Laboratório responsável
                <input
                  value={laboratory}
                  onChange={(event) => setLaboratory(event.target.value)}
                  className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 font-normal outline-none focus:border-[#b91142]"
                />
              </label>

              <label className="mt-5 block text-sm font-semibold text-[#544449]">
                Observações para produção
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Prioridades, orientações ou informações complementares"
                  className="mt-2 w-full rounded-xl border border-[#e9dfda] px-4 py-3 font-normal outline-none focus:border-[#b91142]"
                />
              </label>

              {error && (
                <p role="alert" className="mt-4 rounded-xl bg-[#fff1f3] px-4 py-3 text-sm text-[#a3113a]">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={editingBatch ? addSelectedPatientsToBatch : createBatch}
                disabled={editingBatch ? selectedItemCount === 0 : !batchName.trim() || (orderType === "pronta-entrega" && selectedItemCount === 0)}
                className="mt-5 w-full rounded-xl bg-[#a3113a] px-4 py-3.5 text-sm font-semibold text-white hover:bg-[#870e31] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {editingBatch ? "Adicionar pacientes ao lote" : "Criar lote"}
              </button>
              {editingBatch && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBatchId(null);
                    setBatchName(defaultBatchName());
                    setSelectedIds([]);
                    setPaymentConfirmations({});
                    setError("");
                  }}
                  className="mt-3 w-full rounded-xl border border-[#eadfd9] px-4 py-3 text-sm font-semibold text-[#a3113a]"
                >
                  Criar outro lote
                </button>
              )}
              <p className="mt-3 text-center text-xs text-[#817578]">
                O laboratório só receberá o lote depois do envio manual pela secretaria.
              </p>
              <p className="mt-2 rounded-xl bg-[#f8f5f2] px-3 py-2 text-center text-xs text-[#817578]">Financeiro do lote: módulo programado para a próxima etapa.</p>
            </section>
          </div>

          <section className="mt-7 rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#433438]">Acompanhamento dos lotes</h2>
                <p className="mt-1 text-sm text-[#817578]">
                  Histórico de encaminhamentos e andamento da produção.
                </p>
              </div>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as BatchFilter)}
                className="h-11 rounded-xl border border-[#e9dfda] bg-white px-4 text-sm outline-none focus:border-[#b91142]"
              >
                <option value="todos">Todos os status</option>
                {Object.entries(batchStatuses).map(([value, status]) => (
                  <option key={value} value={value}>{status.label}</option>
                ))}
              </select>
            </div>

            <div className="mt-6 space-y-4">
              {filteredBatches.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#e8dcd6] bg-[#fcfaf8] px-6 py-12 text-center">
                  <p className="font-semibold text-[#53454a]">Nenhum lote criado ainda</p>
                  <p className="mt-2 text-sm text-[#817578]">
                    Selecione uma ou mais receitas para gerar o primeiro encaminhamento.
                  </p>
                </div>
              ) : (
                filteredBatches.map((batch) => {
                  const status = batchStatuses[batch.status];
                  const expanded = expandedBatchId === batch.id;
                  const bottleCount = batch.items.reduce(
                    (total, item) => total + item.bottles,
                    0,
                  );

                  return (
                    <article key={batch.id} className="rounded-2xl border border-[#eee6e2] bg-[#fdfbf9] p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-base font-bold text-[#433438]">Lote {batch.name ?? batch.code}</h3>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${batch.orderType === "pronta-entrega" ? "bg-[#fff4e4] text-[#966419]" : "bg-[#f3edff] text-[#7351a3]"}`}>{batch.orderType === "pronta-entrega" ? "Pronta entrega" : "Pedido de paciente"}</span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.badge}`}>
                              {status.label}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-[#776b6e]">
                            {batch.code} · Criado em {formatDate(batch.createdAt)} · {batch.laboratory}
                          </p>
                          <p className="mt-1 text-xs text-[#776b6e]">
                            {batch.items.length} {batch.orderType === "pronta-entrega" ? "fórmula(s)" : "paciente(s)"} · {bottleCount} frasco(s) · {(status ?? { description: "Status não informado" }).description}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => openBatchDetails(batch)}
                            className="rounded-xl border border-[#e6dbd6] px-4 py-3 text-xs font-semibold text-[#a3113a]"
                          >
                            {expanded ? "Ocultar detalhes" : "Ver detalhes"}
                          </button>
                          {batch.status === "rascunho" && (
                            <>
                              {batch.orderType !== "pronta-entrega" && (
                                <button type="button" onClick={() => editDraftBatch(batch)} className="rounded-xl border border-[#e6dbd6] px-4 py-3 text-xs font-semibold text-[#a3113a]">
                                  Adicionar pacientes
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => sendBatch(batch)}
                                disabled={batch.items.length === 0}
                                className="rounded-xl bg-[#a3113a] px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                Enviar ao laboratório
                              </button>
                            </>
                          )}
                          {batch.status === "pronto" && !expanded && (
                            <button
                              type="button"
                              onClick={() => openBatchDetails(batch)}
                              className="rounded-xl bg-[#187157] px-4 py-3 text-xs font-semibold text-white"
                            >
                              Conferir lote
                            </button>
                          )}
                          {batch.status === "conferido" && (
                            <Link
                              href="/secretaria/estoque"
                              className="rounded-xl bg-[#187157] px-4 py-3 text-xs font-semibold text-white"
                            >
                              Ver no estoque
                            </Link>
                          )}
                        </div>
                      </div>

                      {expanded && (
                        <div className="mt-6 border-t border-[#eee5e0] pt-5">
                          <div className="grid gap-3 sm:grid-cols-5">
                            {productionSteps.map((step, index) => {
                              const reached = index <= status.step;

                              return (
                                <div key={step} className="flex items-center gap-2">
                                  <span
                                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                      reached
                                        ? "bg-[#a3113a] text-white"
                                        : "bg-[#eee8e4] text-[#887c7f]"
                                    }`}
                                  >
                                    {reached ? "✓" : index + 1}
                                  </span>
                                  <span className="text-xs text-[#65585c]">{step}</span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-5 space-y-2">
                            {batch.items.length === 0 && (
                              <p className="rounded-xl border border-dashed border-[#e6dbd6] px-4 py-4 text-sm text-[#817578]">
                                Este lote ainda está vazio. Pesquise e adicione os pacientes antes do envio.
                              </p>
                            )}
                            {batch.items.map((item) => {
                              const checked = (batch.checkedPrescriptionIds ?? []).includes(item.prescriptionId);

                              return (
                              <div
                                key={item.prescriptionId}
                                className={`rounded-xl border px-4 py-3 ${checked ? "border-[#cfe9df] bg-[#f3fbf7]" : "border-transparent bg-white"}`}
                              >
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-sm font-semibold text-[#44363a]">
                                    {item.patientName}
                                  </p>
                                  <span className="text-xs font-semibold text-[#a3113a]">
                                    {item.bottles} frasco(s)
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-[#776b6e]">
                                  {item.patientId ? `CPF ${item.patientCpf} · ${item.doctor}` : `Sem paciente definido · pronta entrega · ${technicalDoctor.name}`} · {item.phase}
                                </p>
                                <p className="mt-2 text-xs text-[#776b6e]">
                                  {item.formulas
                                    .map((formula) => `${formula.name} ${formula.percentage}%`)
                                    .join(" · ")}
                                </p>
                                {batch.status === "rascunho" && (
                                  <button
                                    type="button"
                                    onClick={() => removeBatchItem(batch, item)}
                                    className="mt-3 rounded-lg bg-[#fff1f3] px-3 py-2 text-xs font-semibold text-[#a3113a]"
                                  >
                                    Remover {item.patientId ? "paciente" : "frasco"} do lote
                                  </button>
                                )}
                                {batch.status === "pronto" && (
                                  <button
                                    type="button"
                                    onClick={() => toggleCheckedItem(batch, item.prescriptionId)}
                                    className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${checked ? "bg-[#e5f5ed] text-[#187157]" : "bg-[#f5efec] text-[#67595d]"}`}
                                  >
                                    {checked ? "✓ Item e frascos conferidos" : item.patientId ? "○ Conferir paciente, composição e frascos" : "○ Conferir fórmula, fase e frascos"}
                                  </button>
                                )}
                                {batch.status === "conferido" && checked && (
                                  <p className="mt-3 text-xs font-semibold text-[#187157]">
                                    ✓ Conferido e lançado no estoque
                                  </p>
                                )}
                              </div>
                              );
                            })}
                          </div>

                          {batch.productionNotes && (
                            <p className="mt-4 rounded-xl bg-[#eef3ff] px-4 py-3 text-xs text-[#3c5da0]">
                              <strong>Observações do laboratório:</strong> {batch.productionNotes}
                            </p>
                          )}

                          {batch.status === "pronto" && (
                            <div className="mt-5 rounded-2xl border border-[#d7e9df] bg-[#f7fbf8] p-4 sm:p-5">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <h4 className="text-sm font-bold text-[#187157]">
                                  Conferência para entrada no estoque
                                </h4>
                                <span className="text-xs font-semibold text-[#187157]">
                                  {(batch.checkedPrescriptionIds ?? []).length}/{batch.items.length} item(ns) conferido(s)
                                </span>
                              </div>
                              {batch.laboratoryOkAt ? <p className="mt-2 rounded-xl bg-[#eaf8f3] px-3 py-2 text-xs font-semibold text-[#187157]">✓ OK do laboratório registrado por {batch.laboratoryOkBy} em {formatDate(batch.laboratoryOkAt)}</p> : <p className="mt-2 rounded-xl bg-[#fff8eb] px-3 py-2 text-xs font-semibold text-[#88642c]">Aguardando o OK do laboratório.</p>}

                              <label className="mt-4 block text-xs font-semibold text-[#544449]">
                                Responsável pela conferência
                                <input
                                  value={conferenceResponsible}
                                  onChange={(event) => { setConferenceResponsible(event.target.value); setError(""); }}
                                  className="mt-2 h-11 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm font-normal outline-none focus:border-[#b91142]"
                                />
                              </label>

                              <label className="mt-4 block text-xs font-semibold text-[#544449]">
                                Observações da conferência
                                <textarea
                                  value={conferenceNotes}
                                  onChange={(event) => setConferenceNotes(event.target.value)}
                                  rows={2}
                                  placeholder="Registre informações sobre o recebimento, se necessário"
                                  className="mt-2 w-full rounded-xl border border-[#e9dfda] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#b91142]"
                                />
                              </label>

                              {error && (
                                <p role="alert" className="mt-3 rounded-xl bg-[#fff1f3] px-4 py-3 text-xs text-[#a3113a]">
                                  {error}
                                </p>
                              )}

                              <button
                                type="button"
                                onClick={() => approveBatch(batch)}
                                disabled={!batch.laboratoryOkAt || (batch.checkedPrescriptionIds ?? []).length !== batch.items.length}
                                className="mt-4 w-full rounded-xl bg-[#187157] px-4 py-3 text-sm font-semibold text-white hover:bg-[#115842] disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                {batch.laboratoryOkAt ? "Aprovar conferência e lançar no estoque" : "Aguardando OK do laboratório"}
                              </button>
                            </div>
                          )}

                          {batch.status === "conferido" && batch.checkedAt && (
                            <div className="mt-4 rounded-xl bg-[#edf8f3] px-4 py-3 text-xs text-[#187157]">
                              <strong>Conferido em {formatDate(batch.checkedAt)}</strong>
                              {batch.checkedBy && ` · ${batch.checkedBy}`}
                              {batch.conferenceNotes && <p className="mt-2">{batch.conferenceNotes}</p>}
                            </div>
                          )}

                          {batch.notes && (
                            <p className="mt-4 rounded-xl bg-[#fff6e8] px-4 py-3 text-xs text-[#82602b]">
                              <strong>Observações:</strong> {batch.notes}
                            </p>
                          )}

                          {batch.sentAt && (
                            <p className="mt-4 text-xs text-[#776b6e]">
                              Enviado ao laboratório em {formatDate(batch.sentAt)}.
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
