import type { DemoPatientRecord } from "../medico/patient-store";

export type AdminTreatmentMethod = {
  id: string;
  name: string;
  category: "Método" | "Recorrente" | "Plano de 6 meses" | "Por frasco";
  value: number;
  cashValue?: number;
  paymentMethod: string;
  maxInstallments: number;
  billingPeriodMonths: number;
  discountType: "percentual" | "valor";
  discountValue: number;
  active: boolean;
  version: number;
  updatedAt: string;
};

export type AdminFixedCost = {
  id: string;
  description: string;
  category: string;
  amount: number;
  updatedAt: string;
  active: boolean;
};

export type AdminDoctor = {
  id: string;
  name: string;
  crm?: string;
  commissionRate: number;
  commissionPerBottle?: number;
  active: boolean;
  updatedAt: string;
};

export type AdminSaleSnapshot = {
  id: string;
  patientId: string;
  patientName: string;
  patientCpf: string;
  doctor: string;
  treatment: string;
  contractedAt: string;
  methodId: string;
  methodName: string;
  methodVersion: number;
  listValue: number;
  discountAmount: number;
  contractedValue: number;
  condition: "À vista" | "Parcelado";
  installments: number;
  paymentMethod: string;
  firstPaymentDueAt?: string;
  commissionRateSnapshot: number;
  bottleCount?: number;
  commissionPerBottleSnapshot?: number;
  status: "ativa" | "concluida" | "cancelada";
};

export type AdminCommissionRecord = {
  id: string;
  installmentId: string;
  saleId: string;
  patientId: string;
  patientName: string;
  doctor: string;
  paymentId?: string;
  receivedAt: string;
  accountingAt: string;
  receivedValue: number;
  commissionRate: number;
  bottleCount?: number;
  commissionPerBottle?: number;
  commissionValue: number;
  paidAt: string;
};

export type AdminAuditEntry = {
  id: string;
  entity: "método" | "custo" | "médico" | "venda" | "comissão";
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
  createdBy: string;
};

const METHODS_KEY = "cra-care-admin-methods";
const COSTS_KEY = "cra-care-admin-costs";
const DOCTORS_KEY = "cra-care-admin-doctors";
const SALES_KEY = "cra-care-admin-sales";
const COMMISSIONS_KEY = "cra-care-admin-commissions";
const AUDIT_KEY = "cra-care-admin-audit";
const UPDATE_EVENT = "cra-care-admin-updated";
export const COMMISSION_PER_BOTTLE = 68;

const initialMethods: AdminTreatmentMethod[] = [
  method("metodo-1-0", "Método 1.0", "Método", 320, "Asaas", 1, 1),
  method("metodo-1-1", "Método 1.1", "Método", 320, "Cartão de crédito", 1, 1),
  method("recorrente-1-0", "Recorrente 1.0", "Recorrente", 270, "Asaas", 6, 6),
  method("recorrente-2-0", "Recorrente 2.0", "Recorrente", 290, "Asaas", 6, 6),
  method("recorrente-3-0", "Recorrente 3.0", "Recorrente", 320, "Asaas", 6, 6),
  method("seis-meses-1-0", "6 meses 1.0", "Plano de 6 meses", 1620, "Cartão de crédito", 6, 6, 1500),
  method("seis-meses-2-0", "6 meses 2.0", "Plano de 6 meses", 1740, "Cartão de crédito", 6, 6, 1620),
  method("seis-meses-3-0", "6 meses 3.0", "Plano de 6 meses", 1920, "Cartão de crédito", 6, 6, 1790),
  method("por-frasco-1-0", "Por frasco 1.0", "Por frasco", 500, "Cartão de crédito", 2, 1),
];

const initialCosts: AdminFixedCost[] = [
  { id: "cost-insumos", description: "Insumos e frasco", category: "Produção", amount: 72, active: true, updatedAt: "2026-08-26T10:00:00" },
  { id: "cost-logistica", description: "Embalagem refrigerada", category: "Logística", amount: 18, active: true, updatedAt: "2026-08-26T10:00:00" },
  { id: "cost-operacional", description: "Custo operacional por tratamento", category: "Operacional", amount: 45, active: true, updatedAt: "2026-08-26T10:00:00" },
];

