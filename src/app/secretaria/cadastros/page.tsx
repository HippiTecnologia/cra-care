"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  DemoPatientRecord,
  PatientPaymentRecord,
  demoMedicalPatients,
  openDemoInvoicePdf,
  readDemoInvoices,
  readDemoPatients,
  readDemoPrescriptions,
  readDemoStock,
  saveDemoPatient,
  subscribeDemoPatients,
  treatmentPhases,
} from "../../medico/patient-store";
import { buildBottleHistory } from "../../paciente/bottle-history";
import {
  PatientPortalState,
  createDefaultPortalState,
  readPortalState,
  subscribePortalState,
} from "../../paciente/patient-portal-store";

type Tab = "pessoais" | "tratamento" | "financeiro";

const statusOptions: Array<[NonNullable<DemoPatientRecord["status"]>, string]> = [
  ["com-pedido", "Com pedido"],
  ["em-conversa", "Em conversa"],
  ["ativo", "Ativo"],
  ["bacteriana", "Bacteriana"],
  ["tentar-novamente", "Tentar novamente"],
  ["perdido", "Perdido"],
  ["desistente", "Desistente"],
  ["concluido", "Concluído"],
];

const acquisitionOptions: NonNullable<DemoPatientRecord["acquisitionMethod"]>[] = [
  "Por frasco",
  "Tratamento de 6 meses",
  "Recorrente — ASAAS",
  "Método 1.0",
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

function mergePatients() {
  const saved = readDemoPatients();
  const savedIds = new Set(saved.map((item) => item.id));
  return [...saved, ...demoMedicalPatients.filter((item) => !savedIds.has(item.id))];
}

export default function PatientRecordsPage() {
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [portals, setPortals] = useState<Record<string, PatientPortalState>>({});
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("pessoais");
  const [draft, setDraft] = useState<DemoPatientRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [installmentNumber, setInstallmentNumber] = useState(1);

  useEffect(() => {
    const synchronize = () => {
      const all = mergePatients();
      setPatients(all);
      setPortals(Object.fromEntries(all.map((item) => [item.id, readPortalState(item.id)])));
      const hash = window.location.hash.slice(1);
      const initialId = all.some((item) => item.id === hash) ? hash : all[0]?.id ?? "";
      setSelectedId((current) => current || initialId);
      setDraft((current) => current ?? all.find((item) => item.id === initialId) ?? null);
    };
    queueMicrotask(synchronize);
    const unsubscribePatients = subscribeDemoPatients(synchronize);
    const unsubscribePortal = subscribePortalState(synchronize);
    return () => { unsubscribePatients(); unsubscribePortal(); };
  }, []);

  const patient = patients.find((item) => item.id === selectedId);

  const visible = useMemo(() => {
    const term = searchText(search);
    return patients.filter((item) => !term || searchText(`${item.name} ${item.cpf}`).includes(term));
  }, [patients, search]);

  const portal = patient ? portals[patient.id] ?? createDefaultPortalState(patient.id) : undefined;
  const prescriptions = patient ? readDemoPrescriptions(patient.id) : [];
  const invoices = patient ? readDemoInvoices(patient.id) : [];
  const stock = patient ? readDemoStock().filter((item) => item.patientId === patient.id) : [];
  const bottleHistory = patient && portal ? buildBottleHistory(patient, portal, stock) : [];
  const totalPaid = (patient?.payments ?? []).reduce((sum, item) => sum + item.amount, 0);
  const remaining = Math.max(0, (patient?.contractValue ?? 0) - totalPaid);
  const currentBottle = bottleHistory.find((item) => item.status === "em-uso");
  const nextContact = currentBottle?.startedAt ? (() => {
    const date = new Date(`${currentBottle.startedAt.slice(0, 10)}T12:00:00`);
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  })() : undefined;

  function updateDraft<K extends keyof DemoPatientRecord>(key: K, value: DemoPatientRecord[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function saveDraft(section: string) {
    if (!draft) return;
    if (!draft.name.trim() || !draft.cpf.trim() || !draft.birthDate) {
      setMessage("Nome completo, CPF e data de nascimento são obrigatórios.");
      return;
    }
    saveDemoPatient(draft);
    setEditing(false);
    setMessage(`${section} atualizados com sucesso.`);
  }

  function addPayment() {
    if (!patient || !draft) return;
    const parsed = parseMoney(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage("Informe um valor de pagamento válido.");
      return;
    }
    const payment: PatientPaymentRecord = {
      id: crypto.randomUUID(),
      amount: parsed,
      paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
      method: draft.paymentMethod ?? "A definir",
      installments: draft.paymentMethod === "Cartão de crédito" ? Math.max(1, draft.paymentInstallments ?? 1) : undefined,
      installmentNumber: (draft.paymentInstallments ?? 1) > 1 ? installmentNumber : undefined,
      dueAt: draft.paymentDueDate,
      asaasReference: paymentReference.trim() || undefined,
      notes: paymentNotes.trim() || undefined,
    };
    const updated = { ...draft, paymentStatus: "Em dia" as const, payments: [payment, ...(patient.payments ?? [])] };
    saveDemoPatient(updated);
    setDraft(updated);
    setAmount("");
    setPaymentNotes("");
    setPaymentReference("");
    setInstallmentNumber(1);
    setMessage("Pagamento registrado pela Secretaria.");
  }

  function removePayment(paymentId: string) {
    if (!draft) return;
    const updated = { ...draft, payments: (draft.payments ?? []).filter((item) => item.id !== paymentId) };
    saveDemoPatient(updated);
    setDraft(updated);
    setMessage("Lançamento removido do histórico.");
  }

  function selectPatient(id: string) {
    setSelectedId(id);
    setDraft(patients.find((item) => item.id === id) ?? null);
    setEditing(false);
    setMessage("");
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <main className="min-h-screen bg-[#f8f5f2] p-4 text-[#34292d] sm:p-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#a3113a]">Secretaria</p><h1 className="mt-2 text-3xl font-bold">Cadastros completos</h1><p className="mt-2 text-sm text-[#817578]">Dados pessoais, tratamento e financeiro em um único lugar.</p></div>
          <Link href="/secretaria" className="rounded-xl border border-[#e6dbd6] bg-white px-4 py-3 text-sm font-semibold text-[#a3113a]">← Voltar</Link>
        </header>

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

          {patient && draft ? <section className="rounded-3xl border border-[#eee5e0] bg-white p-5 sm:p-7">
            <div className="flex flex-wrap justify-between gap-4">
              <div><h2 className="text-2xl font-bold text-[#86203b]">{patient.name}</h2><p className="mt-1 text-sm text-[#817578]">CPF {patient.cpf} · {patient.doctor}</p></div>
              <div className="flex items-center gap-2"><span className="rounded-full bg-[#edf8f3] px-3 py-2 text-xs font-semibold text-[#187157]">{statusOptions.find(([value]) => value === patient.status)?.[1] ?? "Em conversa"}</span><button type="button" onClick={() => { setDraft(patient); setEditing((current) => !current); }} className="rounded-xl border border-[#e5d9d4] px-4 py-2 text-xs font-bold text-[#a3113a]">{editing ? "Cancelar edição" : "Editar cadastro"}</button></div>
            </div>

            <nav className="mt-6 flex flex-wrap gap-2">{([["pessoais", "Dados pessoais"], ["tratamento", "Dados do tratamento"], ["financeiro", "Dados financeiros"]] as [Tab, string][]).map(([id, label]) => <button key={id} type="button" onClick={() => { setTab(id); setEditing(false); setDraft(patient); }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${tab === id ? "bg-[#a3113a] text-white" : "bg-[#f6efec] text-[#716569]"}`}>{label}</button>)}</nav>

            {tab === "pessoais" && <div className="mt-6">{editing ? <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo *"><input required value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} className={inputClass} /></Field>
              <Field label="CPF *"><input required value={draft.cpf} onChange={(event) => updateDraft("cpf", event.target.value)} className={inputClass} /></Field>
              <Field label="Data de nascimento *"><input type="date" required value={draft.birthDate} onChange={(event) => updateDraft("birthDate", event.target.value)} className={inputClass} /></Field>
              <Field label="Telefone / WhatsApp (opcional)"><input value={draft.phone ?? ""} onChange={(event) => updateDraft("phone", event.target.value)} className={inputClass} /></Field>
              <Field label="E-mail"><input type="email" value={draft.email ?? ""} onChange={(event) => updateDraft("email", event.target.value)} className={inputClass} /></Field>
              <Field label="Médico responsável"><input value={draft.doctor} onChange={(event) => updateDraft("doctor", event.target.value)} className={inputClass} /></Field>
              <Field label="CEP"><input value={draft.zipCode ?? ""} onChange={(event) => updateDraft("zipCode", event.target.value)} className={inputClass} /></Field>
              <Field label="Rua"><input value={draft.street ?? draft.address ?? ""} onChange={(event) => updateDraft("street", event.target.value)} className={inputClass} /></Field>
              <Field label="Número"><input value={draft.addressNumber ?? ""} onChange={(event) => updateDraft("addressNumber", event.target.value)} className={inputClass} /></Field>
              <Field label="Complemento"><input value={draft.addressComplement ?? ""} onChange={(event) => updateDraft("addressComplement", event.target.value)} className={inputClass} /></Field>
              <Field label="Bairro"><input value={draft.neighborhood ?? ""} onChange={(event) => updateDraft("neighborhood", event.target.value)} className={inputClass} /></Field>
              <Field label="Cidade"><input value={draft.city ?? ""} onChange={(event) => updateDraft("city", event.target.value)} className={inputClass} /></Field>
              <Field label="Estado"><input value={draft.state ?? ""} onChange={(event) => updateDraft("state", event.target.value)} maxLength={2} className={inputClass} /></Field>
              <Field label="Nome para nota fiscal"><input value={draft.billingName ?? ""} onChange={(event) => updateDraft("billingName", event.target.value)} className={inputClass} /></Field>
              <Field label="CPF para nota fiscal"><input value={draft.billingCpf ?? ""} onChange={(event) => updateDraft("billingCpf", event.target.value)} className={inputClass} /></Field>
              <Field label="Situação do cadastro"><select value={draft.registrationStatus} onChange={(event) => updateDraft("registrationStatus", event.target.value as DemoPatientRecord["registrationStatus"])} className={inputClass}><option value="pending-secretary">Pendente da secretaria</option><option value="completed">Completo</option></select></Field>
              <Field label="Observações de entrega" wide><textarea rows={3} value={draft.deliveryNotes ?? ""} onChange={(event) => updateDraft("deliveryNotes", event.target.value)} className={textareaClass} /></Field>
              <Field label="Observações da secretaria" wide><textarea rows={4} value={draft.notes ?? ""} onChange={(event) => updateDraft("notes", event.target.value)} className={textareaClass} /></Field>
              <div className="flex justify-end sm:col-span-2"><button type="button" onClick={() => saveDraft("Dados pessoais")} className={primaryButtonClass}>Salvar dados pessoais</button></div>
            </div> : <div className="grid gap-4 text-sm sm:grid-cols-2">{[
              ["Nascimento", formatDate(patient.birthDate)], ["Telefone", patient.phone || "Não informado"], ["E-mail", patient.email || "Não informado"], ["Médico responsável", patient.doctor], ["CEP", patient.zipCode || "Não informado"], ["Endereço", `${patient.street ?? patient.address ?? "Não informado"}, ${patient.addressNumber || "s/n"}`], ["Complemento", patient.addressComplement || "Não informado"], ["Bairro", patient.neighborhood || "Não informado"], ["Cidade/Estado", `${patient.city || "Não informada"}/${patient.state || "--"}`], ["Dados para nota fiscal", `${patient.billingName || patient.name} · ${patient.billingCpf || patient.cpf}`], ["Observações de entrega", patient.deliveryNotes || "Nenhuma"], ["Observações da secretaria", patient.notes || "Nenhuma"],
            ].map(([label, value]) => <DataCard key={label} label={label} value={value} />)}</div>}</div>}

            {tab === "tratamento" && <div className="mt-6 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Recebidos" value={String(patient.bottlesReceived ?? 0)} /><Metric label="Iniciados" value={String(portal?.bottles.length ?? 0)} /><Metric label="Concluídos" value={String(portal?.bottles.filter((item) => item.status === "finalizado").length ?? 0)} /><Metric label="Frasco atual" value={currentBottle ? String(currentBottle.number) : "Nenhum"} /><Metric label="Próximo contato" value={formatDate(nextContact)} /></div>
              {editing ? <div className="grid gap-4 rounded-2xl border border-[#eee5e0] p-5 sm:grid-cols-2">
                <Field label="Status do tratamento"><select value={draft.status ?? "em-conversa"} onChange={(event) => updateDraft("status", event.target.value as DemoPatientRecord["status"])} className={inputClass}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Tipo de tratamento"><input value={draft.treatment ?? ""} onChange={(event) => updateDraft("treatment", event.target.value)} className={inputClass} /></Field>
                <Field label="Fase"><select value={draft.phase ?? treatmentPhases[0]} onChange={(event) => updateDraft("phase", event.target.value)} className={inputClass}>{treatmentPhases.map((phase) => <option key={phase}>{phase}</option>)}</select></Field>
                <Field label="Posologia (gotas)"><input type="number" min={1} value={draft.drops ?? 0} onChange={(event) => updateDraft("drops", Number(event.target.value))} className={inputClass} /></Field>
                <Field label="Início do tratamento"><input type="date" value={draft.startDate ?? ""} onChange={(event) => updateDraft("startDate", event.target.value)} className={inputClass} /></Field>
                <Field label="Duração total (meses)"><input type="number" min={0} value={draft.totalMonths ?? 0} onChange={(event) => updateDraft("totalMonths", Number(event.target.value))} className={inputClass} /></Field>
                <Field label="Último recebimento"><input type="date" value={draft.lastReceivedDate ?? ""} onChange={(event) => updateDraft("lastReceivedDate", event.target.value)} className={inputClass} /></Field>
                <Field label="Total de frascos entregues"><input type="number" min={0} value={draft.bottlesReceived ?? 0} onChange={(event) => updateDraft("bottlesReceived", Number(event.target.value))} className={inputClass} /></Field>
                <Field label="Método de recebimento"><select value={draft.delivery ?? "Retirada"} onChange={(event) => updateDraft("delivery", event.target.value as DemoPatientRecord["delivery"])} className={inputClass}>{["Motoboy", "Retirada", "Sedex", "Aéreo"].map((value) => <option key={value}>{value}</option>)}</select></Field>
                {draft.status === "desistente" && <Field label="Motivo da desistência"><textarea rows={3} value={draft.abandonmentReason ?? ""} onChange={(event) => updateDraft("abandonmentReason", event.target.value)} className={textareaClass} /></Field>}
                <div className="flex justify-end sm:col-span-2"><button type="button" onClick={() => saveDraft("Dados do tratamento")} className={primaryButtonClass}>Salvar tratamento</button></div>
              </div> : <Info title="Tratamento atual">{patient.treatment || "Não informado"} · {patient.phase || "Fase não definida"} · {patient.drops ?? 0} gotas</Info>}
              <Info title="Observações dos médicos">{prescriptions.filter((item) => item.notes.trim()).map((item) => `${formatDate(item.createdAt)} · ${item.doctor}\n${item.notes}`).join("\n\n") || "Nenhuma observação médica registrada nas receitas."}</Info>
              <div className="rounded-2xl bg-[#fbf7f5] p-5"><h3 className="font-bold">Histórico completo de receitas e fórmulas ({prescriptions.length})</h3><div className="mt-4 space-y-3">{prescriptions.map((item) => <article key={item.id} className="rounded-xl border border-[#eadfd9] bg-white p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{formatDate(item.createdAt)} · {item.phase}</strong><span>{item.bottles} frasco(s)</span></div><p className="mt-2 text-[#66595d]">{item.formulas.map((formula) => `${formula.name} ${formula.percentage}%`).join(" · ")}</p><p className="mt-2 text-xs text-[#817578]">{item.posology} · {item.doctor} · CRM {item.doctorCrm}</p></article>)}{prescriptions.length === 0 && <p className="text-sm text-[#817578]">Nenhuma receita registrada.</p>}</div></div>
              <div className="rounded-2xl bg-[#fbf7f5] p-5"><h3 className="font-bold">Histórico das avaliações ({portal?.assessments.length ?? 0})</h3><div className="mt-4 space-y-3">{portal?.assessments.map((item) => <article key={item.id} className="rounded-xl border border-[#eadfd9] bg-white p-4 text-sm leading-6"><strong>Frasco {item.bottleNumber} · {formatDate(item.createdAt)}</strong><p>Frequência: {item.symptomFrequency ?? "Avaliação anterior"}</p><p>Severidade: {item.symptomSeverity ?? item.feeling ?? "Não informada"}</p><p>Uso de medicamentos: {item.medicationFrequency ?? "Não informado"}</p><p>Relato: {item.notes || "Sem comentário"}</p><p className="mt-2 text-xs text-[#817578]">{item.viewedAt ? `Conferida por ${item.viewedBy ?? "equipe"} em ${formatDate(item.viewedAt, true)}` : "Aguardando conferência da equipe"}</p>{item.response && <p className="mt-2 rounded-lg bg-[#edf8f3] px-3 py-2 text-[#187157]">Resposta: {item.response}</p>}</article>)}{!portal?.assessments.length && <p className="text-sm text-[#817578]">Nenhuma avaliação registrada.</p>}</div></div>
              <div className="rounded-2xl bg-[#fbf7f5] p-5"><h3 className="font-bold">Histórico por frasco</h3><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs uppercase text-[#817578]"><tr><th className="pb-3">Frasco</th><th className="pb-3">Recebimento</th><th className="pb-3">Início</th><th className="pb-3">Conclusão</th><th className="pb-3">Status</th></tr></thead><tbody>{bottleHistory.slice().reverse().map((item) => <tr key={item.number} className="border-t border-[#eadfd9]"><td className="py-3 font-bold">{item.number}</td><td>{formatDate(item.receivedAt)}</td><td>{formatDate(item.startedAt)}</td><td>{formatDate(item.finishedAt)}</td><td>{item.status === "finalizado" ? "Concluído" : item.status === "em-uso" ? "Em uso" : "Recebido"}</td></tr>)}</tbody></table>{bottleHistory.length === 0 && <p className="py-5 text-sm text-[#817578]">Nenhum frasco recebido.</p>}</div></div>
              <Info title={`Pedidos e entregas (${stock.length})`}>{stock.map((item) => `${item.batchCode} — ${item.bottles} frasco(s) — ${item.status} — recebido no estoque em ${formatDate(item.receivedAt)} — entregue em ${formatDate(item.deliveredAt)}`).join("\n") || "Nenhum pedido ou entrega registrado."}</Info>
            </div>}

            {tab === "financeiro" && <div className="mt-6 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Valor contratado" value={money(patient.contractValue ?? 0)} /><Metric label="Total pago" value={money(totalPaid)} /><Metric label="Saldo" value={money(remaining)} /><Metric label="Situação" value={patient.paymentStatus ?? "A definir"} /></div>
              <div className="rounded-2xl border border-[#eee5e0] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Condições financeiras — somente Secretaria</h3><p className="mt-1 text-xs text-[#817578]">O médico e o paciente não podem alterar estas informações.</p></div>{!editing && <button type="button" onClick={() => setEditing(true)} className="rounded-xl border border-[#e5d9d4] px-4 py-2 text-xs font-bold text-[#a3113a]">Editar financeiro</button>}</div>
                {editing ? <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Método de aquisição"><select value={draft.acquisitionMethod ?? "Por frasco"} onChange={(event) => updateDraft("acquisitionMethod", event.target.value as DemoPatientRecord["acquisitionMethod"])} className={inputClass}>{acquisitionOptions.map((value) => <option key={value}>{value}</option>)}</select></Field>
                  <Field label="Forma de pagamento"><select value={draft.paymentMethod ?? "A definir"} onChange={(event) => updateDraft("paymentMethod", event.target.value as DemoPatientRecord["paymentMethod"])} className={inputClass}>{paymentOptions.map((value) => <option key={value}>{value}</option>)}</select></Field>
                  <Field label="Valor contratado (R$)"><input type="number" min={0} step="0.01" value={draft.contractValue ?? 0} onChange={(event) => updateDraft("contractValue", Number(event.target.value))} className={inputClass} /></Field>
                  <Field label="Situação do pagamento"><select value={draft.paymentStatus ?? "A definir"} onChange={(event) => updateDraft("paymentStatus", event.target.value as DemoPatientRecord["paymentStatus"])} className={inputClass}>{paymentStatusOptions.map((value) => <option key={value}>{value}</option>)}</select></Field>
                  <Field label="Vencimento / próximo vencimento"><input type="date" value={draft.paymentDueDate ?? ""} onChange={(event) => updateDraft("paymentDueDate", event.target.value)} className={inputClass} /></Field>
                  <Field label="Número de parcelas"><input type="number" min={1} value={draft.paymentInstallments ?? 1} onChange={(event) => updateDraft("paymentInstallments", Math.max(1, Number(event.target.value)))} className={inputClass} /></Field>
                  <Field label="Referência do ASAAS"><input value={draft.asaasReference ?? ""} onChange={(event) => updateDraft("asaasReference", event.target.value)} placeholder="Cliente, assinatura ou cobrança" className={inputClass} /></Field>
                  <Field label="Observações financeiras" wide><textarea rows={3} value={draft.financialNotes ?? ""} onChange={(event) => updateDraft("financialNotes", event.target.value)} className={textareaClass} /></Field>
                  <div className="flex justify-end sm:col-span-2"><button type="button" onClick={() => saveDraft("Dados financeiros")} className={primaryButtonClass}>Salvar financeiro</button></div>
                </div> : <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3"><DataCard label="Método de aquisição" value={patient.acquisitionMethod ?? "Não definido"} /><DataCard label="Forma de pagamento" value={patient.paymentMethod ?? "Não definida"} /><DataCard label="Parcelas" value={patient.paymentInstallments ? `${patient.paymentInstallments}x` : "Não informado"} /><DataCard label="Vencimento" value={formatDate(patient.paymentDueDate)} /><DataCard label="Referência ASAAS" value={patient.asaasReference || "Não informada"} /><DataCard label="Observações" value={patient.financialNotes || "Nenhuma"} /></div>}
              </div>
              <div className="rounded-2xl border border-[#eee5e0] p-5"><h3 className="font-bold">Registrar valor pago</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Valor pago (R$)"><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" className={inputClass} /></Field><Field label="Data do pagamento"><input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} className={inputClass} /></Field><Field label="Parcela atual"><input type="number" min={1} value={installmentNumber} onChange={(event) => setInstallmentNumber(Math.max(1, Number(event.target.value)))} className={inputClass} /></Field><Field label="Referência ASAAS"><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className={inputClass} /></Field><Field label="Observação" wide><input value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} placeholder="Ex.: pagamento do 2º frasco" className={inputClass} /></Field></div><button type="button" onClick={addPayment} className="mt-4 rounded-xl bg-[#187157] px-5 py-3 text-sm font-semibold text-white">Registrar pagamento</button></div>
              <div className="rounded-2xl bg-[#fbf7f5] p-5"><h3 className="font-bold">Histórico de pagamentos ({patient.payments?.length ?? 0})</h3><div className="mt-4 space-y-3">{patient.payments?.map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-[#eadfd9] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong>{money(item.amount)}</strong><p className="mt-1 text-xs text-[#817578]">{formatDate(item.paidAt)} · {item.method}{item.installments ? ` · ${item.installmentNumber ?? 1}/${item.installments}` : ""}{item.asaasReference ? ` · ASAAS ${item.asaasReference}` : ""}</p>{item.notes && <p className="mt-2 text-sm text-[#66595d]">{item.notes}</p>}</div><button type="button" onClick={() => removePayment(item.id)} className="self-start rounded-lg bg-[#fff1f3] px-3 py-2 text-xs font-semibold text-[#a3113a]">Remover</button></article>)}{!patient.payments?.length && <p className="text-sm text-[#817578]">Nenhum pagamento registrado.</p>}</div></div>
              <div className="rounded-2xl bg-[#fbf7f5] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Notas fiscais ({invoices.length})</h3><p className="mt-1 text-xs text-[#817578]">Documentos vinculados automaticamente ao CPF.</p></div><Link href="/secretaria/notas-fiscais" className="rounded-xl border border-[#e5d9d4] px-4 py-2 text-xs font-bold text-[#a3113a]">Gerenciar notas</Link></div><div className="mt-4 space-y-3">{invoices.map((invoice) => <article key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eadfd9] bg-white p-4"><div><strong className="text-sm">{invoice.fileName}</strong><p className="mt-1 text-xs text-[#817578]">Enviada em {formatDate(invoice.uploadedAt, true)}</p></div><button type="button" onClick={() => { if (!openDemoInvoicePdf(invoice)) setMessage("Permita a abertura de janelas para visualizar o PDF."); }} className="rounded-lg bg-[#a3113a] px-3 py-2 text-xs font-semibold text-white">Abrir PDF</button></article>)}{invoices.length === 0 && <p className="text-sm text-[#817578]">Nenhuma nota fiscal vinculada.</p>}</div></div>
            </div>}
          </section> : <section className="rounded-3xl border border-[#eee5e0] bg-white p-12 text-center text-sm text-[#817578]">Selecione um paciente para abrir o cadastro completo.</section>}
        </div>
      </div>
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
  return <div className="rounded-2xl bg-[#fbf7f5] p-5"><p className="text-xs text-[#817578]">{label}</p><p className="mt-2 text-xl font-bold text-[#a3113a]">{value}</p></div>;
}
