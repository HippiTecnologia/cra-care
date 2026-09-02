import type {
  DemoBatch,
  DemoBatchItem,
  DemoInvoice,
  DemoPatientRecord,
  DemoPrescription,
  DemoStockItem,
  PatientPaymentRecord,
  PrescriptionFormula,
} from "../../app/medico/patient-store";
import type {
  PatientAssessment,
  PatientBottle,
  PatientPortalState,
} from "../../app/paciente/patient-portal-store";
import { createDefaultPortalState } from "../../app/paciente/patient-portal-store";
import {
  mapMedicalPatient,
  type MedicalPatientRow,
} from "./medical-records";
import { getSupabaseClient } from "./client";

export type SecretaryContext = {
  id: string;
  clinicId: string;
  fullName: string;
  role: string;
};

export type SecretaryDoctor = {
  id: string;
  fullName: string;
  crm: string;
  specialty: string;
  username?: string;
};

type PrescriptionRow = {
  id: string;
  patient_id: string;
  doctor_profile_id: string | null;
  content: Record<string, unknown> | null;
  signature_status: string;
  created_at: string;
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function prescriptionFromRow(
  row: PrescriptionRow,
  doctorById: Map<string, SecretaryDoctor>,
): DemoPrescription {
  const content = objectValue(row.content);
  const doctor = row.doctor_profile_id ? doctorById.get(row.doctor_profile_id) : undefined;
  const formulas = Array.isArray(content.formulas)
    ? content.formulas.filter((formula) => formula && typeof formula === "object") as PrescriptionFormula[]
    : [];
  const status = ["pending", "ready", "signed"].includes(row.signature_status)
    ? row.signature_status as DemoPrescription["signatureStatus"]
    : "pending";

  return {
    id: row.id,
    patientId: row.patient_id,
    doctor: text(content.doctor, doctor?.fullName ?? "Médico responsável"),
    doctorCrm: text(content.doctorCrm, doctor?.crm ?? ""),
    createdAt: row.created_at,
    treatment: text(content.treatment, "Imunoterapia para rinite"),
    phase: text(content.phase),
    bottles: number(content.bottles, 1),
    drops: number(content.drops, 6),
    frequency: text(content.frequency, "3 vezes por semana"),
    posology: text(content.posology),
    formulas,
    notes: text(content.notes),
    signatureStatus: status,
    signaturePreparedAt: text(content.signaturePreparedAt) || undefined,
    signaturePreparedBy: text(content.signaturePreparedBy) || undefined,
  };
}

async function audit(context: SecretaryContext, action: string, entity: string, entityId?: string, details: Record<string, unknown> = {}) {
  await getSupabaseClient().from("audit_logs").insert({
    clinic_id: context.clinicId,
    actor_id: context.id,
    action,
    entity,
    entity_id: entityId && isUuid(entityId) ? entityId : null,
    details,
  });
}

export async function loadSecretaryContext(): Promise<SecretaryContext> {
  const supabase = getSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sessão da Secretaria não encontrada.");
  const { data, error } = await supabase
    .from("profiles")
    .select("id, clinic_id, full_name, role")
    .eq("id", user.id)
    .single();
  if (error || !data?.clinic_id || !["secretaria", "admin", "super_admin"].includes(data.role)) {
    throw new Error("Este acesso não pertence à Secretaria.");
  }
  return { id: data.id, clinicId: data.clinic_id, fullName: data.full_name, role: data.role };
}

export async function loadSecretaryDoctors(context?: SecretaryContext) {
  const current = context ?? await loadSecretaryContext();
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("id, full_name, crm, specialty, username")
    .eq("clinic_id", current.clinicId)
    .eq("role", "medico")
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((row): SecretaryDoctor => ({
    id: row.id,
    fullName: row.full_name,
    crm: row.crm ?? "",
    specialty: row.specialty ?? "",
    username: row.username ?? undefined,
  }));
}

function paymentFromRow(row: Record<string, unknown>): PatientPaymentRecord {
  return {
    id: text(row.id),
    amount: number(row.amount),
    paidAt: text(row.paid_at) || text(row.due_at),
    method: text(row.payment_method, "A definir"),
    installments: number(row.installment_count, 1),
    installmentNumber: number(row.installment_number, 1),
    dueAt: text(row.due_at) || undefined,
    asaasReference: text(row.asaas_reference) || undefined,
    notes: text(row.notes) || undefined,
  };
}

export async function loadSecretaryPatients(context?: SecretaryContext) {
  const current = context ?? await loadSecretaryContext();
  const supabase = getSupabaseClient();
  const [doctors, patientResult, paymentResult] = await Promise.all([
    loadSecretaryDoctors(current),
    supabase.from("patients").select("*").eq("clinic_id", current.clinicId).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("clinic_id", current.clinicId).order("paid_at", { ascending: false }),
  ]);
  if (patientResult.error) throw patientResult.error;
  if (paymentResult.error) throw paymentResult.error;

  const doctorById = new Map(doctors.map((doctor) => [doctor.id, doctor]));
  const paymentsByPatient = new Map<string, PatientPaymentRecord[]>();
  for (const row of (paymentResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const patientId = text(row.patient_id);
    paymentsByPatient.set(patientId, [...(paymentsByPatient.get(patientId) ?? []), paymentFromRow(row)]);
  }

  const patients = ((patientResult.data ?? []) as unknown as MedicalPatientRow[]).map((row) => ({
    ...mapMedicalPatient(row, row.doctor_profile_id ? doctorById.get(row.doctor_profile_id)?.fullName ?? "Médico não vinculado" : "Médico não vinculado"),
    payments: paymentsByPatient.get(row.id) ?? [],
  }));
  return { context: current, doctors, patients };
}

function patientPayload(patient: DemoPatientRecord, existing: MedicalPatientRow) {
  const existingAddress = objectValue(existing.address);
  const existingTreatment = objectValue(existing.treatment);
  const existingFinancial = objectValue(existing.financial);
  return {
    full_name: patient.name.trim(),
    cpf: patient.cpf,
    birth_date: patient.birthDate,
    phone: patient.phone || null,
    email: patient.email || null,
    status: patient.status ?? "em-conversa",
    address: {
      ...existingAddress,
      registrationStatus: "completed",
      address: patient.address ?? "",
      zipCode: patient.zipCode ?? "",
      street: patient.street ?? "",
      number: patient.addressNumber ?? "",
      complement: patient.addressComplement ?? "",
      neighborhood: patient.neighborhood ?? "",
      city: patient.city ?? "",
      state: patient.state ?? "",
      delivery: patient.delivery ?? "Retirada",
      deliveryNotes: patient.deliveryNotes ?? "",
    },
    treatment: {
      ...existingTreatment,
      name: patient.treatment ?? "",
      startDate: patient.startDate ?? "",
      totalMonths: patient.totalMonths ?? 0,
      lastReceivedDate: patient.lastReceivedDate ?? "",
      bottlesReceived: patient.bottlesReceived ?? 0,
      drops: patient.drops ?? 0,
      phase: patient.phase ?? "",
      delivery: patient.delivery ?? "Retirada",
      notes: patient.notes ?? "",
      abandonmentReason: patient.abandonmentReason ?? "",
    },
    financial: {
      ...existingFinancial,
      billingName: patient.billingName ?? patient.name,
      billingCpf: patient.billingCpf ?? patient.cpf,
      acquisitionMethod: patient.acquisitionMethod ?? "",
      agreedCondition: patient.agreedCondition ?? "",
      methodSnapshotId: patient.methodSnapshotId ?? text(existingFinancial.methodSnapshotId),
      methodSnapshotVersion: patient.methodSnapshotVersion ?? number(existingFinancial.methodSnapshotVersion),
      discountAmount: patient.discountAmount ?? number(existingFinancial.discountAmount),
      paymentMethod: patient.paymentMethod ?? "A definir",
      installments: patient.paymentInstallments ?? 1,
      installmentValue: patient.installmentValue ?? number(existingFinancial.installmentValue),
      contractValue: patient.contractValue ?? number(existingFinancial.contractValue),
      dueDate: patient.paymentDueDate ?? text(existingFinancial.dueDate),
      paymentStatus: patient.paymentStatus ?? text(existingFinancial.paymentStatus, "A definir"),
      asaasReference: patient.asaasReference ?? text(existingFinancial.asaasReference),
      notes: patient.financialNotes ?? text(existingFinancial.notes),
    },
    updated_at: new Date().toISOString(),
  };
}

export async function saveSecretaryPatient(
  context: SecretaryContext,
  patient: DemoPatientRecord,
) {
  const supabase = getSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("patients")
    .select("*")
    .eq("id", patient.id)
    .eq("clinic_id", context.clinicId)
    .single();
  if (existingError || !existing) throw existingError ?? new Error("Paciente não encontrado.");
  const { error } = await supabase.from("patients")
    .update(patientPayload(patient, existing as unknown as MedicalPatientRow))
    .eq("id", patient.id)
    .eq("clinic_id", context.clinicId);
  if (error) throw error;

  const payments = patient.payments ?? [];
  const { data: savedPayments, error: paymentReadError } = await supabase
    .from("payments")
    .select("id")
    .eq("patient_id", patient.id);
  if (paymentReadError) throw paymentReadError;
  const desiredIds = new Set(payments.map((payment) => payment.id).filter(isUuid));
  const removedIds = (savedPayments ?? []).map((row) => String(row.id)).filter((id) => !desiredIds.has(id));
  if (removedIds.length) {
    const { error: deleteError } = await supabase.from("payments").delete().in("id", removedIds);
    if (deleteError) throw deleteError;
  }
  for (const payment of payments) {
    const payload = {
      clinic_id: context.clinicId,
      patient_id: patient.id,
      installment_number: payment.installmentNumber ?? 1,
      installment_count: payment.installments ?? patient.paymentInstallments ?? 1,
      amount: payment.amount,
      due_at: payment.dueAt ?? null,
      paid_at: payment.paidAt || null,
      payment_method: payment.method,
      status: payment.paidAt ? "recebido" : "pendente",
      asaas_reference: payment.asaasReference ?? null,
      notes: payment.notes ?? null,
    };
    if (isUuid(payment.id)) {
      const { error: paymentError } = await supabase.from("payments").upsert({ id: payment.id, ...payload });
      if (paymentError) throw paymentError;
    } else {
      const { data: inserted, error: paymentError } = await supabase.from("payments").insert(payload).select("id").single();
      if (paymentError || !inserted) throw paymentError ?? new Error("Pagamento não retornado.");
      payment.id = String(inserted.id);
    }
  }
  void audit(context, "update", "patient", patient.id, { status: patient.status, source: "secretaria" });
  return patient;
}

export async function updateSecretaryPatientStatus(
  context: SecretaryContext,
  patient: DemoPatientRecord,
) {
  const { data, error } = await getSupabaseClient().from("patients")
    .select("treatment")
    .eq("id", patient.id)
    .eq("clinic_id", context.clinicId)
    .single();
  if (error || !data) throw error ?? new Error("Paciente não encontrado.");
  const treatment = {
    ...objectValue(data.treatment),
    abandonmentReason: patient.abandonmentReason ?? "",
  };
  const { error: updateError } = await getSupabaseClient().from("patients")
    .update({ status: patient.status, treatment, updated_at: new Date().toISOString() })
    .eq("id", patient.id)
    .eq("clinic_id", context.clinicId);
  if (updateError) throw updateError;
  void audit(context, "status_change", "patient", patient.id, { status: patient.status });
}

export async function createSecretaryPatientAccess(patient: DemoPatientRecord) {
  const { data: { session } } = await getSupabaseClient().auth.getSession();
  if (!session) throw new Error("Sessão da Secretaria expirada.");
  const response = await fetch("/api/access", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      kind: "patient",
      patientId: patient.id,
      username: patient.username,
      birthDate: patient.birthDate,
    }),
  });
  const result = await response.json() as { username?: string; initialPassword?: string; error?: string };
  if (!response.ok || !result.username) throw new Error(result.error ?? "Não foi possível criar o acesso.");
  return { username: result.username, initialPassword: result.initialPassword ?? "" };
}

