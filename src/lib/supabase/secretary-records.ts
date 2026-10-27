import type {
  BottleVolumeMl,
  DemoBatch,
  DemoBatchItem,
  DemoInvoice,
  DemoPatientRecord,
  DemoPrescription,
  DemoStockItem,
  PatientPaymentRecord,
  PrescriptionFormula,
  TreatmentPayment,
} from "../../app/medico/patient-store";
import type {
  PatientAssessment,
  PatientManualNotification,
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

export type TeamNotification = {
  id: string;
  patientId?: string;
  title: string;
  message: string;
  href: string;
  createdAt: string;
  readAt?: string;
};

export type SecretaryPatientOrderHistory = {
  id: string;
  sourceRowNumber: number;
  receivedDate: string;
  doctor: string;
  phase: string;
  formula: string;
  bottles: string;
  amount: string;
  paymentMethod: string;
  installment: string;
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

function bottleVolume(value: unknown): BottleVolumeMl | undefined {
  const parsed = number(value);
  return [4, 6, 8, 9, 10, 12].includes(parsed) ? parsed as BottleVolumeMl : undefined;
}

function manualNotificationFromValue(value: unknown): PatientManualNotification | null {
  const record = objectValue(value);
  if (!text(record.id) || !text(record.title) || !text(record.text)) return null;
  return {
    id: text(record.id),
    icon: text(record.icon, "📣"),
    title: text(record.title),
    text: text(record.text),
    createdAt: text(record.createdAt, new Date().toISOString()),
    createdBy: text(record.createdBy) || undefined,
  };
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
  const status = ["pending", "ready", "signed", "demo"].includes(row.signature_status)
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
    bottleVolumeMl: bottleVolume(content.bottleVolumeMl),
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
  if (error || !data?.clinic_id || data.role !== "secretaria") {
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

export async function loadTeamNotifications(context: SecretaryContext) {
  const { data, error } = await getSupabaseClient().from("team_notifications")
    .select("id, patient_id, title, message, href, created_at, read_at")
    .eq("clinic_id", context.clinicId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row): TeamNotification => ({
    id: text(row.id),
    patientId: text(row.patient_id) || undefined,
    title: text(row.title),
    message: text(row.message),
    href: text(row.href, "/secretaria"),
    createdAt: text(row.created_at),
    readAt: text(row.read_at) || undefined,
  }));
}

export async function markTeamNotificationRead(context: SecretaryContext, notificationId: string) {
  const { error } = await getSupabaseClient().from("team_notifications").update({
    read_at: new Date().toISOString(),
    read_by: context.id,
  }).eq("id", notificationId).eq("clinic_id", context.clinicId);
  if (error) throw error;
}

function paymentFromRow(row: Record<string, unknown>): PatientPaymentRecord {
  return {
    id: text(row.id),
    treatment: /bacteriana|imunobacteriana/i.test(text(row.treatment))
      ? "Imunobacteriana"
      : text(row.treatment) ? "Rinite" : undefined,
    bottlePlanId: text(row.bottle_reference) || undefined,
    additionalBottles: number(row.additional_bottles),
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
    supabase.from("patients").select("*").eq("clinic_id", current.clinicId).is("archived_at", null).neq("status", "laudo").order("created_at", { ascending: false }),
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
      treatmentBottles: patient.treatmentBottles ?? existingTreatment.treatmentBottles ?? [],
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
      billingDocumentType: patient.billingDocumentType ?? text(existingFinancial.billingDocumentType, "cpf"),
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
      treatmentPayments: patient.treatmentPayments ?? existingFinancial.treatmentPayments,
    } as unknown as Record<string, string | number>,
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

  const previousPlans = Array.isArray(objectValue((existing as unknown as MedicalPatientRow).treatment).treatmentBottles)
    ? objectValue((existing as unknown as MedicalPatientRow).treatment).treatmentBottles
    : [];
  if (JSON.stringify(previousPlans) !== JSON.stringify(patient.treatmentBottles ?? [])) {
    void audit(context, "update", "patient_treatment_bottles", patient.id, {
      patientName: patient.name,
      previous: previousPlans,
      current: patient.treatmentBottles ?? [],
    });
  }

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
      treatment: payment.treatment ?? null,
      bottle_reference: payment.bottlePlanId ?? null,
      additional_bottles: Math.max(0, Math.trunc(payment.additionalBottles ?? 0)),
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
  return { patient, hasPatientAccess: Boolean((existing as unknown as MedicalPatientRow).auth_user_id) };
}

export async function saveSecretaryTreatmentFinance(
  context: SecretaryContext,
  patientId: string,
  payment: TreatmentPayment,
) {
  const supabase = getSupabaseClient();
  const { data: patient, error: readError } = await supabase.from("patients")
    .select("financial")
    .eq("id", patientId)
    .eq("clinic_id", context.clinicId)
    .single();
  if (readError || !patient) throw readError ?? new Error("Paciente não encontrado.");

  const financial = objectValue(patient.financial);
  const treatmentPayments = Array.isArray(financial.treatmentPayments)
    ? [...financial.treatmentPayments]
    : [];
  const index = treatmentPayments.findIndex((item) => objectValue(item).treatment === payment.treatment);
  if (index >= 0) treatmentPayments[index] = { ...objectValue(treatmentPayments[index]), ...payment };
  else treatmentPayments.push(payment);

  const { data: saved, error: saveError } = await supabase.from("patients")
    .update({ financial: { ...financial, treatmentPayments }, updated_at: new Date().toISOString() })
    .eq("id", patientId)
    .eq("clinic_id", context.clinicId)
    .select("financial")
    .single();
  if (saveError || !saved) throw saveError ?? new Error("O financeiro não foi gravado. Tente novamente.");
  const persisted = objectValue(saved.financial).treatmentPayments;
  const persistedPayment = Array.isArray(persisted)
    ? persisted.map(objectValue).find((item) => item.treatment === payment.treatment)
    : undefined;
  const valuesToConfirm = Object.entries(payment).filter(([, value]) => value !== undefined);
  const hasAllSavedValues = Boolean(persistedPayment)
    && valuesToConfirm.every(([key, value]) => Object.is(persistedPayment?.[key], value));
  if (!hasAllSavedValues) {
    throw new Error("Não foi possível confirmar o financeiro salvo. Atualize a página antes de tentar novamente.");
  }
  void audit(context, "update", "patient_financial", patientId, { treatment: payment.treatment });
  return persisted as TreatmentPayment[];
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
      cpf: patient.cpf,
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

export async function loadSecretaryPatientOrderHistory(
  patientId: string,
  context?: SecretaryContext,
): Promise<SecretaryPatientOrderHistory[]> {
  const current = context ?? await loadSecretaryContext();
  const { data, error } = await getSupabaseClient()
    .from("patient_order_history")
    .select("id, source_row_number, source_record")
    .eq("clinic_id", current.clinicId)
    .eq("patient_id", patientId)
    .order("source_row_number", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const source = objectValue(row.source_record);
    return {
      id: text(row.id),
      sourceRowNumber: number(row.source_row_number),
      receivedDate: text(source.receivedDate),
      doctor: text(source.doctor),
      phase: text(source.phase),
      formula: text(source.formula),
      bottles: text(source.bottles),
      amount: text(source.amount),
      paymentMethod: text(source.paymentMethod),
      installment: text(source.installment),
    };
  });
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
  const rawStatus = text(row.status).toLowerCase();
  return {
    id: text(row.id),
    number: number(row.bottle_number),
    prescriptionId: text(row.prescription_id) || undefined,
    treatment: text(objectValue(row.metadata).treatment) || undefined,
    receivedAt: text(row.received_at) || undefined,
    startedAt: text(row.started_at),
    finishedAt: text(row.completed_at) || undefined,
    status: row.completed_at || rawStatus === "finalizado"
      ? "finalizado"
      : row.started_at || rawStatus === "em-uso"
        ? "em-uso"
        : "recebido",
  };
}

export async function loadSecretaryPortals(patientIds: string[]) {
  if (!patientIds.length) return {} as Record<string, PatientPortalState>;
  const supabase = getSupabaseClient();
  const patientIdBatchSize = 100;
  const patientIdBatches = Array.from(
    { length: Math.ceil(patientIds.length / patientIdBatchSize) },
    (_, index) => patientIds.slice(index * patientIdBatchSize, (index + 1) * patientIdBatchSize),
  );
  const portalBatches = await Promise.all(patientIdBatches.map(async (patientIdBatch) => {
    const [assessmentResult, bottleResult, contractResult, settingsResult, useResult] = await Promise.all([
      supabase.from("patient_assessments").select("*").in("patient_id", patientIdBatch).order("created_at", { ascending: false }),
      supabase.from("bottles").select("*").in("patient_id", patientIdBatch).order("bottle_number", { ascending: false }),
      supabase.from("patient_contracts").select("*").in("patient_id", patientIdBatch),
      supabase.from("patient_portal_settings").select("*").in("patient_id", patientIdBatch),
      supabase.from("patient_use_records").select("*").in("patient_id", patientIdBatch).order("use_date", { ascending: false }),
    ]);
    if (assessmentResult.error) throw assessmentResult.error;
    if (bottleResult.error) throw bottleResult.error;
    if (contractResult.error) throw contractResult.error;
    if (settingsResult.error) throw settingsResult.error;
    if (useResult.error) throw useResult.error;
    return {
      assessments: assessmentResult.data ?? [],
      bottles: bottleResult.data ?? [],
      contracts: contractResult.data ?? [],
      settings: settingsResult.data ?? [],
      useRecords: useResult.data ?? [],
    };
  }));
  const assessmentRows = portalBatches.flatMap((batch) => batch.assessments);
  const bottleRows = portalBatches.flatMap((batch) => batch.bottles);
  const contractRows = portalBatches.flatMap((batch) => batch.contracts);
  const settingsRows = portalBatches.flatMap((batch) => batch.settings);
  const useRows = portalBatches.flatMap((batch) => batch.useRecords);
  const result = Object.fromEntries(patientIds.map((id) => [id, createDefaultPortalState(id)])) as Record<string, PatientPortalState>;
  for (const row of assessmentRows as unknown as Record<string, unknown>[]) {
    const patientId = text(row.patient_id);
    if (result[patientId]) result[patientId].assessments.push(assessmentFromRow(row));
  }
  for (const row of bottleRows as unknown as Record<string, unknown>[]) {
    const patientId = text(row.patient_id);
    if (!result[patientId]) continue;
    const metadata = objectValue(row.metadata);
    const bottleNumber = number(row.bottle_number);
    if (metadata.manuallyDeleted === true) {
      result[patientId].deletedBottleNumbers = [...new Set([...(result[patientId].deletedBottleNumbers ?? []), bottleNumber])];
      continue;
    }
    result[patientId].bottles.push(bottleFromRow(row));
    const adjustment = objectValue(metadata.historyAdjustment);
    if (Object.keys(adjustment).length) {
      result[patientId].bottleHistoryAdjustments = {
        ...(result[patientId].bottleHistoryAdjustments ?? {}),
        [bottleNumber]: adjustment as PatientPortalState["bottleHistoryAdjustments"] extends Record<number, infer Entry> ? Entry : never,
      };
    }
  }
  for (const row of contractRows as unknown as Record<string, unknown>[]) {
    const patientId = text(row.patient_id);
    if (!result[patientId]) continue;
    result[patientId].signedAt = text(row.signed_at) || undefined;
    result[patientId].signedName = text(row.signed_name) || undefined;
    result[patientId].signedCpf = text(row.signed_cpf) || undefined;
  }
  for (const row of settingsRows as unknown as Record<string, unknown>[]) {
    const patientId = text(row.patient_id);
    if (!result[patientId]) continue;
    const reminders = objectValue(row.reminders);
    result[patientId].reminders = {
      enabled: reminders.enabled === true,
      weekdays: Array.isArray(reminders.weekdays) ? reminders.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [1, 3, 5],
      time: text(reminders.time, "09:00"),
    };
    const byTreatment = objectValue(reminders.byTreatment);
    const treatmentReminders: NonNullable<PatientPortalState["treatmentReminders"]> = {};
    for (const track of ["rinite", "imunobacteriana"] as const) {
      const trackReminder = objectValue(byTreatment[track]);
      if (!Object.keys(trackReminder).length) continue;
      treatmentReminders[track] = {
        enabled: trackReminder.enabled === true,
        weekdays: Array.isArray(trackReminder.weekdays) ? trackReminder.weekdays.map(Number).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6) : [1, 3, 5],
        time: text(trackReminder.time, "09:00"),
      };
    }
    result[patientId].treatmentReminders = treatmentReminders;
    result[patientId].dayOverrides = objectValue(row.day_overrides) as PatientPortalState["dayOverrides"];
    result[patientId].readNotificationIds = Array.isArray(row.read_notification_ids) ? row.read_notification_ids.map(String) : [];
    result[patientId].manualNotifications = Array.isArray(row.manual_notifications)
      ? row.manual_notifications.map(manualNotificationFromValue).filter((item): item is PatientManualNotification => Boolean(item))
      : [];
  }
  for (const row of useRows as unknown as Record<string, unknown>[]) {
    const patientId = text(row.patient_id);
    if (!result[patientId]) continue;
    result[patientId].useRecords.push({
      id: text(row.id),
      bottleId: text(row.bottle_id),
      date: text(row.use_date),
      registeredAt: text(row.registered_at),
      drops: number(row.drops, 6),
    });
  }
  return result;
}

export async function loadSecretaryNotifications(patientIds: string[]) {
  if (!patientIds.length) return {} as Record<string, PatientManualNotification[]>;
  const { data, error } = await getSupabaseClient()
    .from("patient_portal_settings")
    .select("patient_id, manual_notifications")
    .in("patient_id", patientIds);
  if (error) throw error;
  return Object.fromEntries(patientIds.map((patientId) => {
    const row = (data ?? []).find((item) => text(item.patient_id) === patientId) as Record<string, unknown> | undefined;
    const values = Array.isArray(row?.manual_notifications)
      ? row.manual_notifications.map(manualNotificationFromValue).filter((item): item is PatientManualNotification => Boolean(item))
      : [];
    return [patientId, values];
  })) as Record<string, PatientManualNotification[]>;
}

export async function createSecretaryNotification(
  context: SecretaryContext,
  patientIds: string[],
  input: { icon: string; title: string; text: string },
) {
  const uniquePatientIds = Array.from(new Set(patientIds.filter(Boolean)));
  if (!uniquePatientIds.length) throw new Error("Selecione pelo menos um paciente.");
  if (!input.title.trim() || !input.text.trim()) throw new Error("Informe o título e o texto da notificação.");
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("patient_portal_settings")
    .select("patient_id, reminders, day_overrides, read_notification_ids, manual_notifications")
    .in("patient_id", uniquePatientIds)
    .eq("clinic_id", context.clinicId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const now = new Date().toISOString();
  const notificationBase = {
    icon: input.icon.trim() || "📣",
    title: input.title.trim(),
    text: input.text.trim(),
    createdAt: now,
    createdBy: context.fullName,
  };
  for (const patientId of uniquePatientIds) {
    const current = rows.find((row) => text(row.patient_id) === patientId);
    const notifications = Array.isArray(current?.manual_notifications)
      ? current.manual_notifications.map(manualNotificationFromValue).filter((item): item is PatientManualNotification => Boolean(item))
      : [];
    const notification = { id: crypto.randomUUID(), ...notificationBase };
    const { error: saveError } = await supabase.from("patient_portal_settings").upsert({
      patient_id: patientId,
      clinic_id: context.clinicId,
      reminders: objectValue(current?.reminders).enabled !== undefined ? objectValue(current?.reminders) : { enabled: false, weekdays: [1, 3, 5], time: "09:00" },
      day_overrides: objectValue(current?.day_overrides),
      read_notification_ids: Array.isArray(current?.read_notification_ids) ? current?.read_notification_ids : [],
      manual_notifications: [...notifications, notification],
      updated_at: now,
    }, { onConflict: "patient_id" });
    if (saveError) throw saveError;
    void audit(context, "create", "patient_notification", patientId, { title: notification.title });
  }
  return notificationBase;
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
    volume_ml: adjustment.bottleVolumeMl ?? null,
    metadata: {
      ...objectValue(data.metadata),
      phase: adjustment.phase ?? text(objectValue(data.metadata).phase),
      bottleVolumeMl: adjustment.bottleVolumeMl ?? null,
      formulas: adjustment.formulas ?? objectValue(data.metadata).formulas ?? [],
      historyAdjustment: adjustment,
    },
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
    bottleVolumeMl: bottleVolume(row.bottle_volume_ml) ?? bottleVolume(metadata.bottleVolumeMl),
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
    laboratoryOkAt: savedBatch.laboratoryOkAt,
    laboratoryOkBy: savedBatch.laboratoryOkBy,
    externalReceivedAt: savedBatch.externalReceivedAt,
    externalLaboratory: savedBatch.externalLaboratory,
    orderType: savedBatch.orderType,
    indication: savedBatch.indication,
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
      bottle_volume_ml: item.bottleVolumeMl ?? null,
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
    bottleNumber: number(row.bottle_number) || undefined,
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
    bottleVolumeMl: bottleVolume(row.volume_ml) ?? bottleVolume(metadata.bottleVolumeMl),
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
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((row) => objectValue(row.metadata).manuallyDeleted !== true)
    .map(stockFromRow);
}

export async function saveSecretaryStockItem(context: SecretaryContext, item: DemoStockItem, previousBottleCount = 0) {
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
    bottleNumber = existingNumber || Math.max(number(latestResult.data?.bottle_number, 0), previousBottleCount) + 1;
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
    volume_ml: item.bottleVolumeMl ?? null,
    reserved_at: item.reservedAt ?? null,
    delivered_at: item.deliveredAt ?? null,
    checked_by: item.checkedBy,
    metadata: { ...item, id },
  });
  if (error) throw error;
  return { ...item, id, bottleNumber };
}

export async function deleteSecretaryManualBottle(
  context: SecretaryContext,
  patientId: string,
  bottleId: string,
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("bottles")
    .select("id, bottle_number, metadata")
    .eq("id", bottleId)
    .eq("patient_id", patientId)
    .eq("clinic_id", context.clinicId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Frasco não encontrado.");
  const metadata = objectValue(data.metadata);
  if (text(metadata.batchCode) !== "ADICIONADO MANUALMENTE") {
    throw new Error("Somente frascos registrados manualmente podem ser excluídos por esta ação.");
  }
  const deletedAt = new Date().toISOString();
  const { error: updateError } = await supabase.from("bottles").update({
    metadata: { ...metadata, manuallyDeleted: true, manuallyDeletedAt: deletedAt, manuallyDeletedBy: context.fullName },
  }).eq("id", bottleId).eq("patient_id", patientId).eq("clinic_id", context.clinicId);
  if (updateError) throw updateError;
  void audit(context, "delete_manual", "bottle", bottleId, { patientId, bottleNumber: number(data.bottle_number), deletedAt });
  return { bottleNumber: number(data.bottle_number) };
}

export async function confirmSecretaryBatch(
  context: SecretaryContext,
  batch: DemoBatch,
  checkedBy: string,
  conferenceNotes: string,
  patients: DemoPatientRecord[],
) {
  if (batch.status !== "pronto") throw new Error("Este lote já foi conferido ou ainda não está pronto.");
  if (batch.indication === "bacteriana" && !batch.externalReceivedAt) {
    throw new Error("Registre a data de recebimento do laboratório externo antes de lançar a Imunobacteriana no estoque.");
  }
  if (batch.indication !== "bacteriana" && (!batch.laboratoryOkAt || !batch.laboratoryOkBy)) {
    throw new Error("Aguarde o OK do laboratório antes de liberar o lote para estoque.");
  }
  const checkedIds = new Set(batch.checkedPrescriptionIds ?? []);
  if (!batch.items.length || batch.items.some((item) => !checkedIds.has(item.prescriptionId))) {
    throw new Error("Confira todos os itens antes de liberar o lote para estoque.");
  }
  if (!checkedBy.trim()) throw new Error("Informe o responsável pela conferência do lote.");
  // Para Imunobacteriana, registra a data real de chegada do laboratório
  // externo; nos demais fluxos vale o momento da conferência.
  const receivedAt = batch.externalReceivedAt ?? new Date().toISOString();
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
      bottleVolumeMl: item.bottleVolumeMl,
      formulas: item.formulas,
      delivery: patient?.delivery,
      laboratory: batch.laboratory,
      receivedAt,
      checkedBy: checkedBy.trim(),
      status: "disponivel",
      paymentConfirmedAt: item.paymentConfirmedAt,
      asaasConfirmedAt: item.asaasConfirmedAt,
      additionalPaidBottles: item.additionalPaidBottles,
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
    assignmentStatus: text(row.assignment_status) === "em_analise" ? "em_analise" : text(row.assignment_status) === "pendente" ? "pendente" : "vinculada",
  }));
}

