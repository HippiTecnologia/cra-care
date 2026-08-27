"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  DemoInvoice,
  DemoPatientRecord,
  PatientPaymentRecord,
  demoMedicalPatients,
  openDemoInvoicePdf,
  readDemoInvoices,
  readDemoPatients,
  subscribeDemoPatients,
} from "../medico/patient-store";
import {
  AdminAuditEntry,
  AdminDoctor,
  AdminFixedCost,
  AdminSaleSnapshot,
  AdminTreatmentMethod,
  readAdminAudit,
  readAdminCosts,
  readAdminDoctors,
  readAdminMethods,
  saveAdminCost,
  saveAdminDoctor,
  saveAdminMethod,
  subscribeAdminStore,
  synchronizeAdminSales,
  treatmentMethodTotal,
} from "./admin-store";

type Section = "dashboard" | "relatorios" | "financeiro" | "custos" | "medicos" | "comissoes" | "parcelas" | "metodos" | "auditoria";
type ReportType = "Vendas" | "Recebimentos" | "Parcelas" | "Notas fiscais" | "Comissões" | "Custos" | "Vendas por médico" | "Conversões" | "Desistências";
type ReportRow = Record<string, string | number>;

type InstallmentView = {
  id: string;
  sale: AdminSaleSnapshot;
  number: number;
  scheduledValue: number;
  dueAt: string;
  payment?: PatientPaymentRecord;
  receivedValue: number;
  commissionValue: number;
  status: "Recebida" | "Pendente" | "Vencida" | "Cancelada";
  invoice?: DemoInvoice;
};

const sections: Array<{ id: Section; icon: string; label: string }> = [
  { id: "dashboard", icon: "▦", label: "Dashboard" },
  { id: "relatorios", icon: "▤", label: "Relatórios" },
  { id: "financeiro", icon: "R$", label: "Financeiro mensal" },
  { id: "custos", icon: "∑", label: "Custos fixos" },
  { id: "medicos", icon: "✚", label: "Médicos" },
  { id: "comissoes", icon: "%", label: "Comissões" },
  { id: "parcelas", icon: "≡", label: "Parcelas e notas" },
  { id: "metodos", icon: "⚙", label: "Métodos e valores" },
  { id: "auditoria", icon: "⌕", label: "Histórico e segurança" },
];

const reportTypes: ReportType[] = ["Vendas", "Recebimentos", "Parcelas", "Notas fiscais", "Comissões", "Custos", "Vendas por médico", "Conversões", "Desistências"];

const blankCost = (): AdminFixedCost => ({ id: "", description: "", category: "Produção", amount: 0, active: true, updatedAt: "" });
const blankMethod = (): AdminTreatmentMethod => ({ id: "", name: "", category: "Método", value: 0, cashValue: undefined, paymentMethod: "Asaas", maxInstallments: 1, billingPeriodMonths: 1, discountType: "valor", discountValue: 0, active: true, version: 1, updatedAt: "" });

function mergePatients() {
  const saved = readDemoPatients();
  const savedIds = new Set(saved.map((patient) => patient.id));
  return [...saved, ...demoMedicalPatients.filter((patient) => !savedIds.has(patient.id))];
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value?: string, includeTime = false) {
  if (!value) return "—";
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: includeTime && value.includes("T") ? "short" : undefined }).format(parsed);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function addMonths(value: string, months: number) {
  const base = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  const originalDay = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() + months);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(originalDay, lastDay));
  return base.toISOString().slice(0, 10);
}

function createInstallments(sales: AdminSaleSnapshot[], patients: DemoPatientRecord[], invoices: DemoInvoice[]): InstallmentView[] {
  const today = new Date().toISOString().slice(0, 10);
  return sales.flatMap((sale) => {
    const count = Math.max(1, sale.installments);
    const totalCents = Math.round(sale.contractedValue * 100);
    const baseCents = Math.floor(totalCents / count);
    const remainder = totalCents - baseCents * count;
    const patient = patients.find((item) => item.id === sale.patientId);
    const payments = [...(patient?.payments ?? [])].sort((first, second) => new Date(first.paidAt).getTime() - new Date(second.paidAt).getTime());
    const withoutNumber = payments.filter((payment) => !payment.installmentNumber);
    const patientInvoices = invoices.filter((invoice) => invoice.patientId === sale.patientId).sort((first, second) => new Date(first.uploadedAt).getTime() - new Date(second.uploadedAt).getTime());

    return Array.from({ length: count }, (_, index) => {
      const scheduledValue = (baseCents + (index < remainder ? 1 : 0)) / 100;
      const payment = payments.find((item) => item.installmentNumber === index + 1) ?? withoutNumber[index];
      const dueAt = addMonths(sale.contractedAt, index);
      const status: InstallmentView["status"] = sale.status === "cancelada" ? "Cancelada" : payment ? "Recebida" : dueAt < today ? "Vencida" : "Pendente";
      const receivedValue = payment?.amount ?? 0;
      return {
        id: `${sale.id}-${index + 1}`,
        sale,
        number: index + 1,
        scheduledValue,
        dueAt,
        payment,
        receivedValue,
        commissionValue: receivedValue * (sale.commissionRateSnapshot / 100),
        status,
        invoice: patientInvoices[index] ?? (payment ? patientInvoices.at(-1) : undefined),
      };
    });
  });
}