export async function loadSecretaryPrescriptions(context?: SecretaryContext) {
  const current = context ?? await loadSecretaryContext();
  const supabase = getSupabaseClient();
  const [doctors, result] = await Promise.all([
    loadSecretaryDoctors(current),
    supabase.from("prescriptions").select("*").eq("clinic_id", current.clinicId).order("created_at", { ascending: false }),
  ]);
  if (result.error) throw result.error;
  const doctorById = new Map(doctors.map((doctor) => [doctor.id, doctor]));
  return ((result.data ?? []) as unknown as PrescriptionRow[]).map((row) => prescriptionFromRow(row, doctorById));
}

function assessmentFromRow(row: Record<string, unknown>): PatientAssessment {
  return {
    id: text(row.id),
    bottleId: text(row.bottle_reference),
    bottleNumber: number(row.bottle_number),
    feeling: text(row.feeling) as PatientAssessment["feeling"] || undefined,
    symptomFrequency: text(row.frequency) as PatientAssessment["symptomFrequency"] || undefined,
    symptomSeverity: text(row.severity) as PatientAssessment["symptomSeverity"] || undefined,
    medicationFrequency: text(row.medication_frequency) as PatientAssessment["medicationFrequency"] || undefined,
    notes: text(row.comment),
    createdAt: text(row.created_at),
    viewedAt: text(row.viewed_at) || undefined,
    viewedBy: text(row.viewed_by) || undefined,
    response: text(row.response) || undefined,
    respondedAt: text(row.responded_at) || undefined,
    respondedBy: text(row.responded_by) || undefined,
  };
}