const initialDoctors: AdminDoctor[] = [
  { id: "doctor-flavio", name: "Dr. Flavio Mizoguchi", crm: "24603", commissionRate: 20, commissionPerBottle: COMMISSION_PER_BOTTLE, active: true, updatedAt: "2026-08-26T10:00:00" },
  { id: "doctor-camila", name: "Dra. Camila Rodrigues", commissionRate: 15, commissionPerBottle: COMMISSION_PER_BOTTLE, active: true, updatedAt: "2026-08-26T10:00:00" },
];

function method(
  id: string,
  name: string,
  category: AdminTreatmentMethod["category"],
  value: number,
  paymentMethod: string,
  maxInstallments: number,
  billingPeriodMonths: number,
  cashValue?: number,
): AdminTreatmentMethod {
  return {
    id,
    name,
    category,
    value,
    cashValue,
    paymentMethod,
    maxInstallments,
    billingPeriodMonths,
    discountType: "valor",
    discountValue: cashValue ? value - cashValue : 0,
    active: true,
    version: 1,
    updatedAt: "2026-08-26T10:00:00",
  };
}

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.sessionStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored<T>(key: string, value: T) {
  window.sessionStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

function audit(entity: AdminAuditEntry["entity"], entityId: string, action: string, summary: string) {
  const entries = readAdminAudit();
  const entry: AdminAuditEntry = {
    id: crypto.randomUUID(),
    entity,
    entityId,
    action,
    summary,
    createdAt: new Date().toISOString(),
    createdBy: "Administrador CRA",
  };
  window.sessionStorage.setItem(AUDIT_KEY, JSON.stringify([entry, ...entries].slice(0, 500)));
}

export function readAdminMethods() {
  return readStored(METHODS_KEY, initialMethods);
}

export function saveAdminMethod(methodRecord: AdminTreatmentMethod) {
  const current = readAdminMethods();
  const index = current.findIndex((item) => item.id === methodRecord.id);
  const previous = index >= 0 ? current[index] : undefined;
  const saved = {
    ...methodRecord,
    version: previous ? Math.max(previous.version + 1, methodRecord.version) : 1,
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) current[index] = saved;
  else current.unshift(saved);
  audit("método", saved.id, previous ? "Edição" : "Criação", `${saved.name} · versão ${saved.version} · R$ ${saved.value.toFixed(2)}`);
  writeStored(METHODS_KEY, current);
  return saved;
}

export function readAdminCosts() {
  return readStored(COSTS_KEY, initialCosts);
}

export function saveAdminCost(cost: AdminFixedCost) {
  const current = readAdminCosts();
  const index = current.findIndex((item) => item.id === cost.id);
  const saved = { ...cost, updatedAt: new Date().toISOString() };
  if (index >= 0) current[index] = saved;
  else current.unshift(saved);
  audit("custo", saved.id, index >= 0 ? "Edição" : "Criação", `${saved.description} · R$ ${saved.amount.toFixed(2)}`);
  writeStored(COSTS_KEY, current);
  return saved;
}

export function removeAdminCost(costId: string) {
  const current = readAdminCosts();
  const removed = current.find((item) => item.id === costId);

  if (!removed) return false;

  audit(
    "custo",
    removed.id,
    "Remoção",
    `${removed.description} · R$ ${removed.amount.toFixed(2)}`,
  );
  writeStored(COSTS_KEY, current.filter((item) => item.id !== costId));
  return true;
}

export function readAdminDoctors() {
  return readStored(DOCTORS_KEY, initialDoctors);
}

export function saveAdminDoctor(doctor: AdminDoctor) {
  const current = readAdminDoctors();
  const index = current.findIndex((item) => item.id === doctor.id);
  const previous = index >= 0 ? current[index] : undefined;
  const saved = { ...doctor, updatedAt: new Date().toISOString() };
  if (index >= 0) current[index] = saved;
  else current.unshift(saved);
  audit("médico", saved.id, previous ? "Edição de comissão" : "Cadastro", `${saved.name} · comissão de R$ ${(saved.commissionPerBottle ?? COMMISSION_PER_BOTTLE).toFixed(2)} por frasco`);
  writeStored(DOCTORS_KEY, current);
  return saved;
}

export function readAdminSales() {
  return readStored<AdminSaleSnapshot[]>(SALES_KEY, []);
}

export function readAdminCommissions() {
  return readStored<AdminCommissionRecord[]>(COMMISSIONS_KEY, []);
}

export function markAdminCommissionPaid(record: Omit<AdminCommissionRecord, "id" | "paidAt">) {
  const current = readAdminCommissions();
  const existing = current.find((item) => item.installmentId === record.installmentId);
  if (existing) return existing;

  const saved: AdminCommissionRecord = {
    ...record,
    id: crypto.randomUUID(),
    paidAt: new Date().toISOString(),
  };
  audit(
    "comissão",
    saved.installmentId,
    "Comissão paga",
    `${saved.doctor} · ${saved.patientName} · R$ ${saved.commissionValue.toFixed(2)} · competência ${saved.accountingAt.slice(0, 10)}`,
  );
  writeStored(COMMISSIONS_KEY, [saved, ...current]);
  return saved;
}

export function reverseAdminCommissionPayment(installmentId: string) {
  const current = readAdminCommissions();
  const removed = current.find((item) => item.installmentId === installmentId);
  if (!removed) return false;

  audit(
    "comissão",
    removed.installmentId,
    "Pagamento de comissão estornado",
    `${removed.doctor} · ${removed.patientName} · R$ ${removed.commissionValue.toFixed(2)}`,
  );
  writeStored(COMMISSIONS_KEY, current.filter((item) => item.installmentId !== installmentId));
  return true;
}

export function treatmentMethodTotal(methodRecord: AdminTreatmentMethod) {
  return methodRecord.category === "Recorrente"
    ? methodRecord.value * methodRecord.billingPeriodMonths
    : methodRecord.value;
}

function methodForPatient(patient: DemoPatientRecord, methods: AdminTreatmentMethod[]) {
  if (patient.methodSnapshotId) {
    const exact = methods.find((item) => item.id === patient.methodSnapshotId);
    if (exact) return exact;
  }
  const label = (patient.acquisitionMethod ?? "").toLowerCase();
  if (label.includes("recorrente")) return methods.find((item) => item.id === "recorrente-1-0") ?? methods[0];
  if (label.includes("6 meses") || label.includes("tratamento de 6")) return methods.find((item) => item.id === "seis-meses-1-0") ?? methods[0];
  if (label.includes("método 1.0")) return methods.find((item) => item.id === "metodo-1-0") ?? methods[0];
  return methods.find((item) => item.id === "por-frasco-1-0") ?? methods[0];
}

function saleStatus(patient: DemoPatientRecord): AdminSaleSnapshot["status"] {
  if (patient.status === "desistente" || patient.status === "perdido") return "cancelada";
  if (patient.status === "concluido") return "concluida";
  return "ativa";
}

export function synchronizeAdminSales(
  patients: DemoPatientRecord[],
  methods = readAdminMethods(),
  doctors = readAdminDoctors(),
) {
  const stored = readAdminSales();
  const current = stored.filter((sale) => {
    const patient = patients.find((item) => item.id === sale.patientId);
    if (!patient) return true;
    const hasFinancialHistory = Boolean(patient.contractValue || patient.payments?.length);
    return hasFinancialHistory || !["em-conversa", "tentar-novamente", "perdido"].includes(patient.status ?? "em-conversa");
  });
  let changed = current.length !== stored.length;
  const synchronized = current.map((sale) => {
    const patient = patients.find((item) => item.id === sale.patientId);
    const needsCommissionUpdate = sale.commissionPerBottleSnapshot === 64;
    if (!patient) return needsCommissionUpdate ? { ...sale, commissionPerBottleSnapshot: COMMISSION_PER_BOTTLE } : sale;
    const status = saleStatus(patient);
    if (status === sale.status && !needsCommissionUpdate) return sale;
    changed = true;
    return { ...sale, status, ...(needsCommissionUpdate ? { commissionPerBottleSnapshot: COMMISSION_PER_BOTTLE } : {}) };
  });

  patients
    .filter((patient) => {
      const hasFinancialHistory = Boolean(patient.contractValue || patient.payments?.length);
      const soldStatus = ["com-pedido", "ativo", "bacteriana", "concluido", "desistente"].includes(patient.status ?? "em-conversa");
      return patient.registrationStatus === "completed" && (soldStatus || hasFinancialHistory);
    })
    .forEach((patient) => {
      if (synchronized.some((sale) => sale.patientId === patient.id)) return;
      const selectedMethod = methodForPatient(patient, methods);
      if (!selectedMethod) return;
      const listValue = treatmentMethodTotal(selectedMethod);
      const condition = patient.agreedCondition ?? "Parcelado";
      const defaultValue = condition === "À vista" && selectedMethod.cashValue
        ? selectedMethod.cashValue
        : listValue;
      const contractedValue = patient.contractValue && patient.contractValue > 0
        ? patient.contractValue
        : defaultValue;
      const doctor = doctors.find((item) => item.name === patient.doctor);
      const installments = condition === "À vista"
        ? 1
        : Math.max(1, patient.paymentInstallments ?? selectedMethod.maxInstallments);
      synchronized.push({
        id: `sale-${patient.id}-${crypto.randomUUID()}`,
        patientId: patient.id,
        patientName: patient.name,
        patientCpf: patient.cpf,
        doctor: patient.doctor,
        treatment: patient.treatment ?? "Tratamento não informado",
        contractedAt: patient.startDate ?? patient.createdAt,
        methodId: selectedMethod.id,
        methodName: patient.acquisitionMethod ?? selectedMethod.name,
        methodVersion: patient.methodSnapshotVersion ?? selectedMethod.version,
        listValue,
        discountAmount: Math.max(0, patient.discountAmount ?? listValue - contractedValue),
        contractedValue,
        condition,
        installments,
        paymentMethod: patient.paymentMethod ?? selectedMethod.paymentMethod,
        firstPaymentDueAt: patient.paymentDueDate ?? addMonthsToDate(patient.startDate ?? patient.createdAt, 1),
        commissionRateSnapshot: doctor?.commissionRate ?? 0,
        bottleCount: bottlesForMethod(patient.acquisitionMethod ?? selectedMethod.name),
        commissionPerBottleSnapshot: doctor?.commissionPerBottle ?? COMMISSION_PER_BOTTLE,
        status: saleStatus(patient),
      });
      changed = true;
    });

  if (changed && typeof window !== "undefined") {
    window.sessionStorage.setItem(SALES_KEY, JSON.stringify(synchronized));
    audit("venda", "sincronização", "Sincronização", `${synchronized.length} venda(s) no histórico`);
    window.dispatchEvent(new Event(UPDATE_EVENT));
  }
  return synchronized;
}

function bottlesForMethod(methodName: string) {
  const normalized = methodName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("por frasco")) return 1;
  if (normalized.includes("metodo 1.0") || normalized.includes("metodo 1.1")) return 2;
  if (normalized.includes("recorrente") || normalized.includes("6 meses") || normalized.includes("tratamento de 6")) return 3;
  return 1;
}

function addMonthsToDate(value: string, months: number) {
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  return date.toISOString().slice(0, 10);
}

export function readAdminAudit() {
  return readStored<AdminAuditEntry[]>(AUDIT_KEY, []);
}

export function subscribeAdminStore(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(UPDATE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(UPDATE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