function downloadCsv(fileName: string, rows: ReportRow[]) {
  if (!rows.length) return false;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = `\uFEFF${headers.map(escape).join(";")}\n${rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [section, setSection] = useState<Section>("dashboard");
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [methods, setMethods] = useState<AdminTreatmentMethod[]>([]);
  const [costs, setCosts] = useState<AdminFixedCost[]>([]);
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [sales, setSales] = useState<AdminSaleSnapshot[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [invoices, setInvoices] = useState<DemoInvoice[]>([]);
  const [message, setMessage] = useState("");
  const [reportType, setReportType] = useState<ReportType>("Vendas");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("Todos");
  const [patientFilter, setPatientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [costDraft, setCostDraft] = useState<AdminFixedCost>(blankCost);
  const [methodDraft, setMethodDraft] = useState<AdminTreatmentMethod>(blankMethod);
  const [doctorRates, setDoctorRates] = useState<Record<string, number>>({});
  const methodFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.sessionStorage.getItem("cra-care-demo-admin-session")) {
      router.replace("/");
      return;
    }
    const synchronize = () => {
      const nextPatients = mergePatients();
      const nextMethods = readAdminMethods();
      const nextDoctors = readAdminDoctors();
      const nextSales = synchronizeAdminSales(nextPatients, nextMethods, nextDoctors);
      setPatients(nextPatients);
      setMethods(nextMethods);
      setCosts(readAdminCosts());
      setDoctors(nextDoctors);
      setDoctorRates((current) => Object.fromEntries(nextDoctors.map((doctor) => [doctor.id, current[doctor.id] ?? doctor.commissionRate])));
      setSales(nextSales);
      setAudit(readAdminAudit());
      setInvoices(readDemoInvoices());
    };
    queueMicrotask(() => {
      setAuthorized(true);
      synchronize();
    });
    const unsubscribeAdmin = subscribeAdminStore(synchronize);
    const unsubscribePatients = subscribeDemoPatients(synchronize);
    return () => { unsubscribeAdmin(); unsubscribePatients(); };
  }, [router]);

  const installments = useMemo(() => createInstallments(sales, patients, invoices), [invoices, patients, sales]);
  const activeSales = sales.filter((sale) => sale.status !== "cancelada");
  const received = installments.reduce((sum, installment) => sum + installment.receivedValue, 0);
  const pending = installments.filter((installment) => installment.status === "Pendente" || installment.status === "Vencida").reduce((sum, installment) => sum + installment.scheduledValue, 0);
  const billed = activeSales.reduce((sum, sale) => sum + sale.contractedValue, 0);
  const leads = Math.max(1, patients.length);
  const conversionRate = Math.round((activeSales.length / leads) * 100);
  const withdrawals = patients.filter((patient) => patient.status === "desistente" || patient.status === "perdido").length;
  const totalFixedCosts = costs.filter((cost) => cost.active).reduce((sum, cost) => sum + cost.amount, 0);

  const monthly = useMemo(() => {
    const map = new Map<string, { expected: number; received: number; pending: number; commissions: number }>();
    const get = (key: string) => map.get(key) ?? { expected: 0, received: 0, pending: 0, commissions: 0 };
    installments.forEach((installment) => {
      if (installment.status !== "Cancelada") {
        const dueMonth = monthKey(installment.dueAt);
        const due = get(dueMonth);
        due.expected += installment.scheduledValue;
        if (installment.status !== "Recebida") due.pending += installment.scheduledValue;
        map.set(dueMonth, due);
      }
      if (installment.payment) {
        const paidMonth = monthKey(installment.payment.paidAt);
        const paid = get(paidMonth);
        paid.received += installment.receivedValue;
        paid.commissions += installment.commissionValue;
        map.set(paidMonth, paid);
      }
    });
    return Array.from(map.entries()).map(([month, values]) => ({ month, ...values })).sort((a, b) => a.month.localeCompare(b.month));
  }, [installments]);

  const baseFilteredSales = sales.filter((sale) => {
    const matchesDoctor = doctorFilter === "Todos" || sale.doctor === doctorFilter;
    const normalizedPatient = patientFilter.toLowerCase().replace(/\D/g, "");
    const term = patientFilter.toLowerCase();
    const matchesPatient = !term || sale.patientName.toLowerCase().includes(term) || (normalizedPatient.length > 0 && sale.patientCpf.replace(/\D/g, "").includes(normalizedPatient));
    const matchesStatus = statusFilter === "Todos" || sale.status === statusFilter;
    return matchesDoctor && matchesPatient && matchesStatus;
  });
  const inReportPeriod = (value?: string) => {
    if (!value) return !periodStart && !periodEnd;
    const date = value.slice(0, 10);
    return (!periodStart || date >= periodStart) && (!periodEnd || date <= periodEnd);
  };
  const filteredSales = baseFilteredSales.filter((sale) => inReportPeriod(sale.contractedAt));
  const baseInstallments = installments.filter((installment) => baseFilteredSales.some((sale) => sale.id === installment.sale.id));
  const filteredInstallments = baseInstallments.filter((installment) => {
    if (reportType === "Recebimentos" || reportType === "Comissões") return inReportPeriod(installment.payment?.paidAt);
    return reportType === "Parcelas" ? inReportPeriod(installment.dueAt) : inReportPeriod(installment.sale.contractedAt);
  });
  const filteredInvoices = invoices.filter((invoice) => baseFilteredSales.some((sale) => sale.patientId === invoice.patientId) && inReportPeriod(invoice.uploadedAt));
  const filteredCosts = costs.filter((cost) => inReportPeriod(cost.updatedAt));
  const filteredPatients = patients.filter((patient) => {
    const matchesDoctor = doctorFilter === "Todos" || patient.doctor === doctorFilter;
    const term = patientFilter.toLowerCase();
    const cpfTerm = patientFilter.replace(/\D/g, "");
    const matchesPatient = !term || patient.name.toLowerCase().includes(term) || (cpfTerm.length > 0 && patient.cpf.replace(/\D/g, "").includes(cpfTerm));
    return matchesDoctor && matchesPatient && inReportPeriod(patient.createdAt);
  });
  const reportRows = buildReportRows(reportType, filteredSales, filteredInstallments, filteredPatients, filteredInvoices, filteredCosts);

  const doctorPerformance = doctors.map((doctor) => {
    const doctorSales = activeSales.filter((sale) => sale.doctor === doctor.name);
    const doctorInstallments = installments.filter((installment) => installment.sale.doctor === doctor.name);
    return {
      doctor,
      treatments: doctorSales.length,
      patients: new Set(doctorSales.map((sale) => sale.patientId)).size,
      sold: doctorSales.reduce((sum, sale) => sum + sale.contractedValue, 0),
      received: doctorInstallments.reduce((sum, item) => sum + item.receivedValue, 0),
      pending: doctorInstallments.filter((item) => item.status === "Pendente" || item.status === "Vencida").reduce((sum, item) => sum + item.scheduledValue, 0),
      commissions: doctorInstallments.reduce((sum, item) => sum + item.commissionValue, 0),
    };
  });

  function chooseSection(next: Section) {
    setSection(next);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitCost() {
    if (!costDraft.description.trim() || costDraft.amount < 0) {
      setMessage("Informe a descrição e um valor válido para o custo.");
      return;
    }
    saveAdminCost({ ...costDraft, id: costDraft.id || crypto.randomUUID(), description: costDraft.description.trim() });
    setCostDraft(blankCost());
    setMessage("Custo salvo. A alteração foi registrada no histórico do ADM.");
  }

  function submitMethod() {
    if (!methodDraft.name.trim() || methodDraft.value <= 0) {
      setMessage("Informe o nome e um valor válido para a modalidade.");
      return;
    }
    const total = treatmentMethodTotal(methodDraft);
    let cashValue = methodDraft.cashValue && methodDraft.cashValue > 0 ? methodDraft.cashValue : undefined;
    let discountValue = Math.max(0, methodDraft.discountValue);
    if (cashValue) {
      discountValue = methodDraft.discountType === "percentual"
        ? total > 0 ? ((total - cashValue) / total) * 100 : 0
        : Math.max(0, total - cashValue);
    } else if (discountValue > 0) {
      cashValue = methodDraft.discountType === "percentual"
        ? total * (1 - discountValue / 100)
        : total - discountValue;
    }
    saveAdminMethod({
      ...methodDraft,
      id: methodDraft.id || crypto.randomUUID(),
      name: methodDraft.name.trim(),
      cashValue,
      discountValue,
    });
    setMethodDraft(blankMethod());
    setMessage("Modalidade salva em uma nova versão. Vendas antigas permanecem inalteradas.");
  }

  function editMethod(methodRecord: AdminTreatmentMethod) {
    setMethodDraft({ ...methodRecord });
    setMessage(`Editando ${methodRecord.name}. Altere os campos e clique em Salvar modalidade.`);
    window.requestAnimationFrame(() => {
      methodFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function updateDoctorCommission(doctor: AdminDoctor) {
    const rate = doctorRates[doctor.id];
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setMessage("A comissão deve estar entre 0% e 100%.");
      return;
    }
    saveAdminDoctor({ ...doctor, commissionRate: rate });
    setMessage("Comissão atualizada. Parcelas já recebidas mantêm o percentual anterior.");
  }

  function openInvoice(invoice?: DemoInvoice) {
    if (!invoice || !openDemoInvoicePdf(invoice)) setMessage("Nota fiscal indisponível ou abertura de janelas bloqueada.");
  }

  const maxMonthly = Math.max(1, ...monthly.map((item) => Math.max(item.expected, item.received)));

  if (!authorized) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f6f3f0] text-sm font-semibold text-[#86203b]">Validando acesso administrativo…</main>;
  }

  return (
    <main className="min-h-screen bg-[#f6f3f0] text-[#34292d]">
      <div className="min-h-screen lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="bg-gradient-to-b from-[#701027] via-[#8f1033] to-[#520817] px-6 py-7 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          <Image src="/logo-cra-branca.png" alt="CRA" width={150} height={100} className="h-auto w-32" priority />
          <div className="mt-5 border-b border-white/15 pb-5"><p className="text-sm font-bold">Painel Administrativo</p><p className="mt-1 text-xs text-white/60">Gestão financeira e estratégica</p></div>
          <nav className="mt-6 space-y-1">{sections.map((item) => <button key={item.id} type="button" onClick={() => chooseSection(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${section === item.id ? "bg-white/16 font-bold text-white" : "text-white/75 hover:bg-white/10"}`}><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-xs font-bold">{item.icon}</span>{item.label}</button>)}</nav>
          <div className="mt-8 rounded-2xl border border-white/15 bg-white/8 p-4"><p className="text-xs font-bold">Acesso protegido</p><p className="mt-2 text-[11px] leading-5 text-white/65">Preços, custos e comissões são exclusivos do ADM e possuem histórico.</p></div>
          <Link href="/" onClick={() => window.sessionStorage.removeItem("cra-care-demo-admin-session")} className="mt-6 block rounded-xl px-3 py-3 text-sm font-semibold text-white/80 hover:bg-white/10">← Sair do painel</Link>
        </aside>

        <div className="min-w-0 p-4 sm:p-7 xl:p-9">
          <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#a3113a]">Gestão executiva</p><h1 className="mt-2 text-3xl font-bold">Olá, Administrador</h1><p className="mt-2 text-sm text-[#817578]">Acompanhe vendas, caixa, custos e desempenho da clínica.</p></div><div className="rounded-2xl border border-[#e8ddd8] bg-white px-4 py-3 shadow-sm"><p className="text-sm font-bold">ADM CRA</p><p className="text-xs text-[#817578]">Acesso total às configurações</p></div></header>
          {message && <div className="mt-5 flex items-center justify-between rounded-2xl border border-[#d7e9df] bg-[#edf8f3] px-4 py-3 text-sm font-semibold text-[#187157]"><span>{message}</span><button type="button" onClick={() => setMessage("")} aria-label="Fechar">×</button></div>}

          {section === "dashboard" && <div className="mt-7 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Total de vendas" value={String(activeSales.length)} detail={`${activeSales.length} tratamentos vendidos`} tone="wine" /><Kpi label="Faturamento" value={formatMoney(billed)} detail="Valor contratado" tone="wine" /><Kpi label="Valores recebidos" value={formatMoney(received)} detail="Pagamentos confirmados" tone="green" /><Kpi label="Valores pendentes" value={formatMoney(pending)} detail="Parcelas abertas ou vencidas" tone="gold" /><Kpi label="Taxa de conversão" value={`${conversionRate}%`} detail={`${activeSales.length} de ${patients.length} pacientes`} tone="blue" /><Kpi label="Desistências" value={String(withdrawals)} detail="Perdidos ou desistentes" tone="red" /><Kpi label="Tratamentos vendidos" value={String(activeSales.length)} detail="Vendas ativas e concluídas" tone="purple" /><Kpi label="Custos cadastrados" value={formatMoney(totalFixedCosts)} detail="Base atual por tratamento" tone="gray" /></div>
            <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]"><Panel title="Desempenho mensal" subtitle="Previsto e recebido por mês"><div className="mt-6 flex min-h-64 items-end gap-3 overflow-x-auto pb-3">{monthly.slice(-10).map((item) => <div key={item.month} className="flex min-w-16 flex-1 flex-col items-center"><div className="flex h-48 items-end gap-1"><div title={`Previsto ${formatMoney(item.expected)}`} className="w-5 rounded-t-md bg-[#e7cbd3]" style={{ height: `${Math.max(3, (item.expected / maxMonthly) * 100)}%` }} /><div title={`Recebido ${formatMoney(item.received)}`} className="w-5 rounded-t-md bg-[#a3113a]" style={{ height: `${Math.max(3, (item.received / maxMonthly) * 100)}%` }} /></div><p className="mt-2 text-center text-[10px] capitalize text-[#817578]">{monthLabel(item.month)}</p></div>)}</div><div className="mt-2 flex gap-4 text-xs text-[#817578]"><span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#e7cbd3]" />Previsto</span><span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#a3113a]" />Recebido</span></div></Panel>
              <Panel title="Conversões e desistências" subtitle="Leitura rápida do funil"><Progress label="Conversão em venda" value={conversionRate} color="bg-[#187157]" /><Progress label="Pacientes ativos" value={Math.round((patients.filter((patient) => patient.status === "ativo").length / leads) * 100)} color="bg-[#3f729b]" /><Progress label="Desistências e perdas" value={Math.round((withdrawals / leads) * 100)} color="bg-[#bd4b48]" /><div className="mt-7 rounded-2xl bg-[#fbf6f3] p-4"><p className="text-xs text-[#817578]">Resultado estimado após custos fixos</p><p className="mt-2 text-2xl font-bold text-[#187157]">{formatMoney(received - totalFixedCosts * activeSales.length)}</p></div></Panel></div>
            <Panel title="Vendas recentes" subtitle="Snapshots preservados no momento da contratação"><SalesTable sales={sales.slice().sort((a, b) => b.contractedAt.localeCompare(a.contractedAt)).slice(0, 8)} /></Panel>
          </div>}

          {section === "relatorios" && <div className="mt-7 space-y-5"><Panel title="Central de relatórios" subtitle="Filtre, visualize e baixe os dados em CSV"><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Select label="Relatório" value={reportType} onChange={(value) => setReportType(value as ReportType)} options={reportTypes} /><Input label="Início" type="date" value={periodStart} onChange={setPeriodStart} /><Input label="Fim" type="date" value={periodEnd} onChange={setPeriodEnd} /><Select label="Médico" value={doctorFilter} onChange={setDoctorFilter} options={["Todos", ...doctors.map((doctor) => doctor.name)]} /><Select label="Status" value={statusFilter} onChange={setStatusFilter} options={["Todos", "ativa", "concluida", "cancelada"]} /><div className="sm:col-span-2 xl:col-span-4"><Input label="Paciente" value={patientFilter} onChange={setPatientFilter} placeholder="Nome ou CPF" /></div><button type="button" onClick={() => { if (!downloadCsv(`cra-care-${reportType.toLowerCase().replace(/\s/g, "-")}.csv`, reportRows)) setMessage("Nenhum dado encontrado para baixar."); }} className="self-end rounded-xl bg-[#a3113a] px-4 py-3 text-sm font-bold text-white">↓ Baixar relatório</button></div></Panel><Panel title={`Visualização — ${reportType}`} subtitle={`${reportRows.length} registro(s)`}><ReportPreview rows={reportRows} /></Panel></div>}

          {section === "financeiro" && <div className="mt-7 space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Kpi label="Previsto" value={formatMoney(monthly.reduce((sum, item) => sum + item.expected, 0))} detail="Parcelas distribuídas por competência" tone="wine" /><Kpi label="Recebido" value={formatMoney(received)} detail="Por data efetiva de pagamento" tone="green" /><Kpi label="Pendente" value={formatMoney(pending)} detail="A receber" tone="gold" /></div><Panel title="Controle financeiro mensal" subtitle="Vendas parceladas são distribuídas automaticamente nos meses de vencimento"><div className="mt-5 overflow-x-auto"><table className={tableClass}><thead><tr><Th>Mês</Th><Th>Previsto</Th><Th>Recebido</Th><Th>Pendente</Th><Th>Comissões</Th><Th>Resultado após comissão</Th></tr></thead><tbody>{monthly.map((item) => <tr key={item.month}><Td strong>{monthLabel(item.month)}</Td><Td>{formatMoney(item.expected)}</Td><Td tone="green">{formatMoney(item.received)}</Td><Td tone="gold">{formatMoney(item.pending)}</Td><Td>{formatMoney(item.commissions)}</Td><Td strong>{formatMoney(item.received - item.commissions)}</Td></tr>)}</tbody></table></div></Panel></div>}

          {section === "custos" && <div className="mt-7 space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Kpi label="Custo-base ativo" value={formatMoney(totalFixedCosts)} detail="Soma por tratamento" tone="wine" /><Kpi label="Itens ativos" value={String(costs.filter((cost) => cost.active).length)} detail="Custos na calculadora" tone="green" /><Kpi label="Margem estimada" value={activeSales.length ? formatMoney(billed - totalFixedCosts * activeSales.length) : formatMoney(0)} detail="Antes de comissões e impostos" tone="blue" /></div><Panel title={costDraft.id ? "Editar custo" : "Cadastrar custo fixo"} subtitle="Somente o ADM pode alterar estes valores"><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Input label="Descrição" value={costDraft.description} onChange={(value) => setCostDraft((current) => ({ ...current, description: value }))} /><Input label="Categoria" value={costDraft.category} onChange={(value) => setCostDraft((current) => ({ ...current, category: value }))} /><Input label="Valor (R$)" type="number" value={String(costDraft.amount)} onChange={(value) => setCostDraft((current) => ({ ...current, amount: Number(value) }))} /><Select label="Situação" value={costDraft.active ? "Ativo" : "Inativo"} onChange={(value) => setCostDraft((current) => ({ ...current, active: value === "Ativo" }))} options={["Ativo", "Inativo"]} /><div className="flex gap-2 xl:col-span-4"><button type="button" onClick={submitCost} className="rounded-xl bg-[#a3113a] px-5 py-3 text-sm font-bold text-white">Salvar custo</button>{costDraft.id && <button type="button" onClick={() => setCostDraft(blankCost())} className="rounded-xl border border-[#e5d9d4] px-5 py-3 text-sm font-bold text-[#716569]">Cancelar</button>}</div></div></Panel><Panel title="Custos cadastrados" subtitle="Base da calculadora interna"><div className="mt-4 grid gap-3 lg:grid-cols-2">{costs.map((cost) => <article key={cost.id} className="flex items-center justify-between gap-4 rounded-2xl bg-[#fbf7f5] p-4"><div><p className="font-bold">{cost.description}</p><p className="mt-1 text-xs text-[#817578]">{cost.category} · atualizado em {formatDate(cost.updatedAt, true)}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${cost.active ? "bg-[#edf8f3] text-[#187157]" : "bg-[#eee9e7] text-[#716569]"}`}>{cost.active ? "Ativo" : "Inativo"}</span></div><div className="text-right"><p className="font-bold text-[#a3113a]">{formatMoney(cost.amount)}</p><button type="button" onClick={() => setCostDraft(cost)} className="mt-2 text-xs font-bold text-[#a3113a]">Editar</button></div></article>)}</div></Panel></div>}

          {section === "medicos" && <div className="mt-7 space-y-5"><Panel title="Cadastro e desempenho por médico" subtitle="A comissão definida aqui só vale para novas vendas"><div className="mt-5 grid gap-4 xl:grid-cols-2">{doctorPerformance.map((item) => <article key={item.doctor.id} className="rounded-2xl border border-[#eee5e0] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{item.doctor.name}</h3><p className="mt-1 text-xs text-[#817578]">{item.doctor.crm ? `CRM ${item.doctor.crm}` : "CRM a cadastrar"} · {item.patients} paciente(s)</p></div><div className="flex items-end gap-2"><Input compact label="Comissão (%)" type="number" value={String(doctorRates[item.doctor.id] ?? item.doctor.commissionRate)} onChange={(value) => setDoctorRates((current) => ({ ...current, [item.doctor.id]: Number(value) }))} /><button type="button" onClick={() => updateDoctorCommission(item.doctor)} className="h-10 rounded-xl bg-[#a3113a] px-3 text-xs font-bold text-white">Salvar</button></div></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><Mini label="Tratamentos" value={String(item.treatments)} /><Mini label="Total vendido" value={formatMoney(item.sold)} /><Mini label="Recebido" value={formatMoney(item.received)} /><Mini label="Pendente" value={formatMoney(item.pending)} /><Mini label="Comissões" value={formatMoney(item.commissions)} /><Mini label="Percentual atual" value={`${item.doctor.commissionRate}%`} /></div><div className="mt-4"><p className="text-xs font-bold text-[#817578]">Comparativo por mês</p><div className="mt-2 flex gap-2 overflow-x-auto">{monthly.slice(-6).map((month) => { const amount = installments.filter((installment) => installment.sale.doctor === item.doctor.name && installment.payment && monthKey(installment.payment.paidAt) === month.month).reduce((sum, installment) => sum + installment.receivedValue, 0); return <div key={month.month} className="min-w-24 rounded-xl bg-[#fbf7f5] p-3"><p className="text-[10px] capitalize text-[#817578]">{monthLabel(month.month)}</p><p className="mt-1 text-xs font-bold">{formatMoney(amount)}</p></div>; })}</div></div></article>)}</div></Panel></div>}

          {section === "comissoes" && <div className="mt-7 space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Kpi label="Comissões geradas" value={formatMoney(installments.reduce((sum, item) => sum + item.commissionValue, 0))} detail="Somente parcelas recebidas" tone="wine" /><Kpi label="Parcelas com comissão" value={String(installments.filter((item) => item.receivedValue > 0).length)} detail="Recebimentos efetivos" tone="green" /><Kpi label="Base recebida" value={formatMoney(received)} detail="Valor usado no cálculo" tone="blue" /></div><Panel title="Comissão por parcela recebida" subtitle="O percentual histórico fica congelado na venda"><InstallmentTable installments={installments.filter((item) => item.status === "Recebida")} showCommission openInvoice={openInvoice} /></Panel></div>}

          {section === "parcelas" && <div className="mt-7 space-y-5"><Panel title="Venda → Parcela → Recebimento → Comissão → Nota fiscal" subtitle="Rastreabilidade financeira completa"><InstallmentTable installments={installments} showCommission openInvoice={openInvoice} /></Panel></div>}

          {section === "metodos" && <div ref={methodFormRef} className="mt-7 space-y-5 scroll-mt-6"><Panel title={methodDraft.id ? `Editar ${methodDraft.name}` : "Criar modalidade"} subtitle="Uma alteração cria nova versão e não modifica vendas anteriores"><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Input label="Nome da modalidade" value={methodDraft.name} onChange={(value) => setMethodDraft((current) => ({ ...current, name: value }))} /><Select label="Categoria" value={methodDraft.category} onChange={(value) => setMethodDraft((current) => ({ ...current, category: value as AdminTreatmentMethod["category"] }))} options={["Método", "Recorrente", "Plano de 6 meses", "Por frasco"]} /><Input label={methodDraft.category === "Recorrente" ? "Valor mensal (R$)" : "Valor normal (R$)"} type="number" value={String(methodDraft.value)} onChange={(value) => setMethodDraft((current) => ({ ...current, value: Number(value) }))} /><Input label="Valor à vista (R$)" type="number" value={methodDraft.cashValue ? String(methodDraft.cashValue) : ""} onChange={(value) => setMethodDraft((current) => ({ ...current, cashValue: value ? Number(value) : undefined }))} /><Select label="Tipo de desconto" value={methodDraft.discountType} onChange={(value) => setMethodDraft((current) => ({ ...current, discountType: value as AdminTreatmentMethod["discountType"] }))} options={["valor", "percentual"]} /><Input label={methodDraft.discountType === "percentual" ? "Desconto (%)" : "Desconto (R$)"} type="number" value={String(methodDraft.discountValue)} onChange={(value) => setMethodDraft((current) => ({ ...current, discountValue: Math.max(0, Number(value)) }))} /><Input label="Forma de pagamento" value={methodDraft.paymentMethod} onChange={(value) => setMethodDraft((current) => ({ ...current, paymentMethod: value }))} /><Input label="Quantidade de parcelas" type="number" value={String(methodDraft.maxInstallments)} onChange={(value) => setMethodDraft((current) => ({ ...current, maxInstallments: Math.max(1, Number(value)) }))} /><Input label="Período de cobrança (meses)" type="number" value={String(methodDraft.billingPeriodMonths)} onChange={(value) => setMethodDraft((current) => ({ ...current, billingPeriodMonths: Math.max(1, Number(value)) }))} /><Select label="Situação" value={methodDraft.active ? "Ativa" : "Inativa"} onChange={(value) => setMethodDraft((current) => ({ ...current, active: value === "Ativa" }))} options={["Ativa", "Inativa"]} /><div className="flex flex-wrap gap-2 xl:col-span-4"><button type="button" onClick={submitMethod} className="rounded-xl bg-[#a3113a] px-5 py-3 text-sm font-bold text-white">{methodDraft.id ? "Salvar alterações" : "Salvar modalidade"}</button>{methodDraft.id && <button type="button" onClick={() => { setMethodDraft(blankMethod()); setMessage("Edição cancelada."); }} className="rounded-xl border border-[#e5d9d4] px-5 py-3 text-sm font-bold text-[#716569]">Cancelar edição</button>}</div></div></Panel><Panel title="Métodos, valores e descontos" subtitle="Condições disponíveis para novas vendas"><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{methods.map((method) => { const total = treatmentMethodTotal(method); return <article key={method.id} className={`rounded-2xl border p-5 ${method.active ? "border-[#eadfd9] bg-white" : "border-[#e5dfdc] bg-[#f4f1ef] opacity-70"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#a3113a]">{method.category}</p><h3 className="mt-2 text-lg font-bold">{method.name}</h3></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${method.active ? "bg-[#edf8f3] text-[#187157]" : "bg-[#e8e3e1] text-[#716569]"}`}>{method.active ? "Ativa" : "Inativa"}</span></div><p className="mt-5 text-2xl font-bold text-[#a3113a]">{method.category === "Recorrente" ? `${formatMoney(method.value)}/mês` : formatMoney(method.value)}</p>{method.category === "Recorrente" && <p className="mt-1 text-xs text-[#817578]">Total do período: {formatMoney(total)}</p>}<div className="mt-4 space-y-2 text-xs text-[#66595d]"><p><strong>Pagamento:</strong> {method.paymentMethod}</p><p><strong>Parcelas:</strong> até {method.maxInstallments}x</p><p><strong>Período:</strong> {method.billingPeriodMonths} mês(es)</p><p><strong>À vista:</strong> {method.cashValue ? `${formatMoney(method.cashValue)} · desconto ${method.discountType === "percentual" ? `${method.discountValue.toFixed(2)}%` : formatMoney(method.discountValue)}` : "Sem condição especial"}</p><p><strong>Versão:</strong> {method.version}</p></div><button type="button" onClick={() => editMethod(method)} className="mt-5 rounded-xl border border-[#e5d9d4] px-4 py-2 text-xs font-bold text-[#a3113a]">Editar modalidade</button></article>; })}</div></Panel></div>}

          {section === "auditoria" && <div className="mt-7 space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Kpi label="Alterações registradas" value={String(audit.length)} detail="Valores, custos e comissões" tone="wine" /><Kpi label="Vendas preservadas" value={String(sales.length)} detail="Snapshots financeiros" tone="green" /><Kpi label="Modalidades versionadas" value={String(methods.length)} detail="Histórico independente" tone="blue" /></div><Panel title="Histórico de configurações" subtitle="Registro de quem alterou, quando e o que foi modificado"><div className="mt-5 space-y-3">{audit.map((entry) => <article key={entry.id} className="flex flex-col gap-2 rounded-2xl bg-[#fbf7f5] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">{entry.action} · {entry.entity}</p><p className="mt-1 text-xs text-[#66595d]">{entry.summary}</p></div><p className="text-xs text-[#817578]">{entry.createdBy}<br />{formatDate(entry.createdAt, true)}</p></article>)}{audit.length === 0 && <p className="py-8 text-center text-sm text-[#817578]">As próximas alterações aparecerão aqui.</p>}</div></Panel><Panel title="Regra de preservação histórica" subtitle="Aplicada a todas as vendas"><div className="mt-4 rounded-2xl border border-[#d7e9df] bg-[#edf8f3] p-5 text-sm leading-7 text-[#187157]">Cada venda guarda: paciente, tratamento, versão do método, valor contratado, desconto, condição escolhida, forma de pagamento, parcelas e percentual de comissão. Mudanças futuras feitas pelo ADM afetam somente novas vendas.</div></Panel></div>}
        </div>
      </div>
    </main>
  );
}

function buildReportRows(type: ReportType, sales: AdminSaleSnapshot[], installments: InstallmentView[], patients: DemoPatientRecord[], invoices: DemoInvoice[], costs: AdminFixedCost[]): ReportRow[] {
  if (type === "Vendas") return sales.map((sale) => ({ Paciente: sale.patientName, CPF: sale.patientCpf, Médico: sale.doctor, Tratamento: sale.treatment, Método: sale.methodName, Data: formatDate(sale.contractedAt), "Valor contratado": formatMoney(sale.contractedValue), Desconto: formatMoney(sale.discountAmount), Condição: sale.condition, Parcelas: sale.installments, Status: sale.status }));
  if (type === "Recebimentos") return installments.filter((item) => item.payment).map((item) => ({ Paciente: item.sale.patientName, Médico: item.sale.doctor, Parcela: `${item.number}/${item.sale.installments}`, Recebido: formatMoney(item.receivedValue), "Data de pagamento": formatDate(item.payment?.paidAt), Forma: item.payment?.method ?? item.sale.paymentMethod, Status: item.status }));
  if (type === "Parcelas") return installments.map((item) => ({ Paciente: item.sale.patientName, Médico: item.sale.doctor, Parcela: `${item.number}/${item.sale.installments}`, Valor: formatMoney(item.scheduledValue), Vencimento: formatDate(item.dueAt), Pagamento: formatDate(item.payment?.paidAt), Status: item.status }));
  if (type === "Notas fiscais") return invoices.filter((invoice) => sales.some((sale) => sale.patientId === invoice.patientId)).map((invoice) => ({ Paciente: invoice.patientName, CPF: invoice.patientCpf, Arquivo: invoice.fileName, Envio: formatDate(invoice.uploadedAt, true), Responsável: invoice.uploadedBy }));
  if (type === "Comissões") return installments.filter((item) => item.payment).map((item) => ({ Médico: item.sale.doctor, Paciente: item.sale.patientName, Parcela: `${item.number}/${item.sale.installments}`, "Valor da parcela": formatMoney(item.receivedValue), Percentual: `${item.sale.commissionRateSnapshot}%`, Comissão: formatMoney(item.commissionValue), Recebimento: formatDate(item.payment?.paidAt), "Nota fiscal": item.invoice?.fileName ?? "Não vinculada" }));
  if (type === "Custos") return costs.map((cost) => ({ Descrição: cost.description, Categoria: cost.category, Valor: formatMoney(cost.amount), Atualização: formatDate(cost.updatedAt, true), Situação: cost.active ? "Ativo" : "Inativo" }));
  if (type === "Vendas por médico") return Array.from(new Set(sales.map((sale) => sale.doctor))).map((doctor) => { const doctorSales = sales.filter((sale) => sale.doctor === doctor); const doctorInstallments = installments.filter((item) => item.sale.doctor === doctor); return { Médico: doctor, Tratamentos: doctorSales.length, Pacientes: new Set(doctorSales.map((sale) => sale.patientId)).size, Vendido: formatMoney(doctorSales.reduce((sum, sale) => sum + sale.contractedValue, 0)), Recebido: formatMoney(doctorInstallments.reduce((sum, item) => sum + item.receivedValue, 0)), Pendente: formatMoney(doctorInstallments.filter((item) => item.status !== "Recebida" && item.status !== "Cancelada").reduce((sum, item) => sum + item.scheduledValue, 0)), Comissões: formatMoney(doctorInstallments.reduce((sum, item) => sum + item.commissionValue, 0)) }; });
  if (type === "Conversões") return patients.map((patient) => ({ Paciente: patient.name, CPF: patient.cpf, Médico: patient.doctor, Status: patient.status ?? "em-conversa", Convertido: sales.some((sale) => sale.patientId === patient.id && sale.status !== "cancelada") ? "Sim" : "Não" }));
  return patients.filter((patient) => patient.status === "desistente" || patient.status === "perdido").map((patient) => ({ Paciente: patient.name, CPF: patient.cpf, Médico: patient.doctor, Tratamento: patient.treatment ?? "Não informado", Status: patient.status ?? "Não informado", Data: formatDate(patient.createdAt), Motivo: patient.abandonmentReason ?? "Não informado" }));
}

const tableClass = "w-full min-w-[760px] text-left text-sm";
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) { return <section className="rounded-3xl border border-[#ebe2de] bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-bold">{title}</h2>{subtitle && <p className="mt-1 text-xs text-[#817578]">{subtitle}</p>}{children}</section>; }
function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "wine" | "green" | "gold" | "blue" | "red" | "purple" | "gray" }) { const colors = { wine: "text-[#a3113a]", green: "text-[#187157]", gold: "text-[#966419]", blue: "text-[#3f729b]", red: "text-[#bd4b48]", purple: "text-[#6a54a3]", gray: "text-[#62585b]" }; return <article className="rounded-2xl border border-[#ebe2de] bg-white p-5 shadow-sm"><p className="text-xs font-semibold text-[#817578]">{label}</p><p className={`mt-3 text-2xl font-bold ${colors[tone]}`}>{value}</p><p className="mt-2 text-[11px] text-[#978c8f]">{detail}</p></article>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#fbf7f5] p-3"><p className="text-[10px] text-[#817578]">{label}</p><p className="mt-1 text-sm font-bold text-[#86203b]">{value}</p></div>; }
function Progress({ label, value, color }: { label: string; value: number; color: string }) { return <div className="mt-6"><div className="flex justify-between text-xs"><span>{label}</span><strong>{value}%</strong></div><div className="mt-2 h-2 rounded-full bg-[#eee8e5]"><div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} /></div></div>; }
function Input({ label, value, onChange, type = "text", placeholder, compact = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; compact?: boolean }) { return <label className="block text-xs font-semibold text-[#66595d]">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${compact ? "h-10 w-24" : "mt-2 h-11 w-full"} rounded-xl border border-[#e6ddd9] bg-white px-3 outline-none focus:border-[#a3113a]`} /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label className="block text-xs font-semibold text-[#66595d]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#e6ddd9] bg-white px-3 outline-none focus:border-[#a3113a]">{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function Th({ children }: { children: ReactNode }) { return <th className="border-b border-[#e8dfdb] px-3 py-3 text-xs font-bold uppercase tracking-wide text-[#817578]">{children}</th>; }
function Td({ children, strong = false, tone }: { children: ReactNode; strong?: boolean; tone?: "green" | "gold" }) { return <td className={`border-b border-[#eee7e3] px-3 py-3 ${strong ? "font-bold" : ""} ${tone === "green" ? "text-[#187157]" : tone === "gold" ? "text-[#966419]" : ""}`}>{children}</td>; }
function SalesTable({ sales }: { sales: AdminSaleSnapshot[] }) { return <div className="mt-4 overflow-x-auto"><table className={tableClass}><thead><tr><Th>Paciente</Th><Th>Médico</Th><Th>Método</Th><Th>Valor</Th><Th>Condição</Th><Th>Status</Th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><Td strong>{sale.patientName}</Td><Td>{sale.doctor}</Td><Td>{sale.methodName} · v{sale.methodVersion}</Td><Td strong>{formatMoney(sale.contractedValue)}</Td><Td>{sale.condition} · {sale.installments}x</Td><Td>{sale.status}</Td></tr>)}</tbody></table>{sales.length === 0 && <p className="py-8 text-center text-sm text-[#817578]">Nenhuma venda sincronizada.</p>}</div>; }
function ReportPreview({ rows }: { rows: ReportRow[] }) { const headers = rows.length ? Object.keys(rows[0]) : []; return <div className="mt-4 max-h-[560px] overflow-auto"><table className={tableClass}><thead className="sticky top-0 bg-white"><tr>{headers.map((header) => <Th key={header}>{header}</Th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map((header) => <Td key={header}>{row[header]}</Td>)}</tr>)}</tbody></table>{rows.length === 0 && <p className="py-10 text-center text-sm text-[#817578]">Nenhum registro para os filtros selecionados.</p>}</div>; }
function InstallmentTable({ installments, showCommission, openInvoice }: { installments: InstallmentView[]; showCommission?: boolean; openInvoice: (invoice?: DemoInvoice) => void }) { return <div className="mt-4 max-h-[680px] overflow-auto"><table className="w-full min-w-[1320px] text-left text-sm"><thead className="sticky top-0 bg-white"><tr><Th>Paciente</Th><Th>Médico</Th><Th>Tratamento</Th><Th>Venda</Th><Th>Parcela</Th><Th>Valor</Th><Th>Vencimento</Th><Th>Pagamento</Th>{showCommission && <><Th>% comissão</Th><Th>Comissão</Th></>}<Th>Status</Th><Th>Nota fiscal</Th></tr></thead><tbody>{installments.map((item) => <tr key={item.id}><Td strong>{item.sale.patientName}</Td><Td>{item.sale.doctor}</Td><Td>{item.sale.treatment}</Td><Td>{formatMoney(item.sale.contractedValue)}</Td><Td>{item.number}/{item.sale.installments}</Td><Td strong>{formatMoney(item.scheduledValue)}</Td><Td>{formatDate(item.dueAt)}</Td><Td>{formatDate(item.payment?.paidAt)}</Td>{showCommission && <><Td>{item.sale.commissionRateSnapshot}%</Td><Td>{formatMoney(item.commissionValue)}</Td></>}<Td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.status === "Recebida" ? "bg-[#edf8f3] text-[#187157]" : item.status === "Vencida" ? "bg-[#fff0ef] text-[#b54843]" : "bg-[#fff4e4] text-[#966419]"}`}>{item.status}</span></Td><Td>{item.invoice ? <div className="flex gap-2"><button type="button" onClick={() => openInvoice(item.invoice)} className="font-bold text-[#a3113a]">Abrir</button><a href={item.invoice.fileData} download={item.invoice.fileName} className="font-bold text-[#187157]">Baixar</a></div> : "Não vinculada"}</Td></tr>)}</tbody></table>{installments.length === 0 && <p className="py-10 text-center text-sm text-[#817578]">Nenhuma parcela encontrada.</p>}</div>; }
