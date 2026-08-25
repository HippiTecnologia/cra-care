"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DemoBatch,
  DemoBatchItem,
  DemoBatchStatus,
  DemoPrescription,
  readDemoBatches,
  readDemoPrescriptions,
  saveDemoBatch,
  subscribeDemoPatients,
} from "../medico/patient-store";

type LaboratoryFilter = "todos" | "enviado" | "em-producao" | "pronto";

const statusAppearance: Record<
  Exclude<DemoBatchStatus, "rascunho">,
  { label: string; badge: string; description: string }
> = {
  enviado: {
    label: "Aguardando produção",
    badge: "bg-[#eef3ff] text-[#3c5da0]",
    description: "Recebido da secretaria e aguardando manipulação.",
  },
  "em-producao": {
    label: "Em produção",
    badge: "bg-[#f3edff] text-[#7351a3]",
    description: "Manipulação e conferência dos componentes em andamento.",
  },
  pronto: {
    label: "Pronto para conferência",
    badge: "bg-[#eaf8f3] text-[#187157]",
    description: "Produção concluída e encaminhada à secretaria.",
  },
  conferido: {
    label: "Conferido pela secretaria",
    badge: "bg-[#e8f7ef] text-[#176546]",
    description: "Lote validado e liberado para estoque e entrega.",
  },
};

const filterOptions: { value: LaboratoryFilter; label: string }[] = [
  { value: "todos", label: "Todos os lotes" },
  { value: "enviado", label: "Aguardando produção" },
  { value: "em-producao", label: "Em produção" },
  { value: "pronto", label: "Finalizados" },
];

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