function bottleFromRow(row: Record<string, unknown>): PatientBottle {
  return {
    id: text(row.id),
    number: number(row.bottle_number),
    receivedAt: text(row.received_at) || undefined,
    startedAt: text(row.started_at) || text(row.received_at),
    finishedAt: text(row.completed_at) || undefined,
    status: row.completed_at ? "finalizado" : "em-uso",
  };
}

export async function loadSecretaryPortals(patientIds: string[]) {
  if (!patientIds.length) return {} as Record<string, PatientPortalState>;
  const supabase = getSupabaseClient();
  const [assessmentResult, bottleResult, contractResult] = await Promise.all([
    supabase.from("patient_assessments").select("*").in("patient_id", patientIds).order("created_at", { ascending: false }),
    supabase.from("bottles").select("*").in("patient_id", patientIds).order("bottle_number", { ascending: false }),
    supabase.from("patient_contracts").select("*").in("patient_id", patientIds),
  ]);
  if (assessmentResult.error) throw assessmentResult.error;
  if (bottleResult.error) throw bottleResult.error;
  if (contractResult.error) throw contractResult.error;
  const result = Object.fromEntries(patientIds.map((id) => [id, createDefaultPortalState(id)])) as Record<string, PatientPortalState>;
  for (const row of (assessmentResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const patientId = text(row.patient_id);
    if (result[patientId]) result[patientId].assessments.push(assessmentFromRow(row));
  }
  for (const row of (bottleResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const patientId = text(row.patient_id);
    if (!result[patientId]) continue;
    result[patientId].bottles.push(bottleFromRow(row));
    const metadata = objectValue(row.metadata);
    const adjustment = objectValue(metadata.historyAdjustment);
    if (Object.keys(adjustment).length) {
      result[patientId].bottleHistoryAdjustments = {
        ...(result[patientId].bottleHistoryAdjustments ?? {}),
        [number(row.bottle_number)]: adjustment as PatientPortalState["bottleHistoryAdjustments"] extends Record<number, infer Entry> ? Entry : never,
      };
    }
  }
  for (const row of (contractResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const patientId = text(row.patient_id);
    if (!result[patientId]) continue;
    result[patientId].signedAt = text(row.signed_at) || undefined;
    result[patientId].signedName = text(row.signed_name) || undefined;
    result[patientId].signedCpf = text(row.signed_cpf) || undefined;
  }
  return result;
}

export async function saveSecretaryAssessment(
  context: SecretaryContext,
  patientId: string,
  assessment: PatientAssessment,
) {
  const { error } = await getSupabaseClient().from("patient_assessments").update({
    viewed_at: assessment.viewedAt ?? null,
    viewed_by: assessment.viewedBy ?? null,
    response: assessment.response ?? null,
    responded_at: assessment.respondedAt ?? null,
    responded_by: assessment.respondedBy ?? null,
  }).eq("id", assessment.id).eq("patient_id", patientId).eq("clinic_id", context.clinicId);
  if (error) throw error;
  void audit(context, "respond", "patient_assessment", assessment.id, { patientId });
}

export async function saveSecretaryBottleAdjustment(
  context: SecretaryContext,
  patientId: string,
  bottleNumber: number,
  adjustment: NonNullable<PatientPortalState["bottleHistoryAdjustments"]>[number],
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("bottles")
    .select("id, metadata")
    .eq("patient_id", patientId)
    .eq("bottle_number", bottleNumber)
    .eq("clinic_id", context.clinicId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Frasco não encontrado no estoque real.");
  const { error: updateError } = await supabase.from("bottles").update({
    received_at: adjustment.receivedAt || null,
    started_at: adjustment.startedAt || null,
    completed_at: adjustment.finishedAt || null,
    status: adjustment.status ?? "recebido",
    metadata: { ...objectValue(data.metadata), historyAdjustment: adjustment },
  }).eq("id", String(data.id));
  if (updateError) throw updateError;
  void audit(context, "adjust_history", "bottle", String(data.id), { patientId, bottleNumber, reason: adjustment.reason });
}

function batchItemFromRow(row: Record<string, unknown>): DemoBatchItem {
  const metadata = objectValue(row.metadata);
  return {
    ...(metadata as unknown as DemoBatchItem),
    prescriptionId: text(metadata.prescriptionId, text(row.prescription_id, `ready-${text(row.id)}`)),
    patientId: text(metadata.patientId, text(row.patient_id)),
    patientName: text(metadata.patientName, "Pronta entrega · sem paciente"),
    patientCpf: text(metadata.patientCpf),
    doctor: text(metadata.doctor, "Médico responsável"),
    treatment: text(metadata.treatment),
    phase: text(metadata.phase),
    bottles: number(row.bottles, number(metadata.bottles, 1)),
    formulas: Array.isArray(metadata.formulas) ? metadata.formulas as PrescriptionFormula[] : [],
  };
}

export async function loadSecretaryBatches(context?: SecretaryContext) {
  const current = context ?? await loadSecretaryContext();
  const supabase = getSupabaseClient();
  const [batchResult, itemResult] = await Promise.all([
    supabase.from("batches").select("*").eq("clinic_id", current.clinicId).order("created_at", { ascending: false }),
    supabase.from("batch_items").select("*"),
  ]);
  if (batchResult.error) throw batchResult.error;
  if (itemResult.error) throw itemResult.error;
  const itemsByBatch = new Map<string, DemoBatchItem[]>();
  for (const row of (itemResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const batchId = text(row.batch_id);
    itemsByBatch.set(batchId, [...(itemsByBatch.get(batchId) ?? []), batchItemFromRow(row)]);
  }
  return ((batchResult.data ?? []) as unknown as Record<string, unknown>[]).map((row): DemoBatch => {
    const metadata = objectValue(row.metadata);
    return {
      ...(metadata as unknown as Partial<DemoBatch>),
      id: text(row.id),
      code: text(row.code, text(metadata.code, `CRA-${new Date(text(row.created_at)).getFullYear()}`)),
      name: text(row.name),
      createdAt: text(row.created_at),
      status: text(row.status, "rascunho") as DemoBatch["status"],
      laboratory: text(row.laboratory),
      notes: text(metadata.notes),
      items: itemsByBatch.get(text(row.id)) ?? [],
    };
  });
}

export async function saveSecretaryBatch(context: SecretaryContext, batch: DemoBatch) {
  const supabase = getSupabaseClient();
  const batchId = isUuid(batch.id) ? batch.id : crypto.randomUUID();
  const savedBatch = { ...batch, id: batchId };
  const metadata = {
    code: savedBatch.code,
    notes: savedBatch.notes,
    sentAt: savedBatch.sentAt,
    productionStartedAt: savedBatch.productionStartedAt,
    productionFinishedAt: savedBatch.productionFinishedAt,
    productionResponsible: savedBatch.productionResponsible,
    productionNotes: savedBatch.productionNotes,
    preparedPrescriptionIds: savedBatch.preparedPrescriptionIds,
    checkedPrescriptionIds: savedBatch.checkedPrescriptionIds,
    checkedAt: savedBatch.checkedAt,
    checkedBy: savedBatch.checkedBy,
    conferenceNotes: savedBatch.conferenceNotes,
    orderType: savedBatch.orderType,
  };
  const { error } = await supabase.from("batches").upsert({
    id: batchId,
    clinic_id: context.clinicId,
    code: savedBatch.code,
    name: savedBatch.name ?? savedBatch.code,
    status: savedBatch.status,
    laboratory: savedBatch.laboratory,
    metadata,
  });
  if (error) throw error;
  const { error: deleteError } = await supabase.from("batch_items").delete().eq("batch_id", batchId);
  if (deleteError) throw deleteError;
  if (savedBatch.items.length) {
    const { error: itemError } = await supabase.from("batch_items").insert(savedBatch.items.map((item) => ({
      batch_id: batchId,
      patient_id: item.patientId && isUuid(item.patientId) ? item.patientId : null,
      prescription_id: item.prescriptionId && isUuid(item.prescriptionId) ? item.prescriptionId : null,
      bottles: item.bottles,
      metadata: item,
    })));
    if (itemError) throw itemError;
  }
  void audit(context, "upsert", "batch", batchId, { status: batch.status, items: batch.items.length });
  return savedBatch;
}

function stockFromRow(row: Record<string, unknown>): DemoStockItem {
  const metadata = objectValue(row.metadata);
  return {
    ...(metadata as unknown as DemoStockItem),
    id: text(row.id),
    batchId: text(row.batch_id, text(metadata.batchId)),
    batchCode: text(metadata.batchCode),
    prescriptionId: text(row.prescription_id, text(metadata.prescriptionId)),
    patientId: text(row.patient_id, text(metadata.patientId)),
    patientName: text(metadata.patientName, "Pronta entrega · sem paciente"),
    patientCpf: text(metadata.patientCpf),
    doctor: text(metadata.doctor),
    treatment: text(metadata.treatment),
    phase: text(metadata.phase),
    bottles: number(metadata.bottles, 1),
    formulas: Array.isArray(metadata.formulas) ? metadata.formulas as PrescriptionFormula[] : [],
    laboratory: text(metadata.laboratory),
    receivedAt: text(row.received_at, text(metadata.receivedAt)),
    checkedBy: text(row.checked_by, text(metadata.checkedBy)),
    status: text(row.status, "disponivel") as DemoStockItem["status"],
    reservedAt: text(row.reserved_at) || text(metadata.reservedAt) || undefined,
    deliveredAt: text(row.delivered_at) || text(metadata.deliveredAt) || undefined,
  };
}

export async function loadSecretaryStock(context?: SecretaryContext) {
  const current = context ?? await loadSecretaryContext();
  const { data, error } = await getSupabaseClient().from("bottles")
    .select("*")
    .eq("clinic_id", current.clinicId)
    .order("received_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(stockFromRow);
}

export async function saveSecretaryStockItem(context: SecretaryContext, item: DemoStockItem) {
  const supabase = getSupabaseClient();
  const id = isUuid(item.id) ? item.id : crypto.randomUUID();
  let bottleNumber = 1;
  if (item.patientId) {
    const [existingResult, latestResult] = await Promise.all([
      supabase.from("bottles").select("bottle_number").eq("id", id).maybeSingle(),
      supabase.from("bottles").select("bottle_number").eq("patient_id", item.patientId).order("bottle_number", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (existingResult.error) throw existingResult.error;
    if (latestResult.error) throw latestResult.error;
    const existingNumber = number(existingResult.data?.bottle_number, 0);
    bottleNumber = existingNumber || number(latestResult.data?.bottle_number, 0) + 1;
  }
  const { error } = await supabase.from("bottles").upsert({
    id,
    clinic_id: context.clinicId,
    patient_id: item.patientId && isUuid(item.patientId) ? item.patientId : null,
    prescription_id: item.prescriptionId && isUuid(item.prescriptionId) ? item.prescriptionId : null,
    batch_id: item.batchId && isUuid(item.batchId) ? item.batchId : null,
    bottle_number: bottleNumber,
    received_at: item.receivedAt ? item.receivedAt.slice(0, 10) : null,
    status: item.status,
    reserved_at: item.reservedAt ?? null,
    delivered_at: item.deliveredAt ?? null,
    checked_by: item.checkedBy,
    metadata: { ...item, id },
  });
  if (error) throw error;
  return { ...item, id };
}

export async function confirmSecretaryBatch(
  context: SecretaryContext,
  batch: DemoBatch,
  checkedBy: string,
  conferenceNotes: string,
  patients: DemoPatientRecord[],
) {
  if (batch.status !== "pronto") throw new Error("Este lote já foi conferido ou ainda não está pronto.");
  const checkedIds = new Set(batch.checkedPrescriptionIds ?? []);
  if (!batch.items.length || batch.items.some((item) => !checkedIds.has(item.prescriptionId))) {
    throw new Error("Confira todos os itens antes de liberar o lote para estoque.");
  }
  if (!checkedBy.trim()) throw new Error("Informe o responsável pela conferência do lote.");
  const receivedAt = new Date().toISOString();
  const stockItems: DemoStockItem[] = [];
  for (const item of batch.items) {
    const patient = patients.find((candidate) => candidate.id === item.patientId);
    const saved = await saveSecretaryStockItem(context, {
      id: crypto.randomUUID(),
      batchId: batch.id,
      batchCode: batch.code,
      prescriptionId: item.prescriptionId,
      origin: item.orderType ?? batch.orderType ?? "pedido-paciente",
      patientId: item.patientId,
      patientName: item.patientName,
      patientCpf: item.patientCpf,
      patientPhone: patient?.phone,
      doctor: item.doctor,
      treatment: item.treatment,
      phase: item.phase,
      bottles: item.bottles,
      formulas: item.formulas,
      delivery: patient?.delivery,
      laboratory: batch.laboratory,
      receivedAt,
      checkedBy: checkedBy.trim(),
      status: "disponivel",
      paymentConfirmedAt: item.paymentConfirmedAt,
      asaasConfirmedAt: item.asaasConfirmedAt,
    });
    stockItems.push(saved);
  }
  await saveSecretaryBatch(context, {
    ...batch,
    status: "conferido",
    checkedAt: receivedAt,
    checkedBy: checkedBy.trim(),
    conferenceNotes: conferenceNotes.trim(),
  });
  return stockItems;
}

export async function loadSecretaryInvoices(context?: SecretaryContext) {
  const current = context ?? await loadSecretaryContext();
  const { data, error } = await getSupabaseClient().from("invoice_documents")
    .select("*")
    .eq("clinic_id", current.clinicId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row): DemoInvoice => ({
    id: text(row.id),
    patientId: text(row.patient_id),
    patientName: text(row.patient_name),
    patientCpf: text(row.patient_cpf),
    fileName: text(row.file_name),
    fileData: text(row.file_data),
    fileSize: number(row.file_size),
    uploadedAt: text(row.created_at),
    uploadedBy: text(row.uploaded_by),
  }));
}

export async function saveSecretaryInvoice(context: SecretaryContext, invoice: DemoInvoice) {
  const { error } = await getSupabaseClient().from("invoice_documents").insert({
    id: isUuid(invoice.id) ? invoice.id : undefined,
    clinic_id: context.clinicId,
    patient_id: invoice.patientId,
    patient_name: invoice.patientName,
    patient_cpf: invoice.patientCpf,
    file_name: invoice.fileName,
    file_data: invoice.fileData,
    file_size: invoice.fileSize,
    uploaded_by: invoice.uploadedBy,
  });
  if (error) throw error;
  void audit(context, "upload", "invoice", invoice.id, { patientId: invoice.patientId, fileName: invoice.fileName });
  return invoice;
}

export async function removeSecretaryInvoice(context: SecretaryContext, invoiceId: string) {
  const { error } = await getSupabaseClient().from("invoice_documents")
    .delete()
    .eq("id", invoiceId)
    .eq("clinic_id", context.clinicId);
  if (error) throw error;
  void audit(context, "delete", "invoice", invoiceId);
}

export async function loadSecretaryUsers(context?: SecretaryContext) {
  const current = context ?? await loadSecretaryContext();
  const { data, error } = await getSupabaseClient().from("profiles")
    .select("id, full_name, role, username, crm, specialty")
    .eq("clinic_id", current.clinicId)
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}