export async function saveSecretaryInvoice(context: SecretaryContext, invoice: DemoInvoice) {
  const { error } = await getSupabaseClient().from("invoice_documents").insert({
    id: isUuid(invoice.id) ? invoice.id : undefined,
    clinic_id: context.clinicId,
    patient_id: isUuid(invoice.patientId) ? invoice.patientId : null,
    patient_name: invoice.patientName,
    patient_cpf: invoice.patientCpf,
    file_name: invoice.fileName,
    file_data: invoice.fileData,
    file_size: invoice.fileSize,
    uploaded_by: invoice.uploadedBy,
    assignment_status: invoice.assignmentStatus ?? "vinculada",
  });
  if (error) throw error;
  void audit(context, "upload", "invoice", invoice.id, { patientId: invoice.patientId, fileName: invoice.fileName });
  return invoice;
}

export async function confirmSecretaryInvoice(context: SecretaryContext, invoiceId: string) {
  const { error } = await getSupabaseClient().from("invoice_documents")
    .update({ assignment_status: "vinculada" })
    .eq("id", invoiceId)
    .eq("clinic_id", context.clinicId);
  if (error) throw error;
  void audit(context, "confirm", "invoice", invoiceId);
}

export async function assignSecretaryInvoice(context: SecretaryContext, invoiceId: string, patient: Pick<DemoPatientRecord, "id" | "name" | "cpf">) {
  const { error } = await getSupabaseClient().from("invoice_documents").update({
    patient_id: patient.id,
    patient_name: patient.name,
    patient_cpf: patient.cpf,
    assignment_status: "vinculada",
  }).eq("id", invoiceId).eq("clinic_id", context.clinicId);
  if (error) throw error;
  void audit(context, "assign", "invoice", invoiceId, { patientId: patient.id });
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
  const supabase = getSupabaseClient();
  const [profilesResult, patientsResult, securityResult] = await Promise.all([
    supabase.from("profiles")
      .select("id, full_name, role, username, crm, specialty, access_status, created_at, last_login_at, deactivated_at, deactivation_reason")
      .eq("clinic_id", current.clinicId)
      .order("full_name"),
    supabase.from("patients")
      .select("id, auth_user_id, full_name, cpf, username, access_status, created_at, last_login_at, deactivated_at, deactivation_reason")
      .eq("clinic_id", current.clinicId)
      .is("archived_at", null)
      .order("full_name"),
    supabase.from("login_security")
      .select("user_id, failed_attempts, locked_at")
      .eq("clinic_id", current.clinicId),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (patientsResult.error) throw patientsResult.error;
  // A tela continua funcionando antes da migration, apenas sem a informação de bloqueio.
  const securityByUser = new Map((securityResult.data ?? []).map((row) => [String(row.user_id), row]));
  const profiles = (profilesResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.full_name),
    username: String(row.username ?? ""),
    role: String(row.role),
    crm: row.crm ? String(row.crm) : undefined,
    specialty: row.specialty ? String(row.specialty) : undefined,
    accountType: "equipe" as const,
    accessStatus: String(row.access_status ?? "ativo"),
    createdAt: String(row.created_at ?? ""),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : undefined,
    deactivatedAt: row.deactivated_at ? String(row.deactivated_at) : undefined,
    deactivationReason: row.deactivation_reason ? String(row.deactivation_reason) : undefined,
  }));
  const patients = (patientsResult.data ?? [])
    .filter((row) => Boolean(row.auth_user_id))
    .map((row) => {
      const security = securityByUser.get(String(row.auth_user_id));
      return {
        id: String(row.auth_user_id),
        patientId: String(row.id),
        name: String(row.full_name),
        username: String(row.username ?? row.cpf ?? ""),
        role: "paciente",
        accountType: "paciente" as const,
        accessStatus: String(row.access_status ?? (security?.locked_at ? "bloqueado" : "ativo")),
        createdAt: String(row.created_at ?? ""),
        lastLoginAt: row.last_login_at ? String(row.last_login_at) : undefined,
        deactivatedAt: row.deactivated_at ? String(row.deactivated_at) : undefined,
        deactivationReason: row.deactivation_reason ? String(row.deactivation_reason) : undefined,
        failedAttempts: Number(security?.failed_attempts ?? 0),
      };
    });
  return [...profiles, ...patients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export type SecretaryPatientRecord = {
  id: string;
  name: string;
  cpf: string;
  createdAt: string;
  responsible: string;
  archivedAt?: string;
  archiveReason?: string;
};

export async function loadSecretaryPatientRecords(context?: SecretaryContext): Promise<SecretaryPatientRecord[]> {
  const current = context ?? await loadSecretaryContext();
  const supabase = getSupabaseClient();
  type PatientRow = { id: string; full_name: string; cpf: string; created_at: string; archived_at: string | null; archive_reason: string | null; doctor_profile_id: string | null; nursing_profile_id: string | null };
  const activeRows: PatientRow[] = [];
  const archivedRows: PatientRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("patients")
      .select("id, full_name, cpf, created_at, archived_at, archive_reason, doctor_profile_id, nursing_profile_id")
      .eq("clinic_id", current.clinicId)
      .is("archived_at", null)
      .order("full_name")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as PatientRow[];
    activeRows.push(...page);
    if (page.length < pageSize) break;
  }

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.rpc("secretary_list_archived_patients", {}).range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as PatientRow[];
    archivedRows.push(...page);
    if (page.length < pageSize) break;
  }

  const { data: profileRows, error: profileError } = await supabase.from("profiles")
    .select("id, full_name, role")
    .eq("clinic_id", current.clinicId);
  if (profileError) throw profileError;
  const profileById = new Map((profileRows ?? []).map((profile) => [profile.id, profile]));

  return [...activeRows, ...archivedRows].map((row) => ({
    id: String(row.id),
    name: String(row.full_name ?? "Paciente sem nome"),
    cpf: String(row.cpf ?? ""),
    createdAt: String(row.created_at ?? ""),
    responsible: [
      row.doctor_profile_id ? `Médico · ${profileById.get(row.doctor_profile_id)?.full_name ?? "sem vínculo"}` : null,
      row.nursing_profile_id ? `Enfermagem · ${profileById.get(row.nursing_profile_id)?.full_name ?? "sem vínculo"}` : null,
    ].filter(Boolean).join(" · ") || "Sem profissional vinculado",
    archivedAt: row.archived_at ? String(row.archived_at) : undefined,
    archiveReason: row.archive_reason ? String(row.archive_reason) : undefined,
  }));
}

export async function archiveSecretaryPatient(context: SecretaryContext, patientId: string, reason: string) {
  const { error } = await getSupabaseClient().rpc("secretary_archive_patient", { p_patient_id: patientId, p_reason: reason.trim() });
  if (error) throw error;
  await audit(context, "archive", "patient", patientId, { reason: reason.trim() });
}

export async function restoreSecretaryPatient(context: SecretaryContext, patientId: string) {
  const { error } = await getSupabaseClient().rpc("secretary_restore_patient", { p_patient_id: patientId });
  if (error) throw error;
  await audit(context, "restore", "patient", patientId);
}

export async function permanentlyDeleteSecretaryPatient(patientId: string, confirmation: string) {
  const { error } = await getSupabaseClient().rpc("secretary_delete_patient_if_empty", {
    p_patient_id: patientId,
    p_confirmation: confirmation,
  });
  if (error) throw error;
}
