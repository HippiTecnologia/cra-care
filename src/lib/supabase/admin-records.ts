import type { DemoInvoice, DemoPatientRecord } from "../../app/medico/patient-store";
import {
  AdminAuditEntry,
  AdminCommissionRecord,
  AdminDoctor,
  AdminFixedCost,
  AdminSaleSnapshot,
  AdminTreatmentMethod,
  COMMISSION_PER_BOTTLE,
  treatmentMethodTotal,
} from "../../app/adm/admin-store";
import { getSupabaseClient } from "./client";
import {
  loadSecretaryInvoices,
  loadSecretaryPatients,
  type SecretaryContext,
} from "./secretary-records";

export type AdminContext = SecretaryContext;

export type AdminWorkspace = {
  context: AdminContext;
  patients: DemoPatientRecord[];
  methods: AdminTreatmentMethod[];
  costs: AdminFixedCost[];
  doctors: AdminDoctor[];
  sales: AdminSaleSnapshot[];
  commissions: AdminCommissionRecord[];
  audit: AdminAuditEntry[];
  invoices: DemoInvoice[];
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateText(value: unknown, fallback: string) {
  const candidate = text(value);
  if (!candidate) return fallback;
  const parsed = new Date(candidate.includes("T") ? candidate : `${candidate}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : candidate;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function methodFromRow(row: Record<string, unknown>): AdminTreatmentMethod {
  return {
    id: text(row.id),
    name: text(row.name),
    category: text(row.category, "Método") as AdminTreatmentMethod["category"],
    value: number(row.value),
    cashValue: row.cash_value === null || row.cash_value === undefined ? undefined : number(row.cash_value),
    paymentMethod: text(row.payment_method),
    maxInstallments: number(row.max_installments, 1),
    billingPeriodMonths: number(row.billing_period_months, 1),
    discountType: text(row.discount_type, "valor") as AdminTreatmentMethod["discountType"],
    discountValue: number(row.discount_value),
    active: row.active !== false,
    version: number(row.version, 1),
    updatedAt: text(row.updated_at, text(row.created_at)),
  };
}

function costFromRow(row: Record<string, unknown>): AdminFixedCost {
  return {
    id: text(row.id),
    description: text(row.description),
    category: text(row.category),
    amount: number(row.amount),
    active: row.active !== false,
    updatedAt: text(row.updated_at, text(row.created_at)),
  };
}

async function writeAudit(
  context: AdminContext,
  entity: AdminAuditEntry["entity"],
  entityId: string,
  action: string,
  summary: string,
) {
  const { error } = await getSupabaseClient().from("audit_logs").insert({
    clinic_id: context.clinicId,
    actor_id: context.id,
    action,
    entity,
    entity_id: isUuid(entityId) ? entityId : null,
    details: { summary, entityId },
  });
  if (error) throw error;
}

export async function loadAdminContext(): Promise<AdminContext> {
  const supabase = getSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sessão administrativa não encontrada.");
  const { data, error } = await supabase.from("profiles")
    .select("id, clinic_id, full_name, role")
    .eq("id", user.id)
    .single();
  if (error || !data?.clinic_id || !["admin", "super_admin"].includes(data.role)) {
    throw new Error("Este acesso não pertence ao perfil Administrador.");
  }
  return { id: data.id, clinicId: data.clinic_id, fullName: data.full_name, role: data.role };
}

export async function loadAdminMethods(context: Pick<AdminContext, "clinicId">) {
  const { data, error } = await getSupabaseClient().from("admin_treatment_methods")
    .select("*")
    .eq("clinic_id", context.clinicId)
    .order("method_key")
    .order("version", { ascending: false });
  if (error) throw error;
  const latest = new Map<string, AdminTreatmentMethod>();
  for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
    const key = text(raw.method_key, text(raw.id));
    if (!latest.has(key)) latest.set(key, methodFromRow(raw));
  }
  return Array.from(latest.values()).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

export async function loadActiveAdminMethods(context: Pick<AdminContext, "clinicId">) {
  return (await loadAdminMethods(context)).filter((method) => method.active);
}

export async function saveAdminMethod(context: AdminContext, method: AdminTreatmentMethod) {
  const supabase = getSupabaseClient();
  let methodKey = `metodo-${crypto.randomUUID()}`;
  let version = 1;
  if (isUuid(method.id)) {
    const { data: current, error } = await supabase.from("admin_treatment_methods")
      .select("method_key, version")
      .eq("id", method.id)
      .eq("clinic_id", context.clinicId)
      .single();
    if (error || !current) throw error ?? new Error("Modalidade não encontrada.");
    methodKey = text(current.method_key, methodKey);
    version = number(current.version, method.version) + 1;
  }
  const { data, error } = await supabase.from("admin_treatment_methods").insert({
    clinic_id: context.clinicId,
    method_key: methodKey,
    name: method.name.trim(),
    category: method.category,
    value: method.value,
    cash_value: method.cashValue ?? null,
    payment_method: method.paymentMethod,
    max_installments: method.maxInstallments,
    billing_period_months: method.billingPeriodMonths,
    discount_type: method.discountType,
    discount_value: method.discountValue,
    active: method.active,
    version,
    created_by: context.id,
    updated_at: new Date().toISOString(),
  }).select("*").single();
  if (error || !data) throw error ?? new Error("Modalidade não retornada.");
  const saved = methodFromRow(data as unknown as Record<string, unknown>);
  await writeAudit(context, "método", saved.id, method.id ? "Edição" : "Criação", `${saved.name} · versão ${saved.version} · R$ ${saved.value.toFixed(2)}`);
  return saved;
}

export async function loadAdminCosts(context: AdminContext) {
  const { data, error } = await getSupabaseClient().from("admin_fixed_costs")
    .select("*")
    .eq("clinic_id", context.clinicId)
    .order("description");
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(costFromRow);
}

export async function saveAdminCost(context: AdminContext, cost: AdminFixedCost) {
  const id = isUuid(cost.id) ? cost.id : crypto.randomUUID();
  const { data, error } = await getSupabaseClient().from("admin_fixed_costs").upsert({
    id,
    clinic_id: context.clinicId,
    description: cost.description.trim(),
    category: cost.category.trim(),
    amount: cost.amount,
    active: cost.active,
    updated_by: context.id,
    updated_at: new Date().toISOString(),
  }).select("*").single();
  if (error || !data) throw error ?? new Error("Custo não retornado.");
  const saved = costFromRow(data as unknown as Record<string, unknown>);
  await writeAudit(context, "custo", saved.id, cost.id ? "Edição" : "Criação", `${saved.description} · R$ ${saved.amount.toFixed(2)}`);
  return saved;
}

export async function removeAdminCost(context: AdminContext, cost: AdminFixedCost) {
  const { error } = await getSupabaseClient().from("admin_fixed_costs")
    .delete()
    .eq("id", cost.id)
    .eq("clinic_id", context.clinicId);
  if (error) throw error;
  await writeAudit(context, "custo", cost.id, "Remoção", `${cost.description} · R$ ${cost.amount.toFixed(2)}`);
}

export async function loadAdminDoctors(context: AdminContext) {
  const supabase = getSupabaseClient();
  const [profileResult, settingResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name, crm").eq("clinic_id", context.clinicId).eq("role", "medico").order("full_name"),
    supabase.from("doctor_commission_settings").select("doctor_profile_id, commission_per_bottle, active, updated_at").eq("clinic_id", context.clinicId),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (settingResult.error) throw settingResult.error;
  const settingByDoctor = new Map((settingResult.data ?? []).map((setting) => [setting.doctor_profile_id, setting]));
  return (profileResult.data ?? []).map((profile): AdminDoctor => {
    const setting = settingByDoctor.get(profile.id);
    return {
      id: profile.id,
      name: profile.full_name,
      crm: profile.crm ?? undefined,
      commissionRate: 0,
      commissionPerBottle: number(setting?.commission_per_bottle, COMMISSION_PER_BOTTLE),
      active: setting?.active !== false,
      updatedAt: text(setting?.updated_at, new Date().toISOString()),
    };
  });
}

export async function saveAdminDoctor(context: AdminContext, doctor: AdminDoctor) {
  const { error } = await getSupabaseClient().from("doctor_commission_settings").upsert({
    clinic_id: context.clinicId,
    doctor_profile_id: doctor.id,
    commission_per_bottle: doctor.commissionPerBottle ?? COMMISSION_PER_BOTTLE,
    active: doctor.active,
    updated_by: context.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "clinic_id,doctor_profile_id" });
  if (error) throw error;
  await writeAudit(context, "médico", doctor.id, "Edição de comissão", `${doctor.name} · comissão de R$ ${(doctor.commissionPerBottle ?? COMMISSION_PER_BOTTLE).toFixed(2)} por frasco`);
}

function saleStatus(patient: DemoPatientRecord): AdminSaleSnapshot["status"] {
  if (patient.status === "desistente" || patient.status === "perdido") return "cancelada";
  if (patient.status === "concluido") return "concluida";
  return "ativa";
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

function methodForPatient(patient: DemoPatientRecord, methods: AdminTreatmentMethod[]) {
  if (patient.methodSnapshotId) {
    const exact = methods.find((method) => method.id === patient.methodSnapshotId);
    if (exact) return exact;
  }
  const label = (patient.acquisitionMethod ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (label.includes("recorrente")) return methods.find((method) => method.name === "Recorrente 1.0") ?? methods[0];
  if (label.includes("6 meses") || label.includes("tratamento de 6")) return methods.find((method) => method.name === "6 meses 1.0") ?? methods[0];
  if (label.includes("metodo 1.0")) return methods.find((method) => method.name === "Método 1.0") ?? methods[0];
  return methods.find((method) => method.category === "Por frasco") ?? methods[0];
}

function saleFromRow(row: Record<string, unknown>): AdminSaleSnapshot {
  const snapshot = objectValue(row.snapshot) as unknown as AdminSaleSnapshot;
  const condition = text(snapshot.condition, "Parcelado") === "À vista" ? "À vista" : "Parcelado";
  return {
    ...snapshot,
    id: text(row.id, text(snapshot.id)),
    patientId: text(row.patient_id, text(snapshot.patientId)),
    patientName: text(snapshot.patientName, "Paciente sem nome"),
    patientCpf: text(snapshot.patientCpf),
    doctor: text(snapshot.doctor, "Médico não informado"),
    treatment: text(snapshot.treatment, "Tratamento não informado"),
    contractedAt: dateText(snapshot.contractedAt, dateText(row.created_at, new Date(0).toISOString())),
    methodId: text(snapshot.methodId),
    methodName: text(snapshot.methodName, "Método não informado"),
    methodVersion: number(snapshot.methodVersion, 1),
    listValue: number(snapshot.listValue),
    discountAmount: number(snapshot.discountAmount),
    contractedValue: number(snapshot.contractedValue),
    condition,
    installments: Math.max(1, number(snapshot.installments, 1)),
    paymentMethod: text(snapshot.paymentMethod, "A definir"),
    firstPaymentDueAt: snapshot.firstPaymentDueAt ? dateText(snapshot.firstPaymentDueAt, "") || undefined : undefined,
    commissionRateSnapshot: number(snapshot.commissionRateSnapshot),
    bottleCount: number(snapshot.bottleCount) || undefined,
    commissionPerBottleSnapshot: snapshot.commissionPerBottleSnapshot === undefined || snapshot.commissionPerBottleSnapshot === null
      ? undefined
      : number(snapshot.commissionPerBottleSnapshot, COMMISSION_PER_BOTTLE),
    status: ["ativa", "concluida", "cancelada"].includes(text(row.status, text(snapshot.status)))
      ? text(row.status, text(snapshot.status)) as AdminSaleSnapshot["status"]
      : "ativa",
  };
}

export async function loadAdminSales(context: AdminContext) {
  const { data, error } = await getSupabaseClient().from("admin_sales")
    .select("*")
    .eq("clinic_id", context.clinicId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(saleFromRow);
}

export async function synchronizeAdminSales(
  context: AdminContext,
  patients: DemoPatientRecord[],
  methods: AdminTreatmentMethod[],
  doctors: AdminDoctor[],
) {
  const supabase = getSupabaseClient();
  const existing = await loadAdminSales(context);
  const sales = [...existing];
  let created = 0;

  for (let index = 0; index < sales.length; index += 1) {
    const sale = sales[index];
    const patient = patients.find((item) => item.id === sale.patientId);
    if (!patient) continue;
    const status = saleStatus(patient);
    const commissionPerBottleSnapshot = sale.commissionPerBottleSnapshot === 64
      ? COMMISSION_PER_BOTTLE
      : sale.commissionPerBottleSnapshot;
    if (status !== sale.status || commissionPerBottleSnapshot !== sale.commissionPerBottleSnapshot) {
      const updated = { ...sale, status, commissionPerBottleSnapshot };
      const { error } = await supabase.from("admin_sales").update({
        status,
        snapshot: updated,
        updated_at: new Date().toISOString(),
      }).eq("id", sale.id).eq("clinic_id", context.clinicId);
      if (error) throw error;
      sales[index] = updated;
    }
  }

  for (const patient of patients) {
    if (sales.some((sale) => sale.patientId === patient.id)) continue;
    const hasFinancialHistory = Boolean(patient.contractValue || patient.payments?.length);
    const soldStatus = ["com-pedido", "ativo", "bacteriana", "concluido", "desistente"].includes(patient.status ?? "em-conversa");
    if (patient.registrationStatus !== "completed" || (!soldStatus && !hasFinancialHistory)) continue;
    const selectedMethod = methodForPatient(patient, methods);
    if (!selectedMethod) continue;
    const listValue = treatmentMethodTotal(selectedMethod);
    const condition = patient.agreedCondition ?? "Parcelado";
    const defaultValue = condition === "À vista" && selectedMethod.cashValue ? selectedMethod.cashValue : listValue;
    const contractedValue = patient.contractValue && patient.contractValue > 0 ? patient.contractValue : defaultValue;
    const doctor = doctors.find((item) => item.name === patient.doctor);
    const installments = condition === "À vista" ? 1 : Math.max(1, patient.paymentInstallments ?? selectedMethod.maxInstallments);
    const id = crypto.randomUUID();
    const sale: AdminSaleSnapshot = {
      id,
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
    };
    const { error } = await supabase.from("admin_sales").insert({
      id,
      clinic_id: context.clinicId,
      patient_id: patient.id,
      status: sale.status,
      snapshot: sale,
    });
    if (error) throw error;
    sales.unshift(sale);
    created += 1;
  }
  if (created) await writeAudit(context, "venda", "sincronizacao", "Sincronização", `${created} nova(s) venda(s) sincronizada(s) com o cadastro da Secretaria`);
  return sales;
}

function commissionFromRow(row: Record<string, unknown>): AdminCommissionRecord {
  const snapshot = objectValue(row.snapshot) as unknown as AdminCommissionRecord;
  return {
    ...snapshot,
    id: text(row.id),
    installmentId: text(row.installment_key, snapshot.installmentId),
    saleId: text(row.sale_id, snapshot.saleId),
    patientId: text(row.patient_id, snapshot.patientId),
    paidAt: text(row.paid_at, snapshot.paidAt),
  };
}

export async function loadAdminCommissions(context: AdminContext) {
  const { data, error } = await getSupabaseClient().from("admin_commission_payments")
    .select("*")
    .eq("clinic_id", context.clinicId)
    .order("paid_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(commissionFromRow);
}

export async function markAdminCommissionPaid(
  context: AdminContext,
  record: Omit<AdminCommissionRecord, "id" | "paidAt">,
) {
  const paidAt = new Date().toISOString();
  const snapshot: AdminCommissionRecord = { ...record, id: crypto.randomUUID(), paidAt };
  const { data, error } = await getSupabaseClient().from("admin_commission_payments").insert({
    id: snapshot.id,
    clinic_id: context.clinicId,
    installment_key: record.installmentId,
    sale_id: record.saleId,
    patient_id: record.patientId,
    snapshot,
    paid_at: paidAt,
    paid_by: context.id,
  }).select("*").single();
  if (error || !data) throw error ?? new Error("Pagamento de comissão não retornado.");
  await writeAudit(context, "comissão", snapshot.id, "Comissão paga", `${record.doctor} · ${record.patientName} · R$ ${record.commissionValue.toFixed(2)} · competência ${record.accountingAt.slice(0, 10)}`);
  return commissionFromRow(data as unknown as Record<string, unknown>);
}

export async function reverseAdminCommissionPayment(context: AdminContext, record: AdminCommissionRecord) {
  const { error } = await getSupabaseClient().from("admin_commission_payments")
    .delete()
    .eq("id", record.id)
    .eq("clinic_id", context.clinicId);
  if (error) throw error;
  await writeAudit(context, "comissão", record.id, "Pagamento de comissão estornado", `${record.doctor} · ${record.patientName} · R$ ${record.commissionValue.toFixed(2)}`);
}

export async function loadAdminAudit(context: AdminContext) {
  const supabase = getSupabaseClient();
  const [auditResult, profileResult] = await Promise.all([
    supabase.from("audit_logs").select("id, actor_id, action, entity, entity_id, details, created_at")
      .eq("clinic_id", context.clinicId)
      .in("entity", ["método", "custo", "médico", "venda", "comissão"])
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("profiles").select("id, full_name").eq("clinic_id", context.clinicId),
  ]);
  if (auditResult.error) throw auditResult.error;
  if (profileResult.error) throw profileResult.error;
  const nameById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]));
  return ((auditResult.data ?? []) as unknown as Record<string, unknown>[]).map((row): AdminAuditEntry => {
    const details = objectValue(row.details);
    return {
      id: text(row.id),
      entity: text(row.entity, "venda") as AdminAuditEntry["entity"],
      entityId: text(row.entity_id, text(details.entityId)),
      action: text(row.action),
      summary: text(details.summary, "Alteração registrada no sistema"),
      createdAt: text(row.created_at),
      createdBy: nameById.get(text(row.actor_id)) ?? "Sistema CRA Care",
    };
  });
}

export async function loadAdminWorkspace(): Promise<AdminWorkspace> {
  const context = await loadAdminContext();
  const patientWorkspace = await loadSecretaryPatients(context);
  const [methods, costs, doctors, commissions, invoices] = await Promise.all([
    loadAdminMethods(context),
    loadAdminCosts(context),
    loadAdminDoctors(context),
    loadAdminCommissions(context),
    loadSecretaryInvoices(context),
  ]);
  const sales = await synchronizeAdminSales(context, patientWorkspace.patients, methods, doctors);
  const audit = await loadAdminAudit(context);
  return {
    context,
    patients: patientWorkspace.patients,
    methods,
    costs,
    doctors,
    sales,
    commissions,
    audit,
    invoices,
  };
}