export default function LaboratorioPage() {
  const [batches, setBatches] = useState<DemoBatch[]>([]);
  const [prescriptions, setPrescriptions] = useState<DemoPrescription[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LaboratoryFilter>("todos");
  const [search, setSearch] = useState("");
  const [responsible, setResponsible] = useState("Equipe de manipulação CRA");
  const [productionNotes, setProductionNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const synchronize = () => {
      setBatches(readDemoBatches().filter((batch) => batch.status !== "rascunho"));
      setPrescriptions(readDemoPrescriptions());
    };

    queueMicrotask(synchronize);

    return subscribeDemoPatients(synchronize);
  }, []);

  const filteredBatches = useMemo(() => {
    const normalized = normalizeSearch(search);

    return batches.filter((batch) => {
      const matchesFilter =
        filter === "todos" ||
        batch.status === filter ||
        (filter === "pronto" && batch.status === "conferido");

      if (!matchesFilter) return false;
      if (!normalized) return true;

      const searchable = [
        batch.code,
        batch.laboratory,
        ...batch.items.flatMap((item) => [
          item.patientName,
          item.patientCpf,
          item.doctor,
        ]),
      ].join(" ");

      return normalizeSearch(searchable).includes(normalized);
    });
  }, [batches, filter, search]);

  const selectedBatch =
    filteredBatches.find((batch) => batch.id === selectedBatchId) ??
    filteredBatches[0];

  const selectedPreparedIds = selectedBatch?.preparedPrescriptionIds ?? [];
  const selectedBottleCount = selectedBatch?.items.reduce(
    (total, item) => total + item.bottles,
    0,
  );

  const allItemsPrepared = Boolean(
    selectedBatch && selectedPreparedIds.length === selectedBatch.items.length,
  );

  const summaryCards = [
    {
      label: "Lotes recebidos",
      value: batches.filter((batch) => batch.status === "enviado").length,
      description: "Aguardando início da produção",
      color: "text-[#4965a2]",
      icon: "↓",
    },
    {
      label: "Em produção",
      value: batches.filter((batch) => batch.status === "em-producao").length,
      description: "Manipulação em andamento",
      color: "text-[#7351a3]",
      icon: "◌",
    },
    {
      label: "Frascos pendentes",
      value: batches
        .filter((batch) =>
          ["enviado", "em-producao"].includes(batch.status),
        )
        .reduce(
          (total, batch) =>
            total + batch.items.reduce((count, item) => count + item.bottles, 0),
          0,
        ),
      description: "Volume total a ser produzido",
      color: "text-[#a3113a]",
      icon: "◈",
    },
    {
      label: "Produção concluída",
      value: batches.filter((batch) =>
        ["pronto", "conferido"].includes(batch.status),
      ).length,
      description: "Encaminhados à secretaria",
      color: "text-[#187157]",
      icon: "✓",
    },
  ];

  function startProduction(batch: DemoBatch) {
    if (!responsible.trim()) {
      setError("Informe o responsável pela manipulação antes de iniciar.");
      return;
    }

    saveDemoBatch({
      ...batch,
      status: "em-producao",
      productionStartedAt: new Date().toISOString(),
      productionResponsible: responsible.trim(),
      productionNotes: productionNotes.trim(),
      preparedPrescriptionIds: [],
    });
    setSelectedBatchId(batch.id);
    setError("");
    setMessage(`Produção do lote ${batch.code} iniciada com sucesso.`);
  }

  function togglePreparedItem(batch: DemoBatch, prescriptionId: string) {
    if (batch.status !== "em-producao") return;

    const current = batch.preparedPrescriptionIds ?? [];
    const preparedPrescriptionIds = current.includes(prescriptionId)
      ? current.filter((id) => id !== prescriptionId)
      : [...current, prescriptionId];

    saveDemoBatch({ ...batch, preparedPrescriptionIds });
    setError("");
  }

  function finishProduction(batch: DemoBatch) {
    if ((batch.preparedPrescriptionIds ?? []).length !== batch.items.length) {
      setError("Confira todas as receitas do lote antes de concluir a produção.");
      return;
    }

    saveDemoBatch({
      ...batch,
      status: "pronto",
      productionFinishedAt: new Date().toISOString(),
      productionResponsible: responsible.trim() || batch.productionResponsible,
      productionNotes: productionNotes.trim() || batch.productionNotes,
    });
    setError("");
    setProductionNotes("");
    setMessage(
      `Lote ${batch.code} finalizado. A secretaria já pode realizar a conferência.`,
    );
  }

  function selectBatch(batch: DemoBatch) {
    setSelectedBatchId(batch.id);
    setResponsible(batch.productionResponsible ?? "Equipe de manipulação CRA");
    setProductionNotes(batch.productionNotes ?? "");
    setError("");
  }

  function downloadPrescription(item: DemoBatchItem, batch: DemoBatch) {
    const prescription = prescriptions.find((record) => record.id === item.prescriptionId);

    if (!prescription) {
      setError("A receita médica deste paciente não está disponível para download.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=900");

    if (!printWindow) {
      setError("Permita a abertura de janelas no navegador para baixar a receita em PDF.");
      return;
    }

    const document = printWindow.document;
    document.title = `Receita médica - ${item.patientName} - ${batch.code}`;
    const styles = document.createElement("style");
    styles.textContent = "body{font-family:Arial,sans-serif;color:#34292d;margin:48px;line-height:1.6}header{border-bottom:3px solid #a3113a;padding-bottom:18px}h1{color:#a3113a;margin:0}h2{font-size:17px;margin-top:28px}p{margin:7px 0}.formula{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee}.signature{margin-top:55px;border-top:1px solid #aaa;padding-top:12px}@media print{body{margin:24px}}";
    document.head.append(styles);

    function addText(tag: "h1" | "h2" | "p", value: string, parent: HTMLElement = document.body) {
      const element = document.createElement(tag);
      element.textContent = value;
      parent.append(element);
    }

    const header = document.createElement("header");
    addText("h1", "CRA Care · Receita médica", header);
    addText("p", `Lote ${batch.code} · Emitida em ${formatDate(prescription.createdAt)}`, header);
    document.body.append(header);
    addText("h2", "Dados do paciente");
    addText("p", `Paciente: ${item.patientName}`);
    addText("p", `CPF: ${item.patientCpf}`);
    addText("h2", "Prescrição médica");
    addText("p", `Médico responsável: ${prescription.doctor} · CRM ${prescription.doctorCrm}`);
    addText("p", `Tratamento: ${prescription.treatment}`);
    addText("p", `Fase: ${prescription.phase}`);
    addText("p", `Quantidade: ${prescription.bottles} frasco(s)`);
    addText("p", `Posologia: ${prescription.posology}`);
    addText("p", `Frequência: ${prescription.frequency} · ${prescription.drops} gotas`);
    addText("h2", "Fórmula e composição");

    for (const formula of prescription.formulas) {
      const row = document.createElement("div");
      row.className = "formula";
      const name = document.createElement("span");
      name.textContent = formula.name;
      const percentage = document.createElement("strong");
      percentage.textContent = `${formula.percentage}%`;
      row.append(name, percentage);
      document.body.append(row);
    }

    if (prescription.notes) {
      addText("h2", "Observações do médico");
      addText("p", prescription.notes);
    }

    const signature = document.createElement("div");
    signature.className = "signature";
    addText("p", `${prescription.doctor} · CRM ${prescription.doctorCrm}`, signature);
    addText("p", prescription.signatureStatus === "signed" ? "Receita assinada" : "Assinatura pendente", signature);
    document.body.append(signature);
    printWindow.focus();
    printWindow.requestAnimationFrame(() => printWindow.print());
    setMessage(`Receita de ${item.patientName} preparada. Selecione "Salvar como PDF" na impressão.`);
    setError("");
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
            <p className="mt-4 text-sm text-white/70">Painel do Laboratório</p>
          </div>

          <nav className="mt-8 space-y-2">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setFilter(option.value);
                  setError("");
                }}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                  filter === option.value
                    ? "bg-white/15 font-semibold text-white"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                {option.label}
              </button>
            ))}
          </nav>

          <div className="mt-12 rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-sm font-semibold">Produção rastreável</p>
            <p className="mt-2 text-xs leading-5 text-white/75">
              Receitas, composições e etapas reunidas em um fluxo conectado à secretaria.
            </p>
          </div>

          <Link
            href="/"
            className="mt-8 inline-flex text-sm font-semibold text-white/85 hover:text-white"
          >
            ← Sair do laboratório
          </Link>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c173c]">
                Laboratório · gestão de produção
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#86203b] sm:text-4xl">
                Central de manipulação
              </h1>
              <p className="mt-2 text-sm text-[#776b6e]">
                Receba lotes, organize a produção e libere os pedidos para conferência.
              </p>
            </div>

            <div className="flex items-center gap-3 self-start rounded-2xl border border-[#eadfd9] bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#faedf0] text-sm font-bold text-[#a3113a]">
                L
              </div>
              <div>
                <p className="text-sm font-semibold text-[#433438]">Laboratório CRA</p>
                <p className="text-xs text-[#817578]">Produção e manipulação</p>
              </div>
              <Link href="/" className="ml-2 rounded-xl border border-[#eadfd9] px-3 py-2 text-xs font-semibold text-[#a3113a] hover:bg-[#fff5f7]">
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
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[#76696d]">{card.label}</p>
                  <span className={`text-xl font-bold ${card.color}`}>{card.icon}</span>
                </div>
                <p className={`mt-3 text-4xl font-bold ${card.color}`}>{card.value}</p>
                <p className="mt-2 text-xs text-[#8a7c80]">{card.description}</p>
              </article>
            ))}
          </div>

          <div className="mt-7 grid gap-6 2xl:grid-cols-[minmax(390px,0.85fr)_minmax(0,1.15fr)]">
            <section className="self-start rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-7">
              <div>
                <h2 className="text-xl font-bold text-[#433438]">Fila de produção</h2>
                <p className="mt-1 text-sm text-[#817578]">
                  Lotes encaminhados pela secretaria.
                </p>
              </div>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar lote, paciente, CPF ou médico"
                className="mt-5 h-12 w-full rounded-xl border border-[#e9dfda] px-4 text-sm outline-none focus:border-[#b91142]"
              />

              <div className="mt-5 flex flex-wrap gap-2">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFilter(option.value)}
                    className={`rounded-full px-3 py-2 text-xs font-semibold ${
                      filter === option.value
                        ? "bg-[#a3113a] text-white"
                        : "bg-[#f7f2ef] text-[#74666a] hover:bg-[#f0e8e4]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-3">
                {filteredBatches.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#e8dcd6] bg-[#fcfaf8] px-5 py-12 text-center">
                    <p className="font-semibold text-[#53454a]">Nenhum lote encontrado</p>
                    <p className="mt-2 text-sm text-[#817578]">
                      Os lotes aparecerão aqui assim que a secretaria realizar o envio.
                    </p>
                  </div>
                ) : (
                  filteredBatches.map((batch) => {
                    if (batch.status === "rascunho") return null;

                    const appearance = statusAppearance[batch.status];
                    const active = selectedBatch?.id === batch.id;
                    const bottles = batch.items.reduce(
                      (total, item) => total + item.bottles,
                      0,
                    );

                    return (
                      <button
                        key={batch.id}
                        type="button"
                        onClick={() => selectBatch(batch)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          active
                            ? "border-[#b91142] bg-[#fff5f7]"
                            : "border-[#eee6e2] bg-[#fdfbf9] hover:border-[#dcb8c1]"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-[#433438]">{batch.code}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${appearance.badge}`}>
                            {appearance.label}
                          </span>
                        </div>
                        <p className={`mt-2 text-xs font-semibold ${batch.orderType === "pronta-entrega" ? "text-[#7351a3]" : "text-[#a3113a]"}`}>{batch.orderType === "pronta-entrega" ? "Pronta entrega · sem paciente" : "Pedido de paciente"}</p>
                        <p className="mt-3 text-xs text-[#776b6e]">
                          Recebido em {formatDate(batch.sentAt)}
                        </p>
                        <p className="mt-1 text-xs text-[#776b6e]">
                          {batch.items.length} {batch.orderType === "pronta-entrega" ? "fórmula(s)" : "paciente(s)"} · {bottles} frasco(s)
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {batch.items.slice(0, 2).map((item) => (
                            <span
                              key={item.prescriptionId}
                              className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#6d6064]"
                            >
                              {item.patientName}
                            </span>
                          ))}
                          {batch.items.length > 2 && (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#6d6064]">
                              +{batch.items.length - 2}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="self-start rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-7">
              {!selectedBatch || selectedBatch.status === "rascunho" ? (
                <div className="rounded-2xl border border-dashed border-[#e8dcd6] bg-[#fcfaf8] px-6 py-20 text-center">
                  <p className="text-lg font-bold text-[#53454a]">Aguardando lotes da secretaria</p>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#817578]">
                    Assim que um lote for enviado, você poderá consultar as receitas, iniciar a manipulação e concluir a produção.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a3113a]">
                        Ordem de produção
                      </p>
                      <h2 className="mt-2 text-2xl font-bold text-[#433438]">
                        Lote {selectedBatch.code}
                      </h2>
                      <p className="mt-2 text-xs font-semibold text-[#7351a3]">{selectedBatch.orderType === "pronta-entrega" ? "Produção para estoque de pronta entrega" : "Produção vinculada a pacientes"}</p>
                      <p className="mt-2 text-sm text-[#817578]">
                        {statusAppearance[selectedBatch.status].description}
                      </p>
                    </div>
                    <span className={`self-start rounded-full px-3 py-1.5 text-xs font-semibold ${statusAppearance[selectedBatch.status].badge}`}>
                      {statusAppearance[selectedBatch.status].label}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-[#fbf5f2] p-4">
                      <p className="text-xs text-[#817578]">{selectedBatch.orderType === "pronta-entrega" ? "Fórmulas" : "Pacientes"}</p>
                      <p className="mt-2 text-2xl font-bold text-[#a3113a]">
                        {selectedBatch.items.length}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#fbf5f2] p-4">
                      <p className="text-xs text-[#817578]">Frascos</p>
                      <p className="mt-2 text-2xl font-bold text-[#a3113a]">
                        {selectedBottleCount}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#fbf5f2] p-4">
                      <p className="text-xs text-[#817578]">Receitas conferidas</p>
                      <p className="mt-2 text-2xl font-bold text-[#a3113a]">
                        {selectedPreparedIds.length}/{selectedBatch.items.length}
                      </p>
                    </div>
                  </div>

                  {selectedBatch.notes && (
                    <div className="mt-5 rounded-2xl border border-[#f1dfbe] bg-[#fff8eb] px-4 py-3">
                      <p className="text-xs font-bold text-[#88642c]">Orientações da secretaria</p>
                      <p className="mt-1 text-sm text-[#745c37]">{selectedBatch.notes}</p>
                    </div>
                  )}

                  <div className="mt-7 border-t border-[#eee5e0] pt-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-base font-bold text-[#433438]">
                        Receitas e composição
                      </h3>
                      <span className="text-xs text-[#817578]">
                        Confira cada formulação antes de finalizar.
                      </span>
                    </div>

                    <div className="mt-4 space-y-4">
                      {selectedBatch.items.map((item) => {
                        const prepared = selectedPreparedIds.includes(item.prescriptionId);
                        const editable = selectedBatch.status === "em-producao";
                        const prescription = prescriptions.find((record) => record.id === item.prescriptionId);

                        return (
                          <article
                            key={item.prescriptionId}
                            className={`rounded-2xl border p-4 sm:p-5 ${
                              prepared
                                ? "border-[#cfe9df] bg-[#f3fbf7]"
                                : "border-[#eee6e2] bg-[#fdfbf9]"
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h4 className="text-sm font-bold text-[#433438]">
                                  {item.patientName}
                                </h4>
                                <p className="mt-1 text-xs text-[#776b6e]">
                                  {item.patientId ? `CPF ${item.patientCpf} · ${item.doctor}` : "Estoque de pronta entrega · sem paciente definido"}
                                </p>
                              </div>
                              <span className="self-start rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#a3113a]">
                                {item.bottles} frasco(s)
                              </span>
                            </div>

                            <div className="mt-4 grid gap-3 text-xs text-[#66595d] sm:grid-cols-2">
                              <p><strong>Tratamento:</strong> {item.treatment}</p>
                              <p><strong>Fase:</strong> {item.phase}</p>
                              {prescription && <p><strong>CRM:</strong> {prescription.doctorCrm}</p>}
                              {prescription && <p><strong>Receita emitida:</strong> {formatDate(prescription.createdAt)}</p>}
                              {prescription && <p><strong>Posologia:</strong> {prescription.posology}</p>}
                              {prescription && <p><strong>Frequência:</strong> {prescription.frequency} · {prescription.drops} gotas</p>}
                            </div>

                            {prescription?.notes && (
                              <p className="mt-4 rounded-xl bg-[#fff8eb] px-3 py-2 text-xs text-[#745c37]">
                                <strong>Observações do médico:</strong> {prescription.notes}
                              </p>
                            )}

                            <div className="mt-4 rounded-xl bg-white p-3">
                              <p className="text-xs font-semibold text-[#544449]">Composição da vacina</p>
                              <div className="mt-3 space-y-2">
                                {item.formulas.map((formula) => (
                                  <div
                                    key={formula.id}
                                    className="flex items-center justify-between gap-3 text-xs"
                                  >
                                    <span className="text-[#625559]">{formula.name}</span>
                                    <strong className="text-[#a3113a]">
                                      {formula.percentage}%
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {item.patientId && (
                              <button
                                type="button"
                                disabled={!prescription}
                                onClick={() => downloadPrescription(item, selectedBatch)}
                                className="mt-4 rounded-xl border border-[#e6dbd6] px-4 py-2.5 text-xs font-semibold text-[#a3113a] hover:bg-[#fff5f7] disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                ↓ Baixar receita em PDF
                              </button>
                            )}

                            {(editable || prepared) && (
                              <button
                                type="button"
                                disabled={!editable}
                                onClick={() =>
                                  togglePreparedItem(selectedBatch, item.prescriptionId)
                                }
                                className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
                                  prepared
                                    ? "bg-[#e5f5ed] text-[#187157]"
                                    : "bg-[#f5efec] text-[#67595d] hover:bg-[#eee5e0]"
                                }`}
                              >
                                <span>{prepared ? "✓" : "○"}</span>
                                {prepared ? "Formulação conferida" : "Marcar formulação como conferida"}
                              </button>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-7 border-t border-[#eee5e0] pt-6">
                    <label className="block text-sm font-semibold text-[#544449]">
                      Responsável pela manipulação
                      <input
                        value={responsible}
                        onChange={(event) => {
                          setResponsible(event.target.value);
                          setError("");
                        }}
                        disabled={["pronto", "conferido"].includes(selectedBatch.status)}
                        className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 font-normal outline-none focus:border-[#b91142] disabled:bg-[#f8f5f2]"
                      />
                    </label>

                    <label className="mt-5 block text-sm font-semibold text-[#544449]">
                      Observações do laboratório
                      <textarea
                        value={productionNotes}
                        onChange={(event) => setProductionNotes(event.target.value)}
                        disabled={["pronto", "conferido"].includes(selectedBatch.status)}
                        rows={3}
                        placeholder="Registre orientações, intercorrências ou informações de produção"
                        className="mt-2 w-full rounded-xl border border-[#e9dfda] bg-white px-4 py-3 font-normal outline-none focus:border-[#b91142] disabled:bg-[#f8f5f2]"
                      />
                    </label>

                    {error && (
                      <p role="alert" className="mt-4 rounded-xl bg-[#fff1f3] px-4 py-3 text-sm text-[#a3113a]">
                        {error}
                      </p>
                    )}

                    {selectedBatch.status === "enviado" && (
                      <button
                        type="button"
                        onClick={() => startProduction(selectedBatch)}
                        className="mt-5 w-full rounded-xl bg-[#a3113a] px-4 py-3.5 text-sm font-semibold text-white hover:bg-[#870e31]"
                      >
                        Iniciar produção do lote
                      </button>
                    )}

                    {selectedBatch.status === "em-producao" && (
                      <button
                        type="button"
                        onClick={() => finishProduction(selectedBatch)}
                        disabled={!allItemsPrepared}
                        className="mt-5 w-full rounded-xl bg-[#187157] px-4 py-3.5 text-sm font-semibold text-white hover:bg-[#115842] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {allItemsPrepared
                          ? "Concluir produção e avisar secretaria"
                          : `Confira as receitas para concluir (${selectedPreparedIds.length}/${selectedBatch.items.length})`}
                      </button>
                    )}

                    {["pronto", "conferido"].includes(selectedBatch.status) && (
                      <div className="mt-5 rounded-2xl border border-[#cfe9df] bg-[#edf8f3] px-4 py-4 text-sm text-[#187157]">
                        <p className="font-semibold">Produção concluída e disponível para a secretaria.</p>
                        <p className="mt-2 text-xs">
                          Finalizada em {formatDate(selectedBatch.productionFinishedAt)}
                          {selectedBatch.productionResponsible &&
                            ` · ${selectedBatch.productionResponsible}`}
                        </p>
                      </div>
                    )}

                    {selectedBatch.productionStartedAt && (
                      <p className="mt-4 text-xs text-[#817578]">
                        Produção iniciada em {formatDate(selectedBatch.productionStartedAt)}.
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
