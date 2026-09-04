"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DemoPatientRecord,
  DemoPrescription,
  DemoStockItem,
  DemoStockStatus,
} from "../../medico/patient-store";
import {
  loadSecretaryPatients,
  loadSecretaryPrescriptions,
  loadSecretaryStock,
  saveSecretaryPatient,
  saveSecretaryStockItem,
  SecretaryContext,
} from "../../../lib/supabase/secretary-records";

type StockFilter = "todos" | DemoStockStatus;
type StockOriginFilter = "todos" | "pedido-paciente" | "pronta-entrega";
type DeliveryFilter = "todas" | NonNullable<DemoPatientRecord["delivery"]>;

const stockStatuses: Record<
  DemoStockStatus,
  { label: string; badge: string; description: string }
> = {
  disponivel: {
    label: "Disponível",
    badge: "bg-[#eaf8f3] text-[#187157]",
    description: "Pronto para organização da entrega",
  },
  reservado: {
    label: "Reservado",
    badge: "bg-[#fff6e7] text-[#966419]",
    description: "Separado para este paciente",
  },
  entregue: {
    label: "Entregue",
    badge: "bg-[#eef3ff] text-[#3c5da0]",
    description: "Entrega concluída",
  },
};

function formatDate(value?: string) {
  if (!value) return "Não informado";

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

export default function SecretariaEstoquePage() {
  const [stock, setStock] = useState<DemoStockItem[]>([]);
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StockFilter>("todos");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [originFilter, setOriginFilter] = useState<StockOriginFilter>("todos");
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("todas");
  const [batchFilter, setBatchFilter] = useState("todos");
  const [selectedStockIds, setSelectedStockIds] = useState<string[]>([]);
  const [assignmentPatientId, setAssignmentPatientId] = useState("");
  const [assignmentPaymentConfirmed, setAssignmentPaymentConfirmed] = useState(false);
  const [assignmentAsaasConfirmed, setAssignmentAsaasConfirmed] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [deliveredRetentionCutoff, setDeliveredRetentionCutoff] = useState(0);
  const [prescriptions, setPrescriptions] = useState<DemoPrescription[]>([]);
  const [context, setContext] = useState<SecretaryContext | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const workspace = await loadSecretaryPatients();
        const [loadedStock, loadedPrescriptions] = await Promise.all([
          loadSecretaryStock(workspace.context),
          loadSecretaryPrescriptions(workspace.context),
        ]);
        if (!active) return;
        setContext(workspace.context);
        setStock(loadedStock);
        setPrescriptions(loadedPrescriptions);
        setPatients(workspace.patients);
        setDeliveredRetentionCutoff(new Date().getTime() - 30 * 86_400_000);
      } catch (cause) {
        if (active) setMessage(cause instanceof Error ? cause.message : "Não foi possível carregar o estoque real.");
      }
    })();
    return () => { active = false; };
  }, []);

  async function persistStockItem(item: DemoStockItem) {
    if (!context) throw new Error("A sessão da Secretaria ainda não foi carregada.");
    const saved = await saveSecretaryStockItem(context, item);
    setStock((current) => current.some((record) => record.id === saved.id)
      ? current.map((record) => record.id === saved.id ? saved : record)
      : [saved, ...current]);
    return saved;
  }

  function getBillingRequirement(patient: DemoPatientRecord) {
    const acquisitionMethod = patient.acquisitionMethod ?? "Por frasco";
    const paymentMethod = patient.paymentMethod ?? "A definir";
    const assignedReadyBottles = stock.filter((item) => item.origin === "pronta-entrega" && item.patientId === patient.id)
      .reduce((total, item) => total + item.bottles, 0);
    const nextBottleNumber = (patient.bottlesReceived ?? 0) + assignedReadyBottles + 1;
    const renewalBottle = nextBottleNumber > 3 && (nextBottleNumber - 1) % 3 === 0;
    const recurringAsaas = acquisitionMethod === "Recorrente — ASAAS";
    const paymentRequired = !recurringAsaas && (acquisitionMethod === "Por frasco" || renewalBottle);
    const asaasRequired = recurringAsaas || (paymentRequired && paymentMethod === "Asaas");
    const explanation = recurringAsaas
      ? "Pagamento recorrente: confirme no ASAAS se a cobrança está em dia."
      : acquisitionMethod === "Por frasco"
        ? "Cada novo frasco precisa de pagamento confirmado."
        : paymentRequired
          ? `Novo pagamento necessário para o ${nextBottleNumber}º frasco.`
          : `Frasco ${nextBottleNumber} incluído no pagamento do tratamento.`;
    return { paymentRequired, asaasRequired, explanation };
  }

  const filteredStock = useMemo(() => {
    const normalized = normalizeSearch(search);

    return stock.filter((item) => {
      if (item.status === "entregue" && item.deliveredAt && deliveredRetentionCutoff > 0 && new Date(item.deliveredAt).getTime() < deliveredRetentionCutoff) return false;
      if (filter !== "todos" && item.status !== filter) return false;
      if (originFilter === "pronta-entrega" && item.patientId) return false;
      if (originFilter === "pedido-paciente" && !item.patientId) return false;
      if (deliveryFilter !== "todas" && item.delivery !== deliveryFilter) return false;
      if (batchFilter !== "todos" && item.batchId !== batchFilter) return false;
      if (!normalized) return true;

      return normalizeSearch(
        `${item.patientName} ${item.patientCpf} ${item.batchCode} ${item.doctor} ${item.treatment}`,
      ).includes(normalized);
    });
  }, [batchFilter, deliveredRetentionCutoff, deliveryFilter, filter, originFilter, search, stock]);

  const selectedItem =
    filteredStock.find((item) => item.id === selectedItemId) ?? filteredStock[0];
  const assignmentPatient = patients.find((patient) => patient.id === assignmentPatientId);
  const assignmentPrescription = assignmentPatient ? prescriptions.find((prescription) => prescription.patientId === assignmentPatient.id) : undefined;
  const assignmentBilling = assignmentPatient ? getBillingRequirement(assignmentPatient) : undefined;
  const selectedPatient = selectedItem?.patientId ? patients.find((patient) => patient.id === selectedItem.patientId) : undefined;
  const availableBatches = Array.from(new Map(stock.map((item) => [item.batchId, item.batchCode])).entries());
  const readyBottleCount = stock
    .filter((item) => item.origin === "pronta-entrega" && !item.patientId)
    .reduce((total, item) => total + item.bottles, 0);

  const availableBottles = stock
    .filter((item) => item.status === "disponivel")
    .reduce((total, item) => total + item.bottles, 0);

  const reservedBottles = stock
    .filter((item) => item.status === "reservado")
    .reduce((total, item) => total + item.bottles, 0);

  const pendingPatientCount = new Set(
    stock
      .filter((item) => item.status !== "entregue" && item.patientId)
      .map((item) => item.patientId),
  ).size;

  const batchCount = new Set(stock.map((item) => item.batchId)).size;

  const summaryCards = [
    {
      label: "Frascos disponíveis",
      value: availableBottles,
      description: "Conferidos e liberados",
      color: "text-[#187157]",
    },
    {
      label: "Pronta entrega",
      value: readyBottleCount,
      description: "Frascos sem paciente definido",
      color: "text-[#7351a3]",
    },
    {
      label: "Frascos reservados",
      value: reservedBottles,
      description: "Separados para entrega",
      color: "text-[#966419]",
    },
    {
      label: "Pacientes aguardando",
      value: pendingPatientCount,
      description: "Com vacinas no estoque",
      color: "text-[#a3113a]",
    },
    {
      label: "Lotes recebidos",
      value: batchCount,
      description: "Com entrada registrada",
      color: "text-[#4965a2]",
    },
  ];

  async function toggleReservation(item: DemoStockItem) {
    if (item.status === "entregue" || !item.patientId) return;

    const reserve = item.status === "disponivel";

    await persistStockItem({
      ...item,
      status: reserve ? "reservado" : "disponivel",
      reservedAt: reserve ? new Date().toISOString() : undefined,
    });
    setSelectedItemId(item.id);
    setMessage(
      reserve
        ? `Vacina de ${item.patientName} reservada para organização da entrega.`
        : `Vacina de ${item.patientName} liberada novamente no estoque.`,
    );
  }

  async function confirmDelivery(item: DemoStockItem) {
    if (!item.patientId || item.status !== "reservado") return;

    const deliveredAt = new Date().toISOString();
    const patient = patients.find((record) => record.id === item.patientId);

    await persistStockItem({ ...item, status: "entregue", deliveredAt });

    if (patient && context) {
      const updatedPatient = {
        ...patient,
        lastReceivedDate: deliveredAt.slice(0, 10),
        bottlesReceived: (patient.bottlesReceived ?? 0) + item.bottles,
        status: patient.status === "com-pedido" ? "ativo" : patient.status,
      };
      await saveSecretaryPatient(context, updatedPatient);
      setPatients((current) => current.map((record) => record.id === patient.id ? updatedPatient : record));
    }

    setSelectedItemId(item.id);
    setMessage(`Recebimento confirmado: ${item.patientName} recebeu ${item.bottles} frasco(s) em ${formatDate(deliveredAt)}.`);
  }

  function selectStockItem(item: DemoStockItem) {
    setSelectedItemId(item.id);
    setAssignmentPatientId("");
    setAssignmentPaymentConfirmed(false);
    setAssignmentAsaasConfirmed(false);
    setAssignmentError("");
  }

  async function assignSelectedItem() {
    if (!selectedItem || !assignmentPatient) {
      setAssignmentError("Selecione o paciente que receberá o frasco.");
      return;
    }

    try {
      if (selectedItem.origin !== "pronta-entrega" || selectedItem.patientId) throw new Error("Este frasco não está mais disponível como pronta entrega.");
      if (assignmentPatient.registrationStatus !== "completed") throw new Error("Complete o cadastro do paciente antes de vincular o frasco.");
      if (!assignmentPrescription) throw new Error("O paciente precisa de uma receita médica antes da vinculação.");
      if (assignmentBilling?.paymentRequired && !assignmentPaymentConfirmed) throw new Error("Confirme o pagamento antes de vincular o frasco ao paciente.");
      if (assignmentBilling?.asaasRequired && !assignmentAsaasConfirmed) throw new Error("Confirme no ASAAS se o pagamento está em dia.");
      const now = new Date().toISOString();
      const assigned = await persistStockItem({
        ...selectedItem,
        id: selectedItem.bottles > 1 ? crypto.randomUUID() : selectedItem.id,
        prescriptionId: assignmentPrescription.id,
        patientId: assignmentPatient.id,
        patientName: assignmentPatient.name,
        patientCpf: assignmentPatient.cpf,
        patientPhone: assignmentPatient.phone,
        doctor: assignmentPrescription.doctor,
        treatment: assignmentPrescription.treatment,
        phase: assignmentPrescription.phase,
        formulas: assignmentPrescription.formulas,
        bottles: 1,
        delivery: assignmentPatient.delivery,
        status: "disponivel",
        assignedAt: now,
        paymentConfirmedAt: assignmentBilling?.paymentRequired ? now : undefined,
        asaasConfirmedAt: assignmentBilling?.asaasRequired ? now : undefined,
      });
      if (selectedItem.bottles > 1) await persistStockItem({ ...selectedItem, bottles: selectedItem.bottles - 1 });
      setSelectedItemId(assigned.id);
      setAssignmentError("");
      setOriginFilter("pedido-paciente");
      setMessage(`Frasco de pronta entrega vinculado a ${assignmentPatient.name} usando a última receita disponível.`);
    } catch (cause) {
      setAssignmentError(cause instanceof Error ? cause.message : "Não foi possível vincular este frasco.");
    }
  }

  function toggleStockSelection(itemId: string) {
    setSelectedStockIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  }

  function selectAllFiltered() {
    const selectableIds = filteredStock.filter((item) => item.patientId && item.status !== "entregue").map((item) => item.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedStockIds.includes(id));
    setSelectedStockIds(allSelected ? [] : selectableIds);
  }

  async function reserveSelected() {
    const selected = stock.filter((item) => selectedStockIds.includes(item.id) && item.patientId && item.status === "disponivel");
    const reservedAt = new Date().toISOString();
    await Promise.all(selected.map((item) => persistStockItem({ ...item, status: "reservado", reservedAt })));
    setSelectedStockIds([]);
    setMessage(`${selected.length} envio(s) reservado(s) em conjunto.`);
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
              className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10"
            >
              Lotes
            </Link>
            <Link
              href="/secretaria/estoque"
              className="block rounded-2xl bg-white/15 px-4 py-3 text-sm font-semibold"
            >
              Vacinas em estoque
            </Link>
            {["Notas fiscais", "Contratos", "Configurações"].map((item) => (
              <span
                key={item}
                className="block rounded-2xl px-4 py-3 text-sm text-white/65"
              >
                {item}
              </span>
            ))}
            <Link href="/" className="block rounded-2xl px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10">
              Sair
            </Link>
          </nav>

          <div className="mt-12 rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-sm font-semibold">Estoque rastreável</p>
            <p className="mt-2 text-xs leading-5 text-white/75">
              Cada frasco está vinculado ao paciente, à receita médica e ao lote de produção.
            </p>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c173c]">
                Secretaria · estoque e recebimento
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#86203b] sm:text-4xl">
                Vacinas em estoque
              </h1>
              <p className="mt-2 text-sm text-[#776b6e]">
                Acompanhe os frascos conferidos e organize a separação por paciente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 self-start">
              <Link
                href="/secretaria/lotes"
                className="rounded-2xl border border-[#eadfd9] bg-white px-5 py-3 text-sm font-semibold text-[#a3113a] shadow-sm hover:bg-[#fff8f8]"
              >
                ← Conferir lotes recebidos
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

          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-5">
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

          <div className="mt-7 grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_440px]">
            <section className="self-start rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5 grid gap-2 rounded-2xl bg-[#f8f2ef] p-2 sm:grid-cols-3">
                {([
                  { value: "todos", label: "Todos os frascos" },
                  { value: "pedido-paciente", label: "Pedidos de pacientes" },
                  { value: "pronta-entrega", label: "Pronta entrega" },
                ] as const).map((option) => (
                  <button key={option.value} type="button" onClick={() => { setOriginFilter(option.value); setAssignmentError(""); }} className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${originFilter === option.value ? "bg-white text-[#a3113a] shadow-sm" : "text-[#766b6e]"}`}>{option.label}</button>
                ))}
              </div>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#433438]">Frascos por paciente</h2>
                  <p className="mt-1 text-sm text-[#817578]">
                    Entradas geradas após conferência dos lotes.
                  </p>
                </div>
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as StockFilter)}
                  className="h-11 rounded-xl border border-[#e9dfda] bg-white px-4 text-sm outline-none focus:border-[#b91142]"
                >
                  <option value="todos">Todos os status</option>
                  {Object.entries(stockStatuses).map(([value, status]) => (
                    <option key={value} value={value}>{status.label}</option>
                  ))}
                </select>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <select value={batchFilter} onChange={(event) => { setBatchFilter(event.target.value); setSelectedStockIds([]); }} className="h-11 rounded-xl border border-[#e9dfda] bg-white px-3 text-sm outline-none focus:border-[#b91142]">
                  <option value="todos">Todos os lotes</option>
                  {availableBatches.map(([id, code]) => <option key={id} value={id}>Lote {code}</option>)}
                </select>
                <select value={deliveryFilter} onChange={(event) => { setDeliveryFilter(event.target.value as DeliveryFilter); setSelectedStockIds([]); }} className="h-11 rounded-xl border border-[#e9dfda] bg-white px-3 text-sm outline-none focus:border-[#b91142]">
                  <option value="todas">Todas as entregas</option><option value="Motoboy">Motoboy</option><option value="Sedex">Sedex</option><option value="Retirada">Retirada</option><option value="Aéreo">Aéreo</option>
                </select>
                <button type="button" onClick={selectAllFiltered} className="h-11 rounded-xl border border-[#eadfd9] px-3 text-sm font-semibold text-[#a3113a]">Selecionar todos do filtro</button>
              </div>
              {selectedStockIds.length > 0 && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#fff4e4] px-4 py-3 text-xs text-[#806238]"><strong>{selectedStockIds.length} envio(s) selecionado(s)</strong><button type="button" onClick={reserveSelected} className="rounded-lg bg-[#a3113a] px-3 py-2 font-semibold text-white">Reservar selecionados</button></div>}

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar paciente, CPF, lote, médico ou tratamento"
                className="mt-5 h-12 w-full rounded-xl border border-[#e9dfda] px-4 text-sm outline-none focus:border-[#b91142]"
              />

              <div className="mt-6 space-y-3">
                {filteredStock.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#e8dcd6] bg-[#fcfaf8] px-6 py-14 text-center">
                    <p className="font-semibold text-[#53454a]">Nenhuma vacina encontrada no estoque</p>
                    <p className="mx-auto mt-2 max-w-md text-sm text-[#817578]">
                      Finalize a conferência de um lote recebido do laboratório para registrar os frascos automaticamente.
                    </p>
                    <Link
                      href="/secretaria/lotes"
                      className="mt-5 inline-flex rounded-xl bg-[#a3113a] px-4 py-3 text-xs font-semibold text-white"
                    >
                      Ir para conferência de lotes
                    </Link>
                  </div>
                ) : (
                  filteredStock.map((item) => {
                    const active = selectedItem?.id === item.id;
                    const status = stockStatuses[item.status] ?? stockStatuses.disponivel ?? { label: "Disponível", badge: "bg-[#eaf8f3] text-[#187157]" };

                    return (
                      <div key={item.id} className="flex items-start gap-2">
                      {item.patientId && item.status !== "entregue" && <input type="checkbox" checked={selectedStockIds.includes(item.id)} onChange={() => toggleStockSelection(item.id)} aria-label={`Selecionar envio de ${item.patientName}`} className="mt-5 h-4 w-4 shrink-0 accent-[#a3113a]" />}
                      <button
                        type="button"
                        onClick={() => selectStockItem(item)}
                        className={`w-full rounded-2xl border p-4 text-left transition sm:p-5 ${
                          active
                            ? "border-[#b91142] bg-[#fff5f7]"
                            : "border-[#eee6e2] bg-[#fdfbf9] hover:border-[#dcb8c1]"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-[#433438]">
                              {item.patientId ? item.patientName : "Pronta entrega · sem paciente"}
                            </h3>
                            <p className="mt-1 text-xs text-[#817578]">
                              {item.patientId ? `CPF ${item.patientCpf} · ${item.doctor}` : `${item.formulas.map((formula) => formula.name).join(" · ")} · aguardando vinculação`}
                            </p>
                          </div>
                          <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${!item.patientId ? "bg-[#f3edff] text-[#7351a3]" : status.badge}`}>
                            {!item.patientId ? "Pronta entrega" : status.label}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 text-xs text-[#6e6165] sm:grid-cols-3">
                          <span><strong>Lote:</strong> {item.batchCode}</span>
                          <span><strong>Frascos:</strong> {item.bottles}</span>
                          <span><strong>Entrega:</strong> {item.delivery ?? "A definir"}</span>
                        </div>
                        <p className="mt-3 text-xs text-[#766a6d]">
                          <strong>Fase:</strong> {item.phase}
                        </p>
                      </button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="self-start rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-7">
              {!selectedItem ? (
                <div className="rounded-2xl border border-dashed border-[#e8dcd6] bg-[#fcfaf8] px-5 py-14 text-center">
                  <p className="font-semibold text-[#53454a]">Selecione um item do estoque</p>
                  <p className="mt-2 text-sm text-[#817578]">
                    As informações completas do paciente e da vacina aparecerão aqui.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a3113a]">
                    Detalhes do estoque
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-[#433438]">
                    {selectedItem.patientId ? selectedItem.patientName : "Pronta entrega"}
                  </h2>
                  <p className="mt-1 text-sm text-[#817578]">{selectedItem.patientId ? `CPF ${selectedItem.patientCpf}` : "Frasco disponível para vinculação a um paciente."}</p>
                  <span className={`mt-4 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${!selectedItem.patientId ? "bg-[#f3edff] text-[#7351a3]" : (stockStatuses[selectedItem.status] ?? stockStatuses.disponivel ?? { badge: "bg-[#eaf8f3] text-[#187157]" }).badge}`}>
                    {!selectedItem.patientId ? "Pronta entrega" : (stockStatuses[selectedItem.status] ?? stockStatuses.disponivel ?? { label: "Disponível" }).label}
                  </span>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#fbf5f2] p-4">
                      <p className="text-xs text-[#817578]">Quantidade</p>
                      <p className="mt-2 text-2xl font-bold text-[#a3113a]">
                        {selectedItem.bottles}
                      </p>
                      <p className="mt-1 text-xs text-[#817578]">frasco(s)</p>
                    </div>
                    <div className="rounded-2xl bg-[#fbf5f2] p-4">
                      <p className="text-xs text-[#817578]">Entrega prevista</p>
                      <p className="mt-3 text-sm font-bold text-[#a3113a]">
                        {selectedItem.delivery ?? "A definir"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4 border-t border-[#eee5e0] pt-5 text-sm">
                    <div>
                      <p className="text-xs text-[#817578]">Tratamento</p>
                      <p className="mt-1 font-semibold text-[#433438]">{selectedItem.treatment}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#817578]">Fase</p>
                      <p className="mt-1 font-semibold text-[#433438]">{selectedItem.phase}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#817578]">Médico responsável</p>
                      <p className="mt-1 font-semibold text-[#433438]">{selectedItem.doctor}</p>
                    </div>
                    {selectedItem.patientPhone && (
                      <div>
                        <p className="text-xs text-[#817578]">Contato do paciente</p>
                        <p className="mt-1 font-semibold text-[#433438]">
                          {selectedItem.patientPhone}
                        </p>
                      </div>
                    )}
                  </div>

                  {selectedPatient && (
                    <div className="mt-6 rounded-2xl border border-[#eee5e0] bg-[#fcfaf8] p-4">
                      <p className="text-sm font-bold text-[#433438]">Endereço completo para entrega</p>
                      <div className="mt-4 grid gap-3 text-xs text-[#66595d] sm:grid-cols-2">
                        <p><strong>CEP:</strong> {selectedPatient.zipCode ?? "Não informado"}</p>
                        <p><strong>Rua:</strong> {selectedPatient.street ?? selectedPatient.address ?? "Não informada"}</p>
                        <p><strong>Número:</strong> {selectedPatient.addressNumber ?? "Não informado"}</p>
                        <p><strong>Complemento:</strong> {selectedPatient.addressComplement ?? "Não informado"}</p>
                        <p><strong>Bairro:</strong> {selectedPatient.neighborhood ?? "Não informado"}</p>
                        <p><strong>Cidade:</strong> {selectedPatient.city ?? "Não informada"}</p>
                        <p><strong>Estado:</strong> {selectedPatient.state ?? "Não informado"}</p>
                        <p><strong>Forma de envio:</strong> {selectedItem.delivery ?? "A definir"}</p>
                      </div>
                      <div className="mt-4 rounded-xl bg-white p-3 text-xs leading-5 text-[#66595d]"><strong>Observações:</strong> {selectedPatient.deliveryNotes ?? selectedPatient.notes ?? "Nenhuma observação cadastrada."}</div>
                    </div>
                  )}

                  <div className="mt-6 rounded-2xl bg-[#fbf5f2] p-4">
                    <p className="text-sm font-bold text-[#433438]">Composição da vacina</p>
                    <div className="mt-4 space-y-3">
                      {selectedItem.formulas.map((formula) => (
                        <div key={formula.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-[#625559]">{formula.name}</span>
                          <strong className="text-[#a3113a]">{formula.percentage}%</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 space-y-3 border-t border-[#eee5e0] pt-5 text-xs text-[#716569]">
                    <p><strong>Lote:</strong> {selectedItem.batchCode}</p>
                    <p><strong>Laboratório:</strong> {selectedItem.laboratory}</p>
                    <p><strong>Entrada no estoque:</strong> {formatDate(selectedItem.receivedAt)}</p>
                    <p><strong>Conferido por:</strong> {selectedItem.checkedBy}</p>
                    {selectedItem.reservedAt && (
                      <p><strong>Reserva:</strong> {formatDate(selectedItem.reservedAt)}</p>
                    )}
                    {selectedItem.deliveredAt && (
                      <p><strong>Entrega:</strong> {formatDate(selectedItem.deliveredAt)}</p>
                    )}
                  </div>

                  {!selectedItem.patientId && (
                    <div className="mt-6 rounded-2xl border border-[#e5daf1] bg-[#faf7ff] p-4">
                      <h3 className="text-sm font-bold text-[#7351a3]">Vincular a um paciente</h3>
                      <p className="mt-1 text-xs text-[#66595d]">A última receita do paciente será buscada automaticamente.</p>
                      <select value={assignmentPatientId} onChange={(event) => { setAssignmentPatientId(event.target.value); setAssignmentPaymentConfirmed(false); setAssignmentAsaasConfirmed(false); setAssignmentError(""); }} className="mt-4 h-11 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm outline-none focus:border-[#b91142]">
                        <option value="">Selecione um paciente</option>
                        {patients.filter((patient) => patient.registrationStatus === "completed").map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.cpf}</option>)}
                      </select>

                      {assignmentPatient && (
                        <div className="mt-4 rounded-xl bg-white p-3 text-xs text-[#66595d]">
                          <p><strong>Última receita:</strong> {assignmentPrescription ? formatDate(assignmentPrescription.createdAt) : "Paciente sem receita cadastrada"}</p>
                          {assignmentPrescription && <p className="mt-2"><strong>Fase prescrita:</strong> {assignmentPrescription.phase}</p>}
                          {assignmentPrescription && <p className="mt-2"><strong>Composição:</strong> {assignmentPrescription.formulas.map((formula) => `${formula.name} ${formula.percentage}%`).join(" · ")}</p>}
                          {assignmentPrescription && assignmentPrescription.phase !== selectedItem.phase && <p className="mt-2 rounded-lg bg-[#fff4e4] p-2 text-[#966419]">A fase deste frasco é diferente da fase da última receita. Confira antes de prosseguir.</p>}
                          {assignmentBilling && <p className={`mt-3 font-semibold ${assignmentBilling.paymentRequired ? "text-[#966419]" : "text-[#187157]"}`}>{assignmentBilling.explanation}</p>}
                          {assignmentBilling?.paymentRequired && <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={assignmentPaymentConfirmed} onChange={(event) => setAssignmentPaymentConfirmed(event.target.checked)} className="mt-0.5 accent-[#a3113a]" />Confirmo a cobrança e o pagamento deste frasco.</label>}
                          {assignmentBilling?.asaasRequired && <label className="mt-3 flex items-start gap-2 rounded-lg bg-[#eef3ff] p-2 text-[#3c5da0]"><input type="checkbox" checked={assignmentAsaasConfirmed} onChange={(event) => setAssignmentAsaasConfirmed(event.target.checked)} className="mt-0.5 accent-[#3c5da0]" /><span><strong>Confirmar no ASAAS se o pagamento está em dia.</strong></span></label>}
                        </div>
                      )}

                      {assignmentError && <p role="alert" className="mt-3 rounded-xl bg-[#fff1f3] px-3 py-2 text-xs text-[#a3113a]">{assignmentError}</p>}
                      <button type="button" onClick={assignSelectedItem} disabled={!assignmentPatientId || !assignmentPrescription} className="mt-4 w-full rounded-xl bg-[#7351a3] px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">Vincular frasco ao paciente</button>
                    </div>
                  )}

                  {selectedItem.patientId && selectedItem.status !== "entregue" && (
                    <div className="mt-6 space-y-3">
                      {selectedItem.status === "reservado" && (
                        <button type="button" onClick={() => confirmDelivery(selectedItem)} className="w-full rounded-xl bg-[#187157] px-4 py-3.5 text-sm font-semibold text-white hover:bg-[#135b46]">
                          ✓ Confirmar recebimento pelo paciente
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleReservation(selectedItem)}
                        className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold ${
                          selectedItem.status === "disponivel"
                            ? "bg-[#a3113a] text-white hover:bg-[#870e31]"
                            : "border border-[#eadfd9] text-[#a3113a] hover:bg-[#fff8f8]"
                        }`}
                      >
                        {selectedItem.status === "disponivel" ? "Reservar para entrega" : "Cancelar reserva e liberar estoque"}
                      </button>
                    </div>
                  )}

                  <p className="mt-4 text-center text-xs text-[#817578]">
                    {selectedItem.patientId ? (stockStatuses[selectedItem.status] ?? { description: "Status não informado" }).description : "Disponível para vinculação a um paciente"}.
                  </p>
                </>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
