import type {
  DemoInvoice,
  DemoPatientRecord,
  DemoPrescription,
  PrescriptionFormula,
} from "../../app/medico/patient-store";
import type {
  PatientAssessment,
  PatientBottle,
  PatientPortalState,
  PatientReminderSettings,
  PatientManualNotification,
} from "../../app/paciente/patient-portal-store";
import { createDefaultPortalState } from "../../app/paciente/patient-portal-store";
import { mapMedicalPatient, type MedicalPatientRow } from "./medical-records";
import { getSupabaseClient } from "./client";

export type PatientContext = {
  id: string;
  patientId: string;
  clinicId: string;
  fullName: string;
  cpf: string;
};

export type PatientWorkspace = {
  context: PatientContext;
  patient: DemoPatientRecord;
  portal: PatientPortalState;
  prescriptions: DemoPrescription[];
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

function validReminderSettings(value: unknown): PatientReminderSettings {
  const record = objectValue(value);
  const weekdays = Array.isArray(record.weekdays)
    ? record.weekdays.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    : [1, 3, 5];
  return {
    enabled: record.enabled === true,
    weekdays: Array.from(new Set(weekdays)).sort((first, second) => first - second),
    time: /^\d{2}:\d{2}$/.test(text(record.time)) ? text(record.time) : "09:00",
  };
}

function prescriptionFromRow(row: Record<string, unknown>): DemoPrescription {
  const content = objectValue(row.content);
  const formulas = Array.isArray(content.formulas)
    ? content.formulas.filter((item) => item && typeof item === "object") as PrescriptionFormula[]
    : [];
  const status = ["pending", "ready", "signed"].includes(text(row.signature_status))
    ? text(row.signature_status) as DemoPrescription["signatureStatus"]
    : "pending";
  return {
    id: text(row.id),
    patientId: text(row.patient_id),
    doctor: text(content.doctor, "Médico responsável"),
    doctorCrm: text(content.doctorCrm),
    createdAt: text(row.created_at),
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

function bottleFromRow(row: Record<string, unknown>): PatientBottle {
  const completedAt = text(row.completed_at) || undefined;
  const startedAt = text(row.started_at) || undefined;
  const rawStatus = text(row.status).toLowerCase();
  const status: PatientBottle["status"] = completedAt || rawStatus === "finalizado"
    ? "finalizado"
    : startedAt || rawStatus === "em-uso"
      ? "em-uso"
      : "recebido";
  return {
    id: text(row.id),
    number: number(row.bottle_number, 1),
    receivedAt: text(row.received_at) || undefined,
    startedAt: startedAt ?? text(row.received_at, text(row.created_at)),
    finishedAt: completedAt,
    status,
  };
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

async function loadPatientIdentity(): Promise<{ context: PatientContext; row: MedicalPatientRow }> {
  const supabase = getSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sessão do paciente não encontrada.");
  const { data, error } = await supabase.from("patients")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Este acesso ainda não está vinculado a um paciente.");
  const row = data as unknown as MedicalPatientRow;
  return {
    row,
    context: {
      id: user.id,
      patientId: row.id,
      clinicId: row.clinic_id,
      fullName: row.full_name,
      cpf: row.cpf,
    },
  };
}

export async function loadPatientWorkspace(): Promise<PatientWorkspace> {
  const { context, row } = await loadPatientIdentity();
  const supabase = getSupabaseClient();
  const doctorPromise = row.doctor_profile_id
    ? supabase.from("profiles").select("id, full_name, crm").eq("id", row.doctor_profile_id).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [doctorResult, prescriptionResult, invoiceResult, bottleResult, assessmentResult, contractResult, settingsResult, useResult] = await Promise.all([
    doctorPromise,
    supabase.from("prescriptions").select("*").eq("patient_id", row.id).order("created_at", { ascending: false }),
    supabase.from("invoice_documents").select("*").eq("patient_id", row.id).order("created_at", { ascending: false }),
    supabase.from("bottles").select("*").eq("patient_id", row.id).order("bottle_number", { ascending: false }),
    supabase.from("patient_assessments").select("*").eq("patient_id", row.id).order("created_at", { ascending: false }),
    supabase.from("patient_contracts").select("*").eq("patient_id", row.id).maybeSingle(),
    supabase.from("patient_portal_settings").select("*").eq("patient_id", row.id).maybeSingle(),
    supabase.from("patient_use_records").select("*").eq("patient_id", row.id).order("use_date", { ascending: false }),
  ]);
  for (const result of [doctorResult, prescriptionResult, invoiceResult, bottleResult, assessmentResult, contractResult, settingsResult, useResult]) {
    if (result.error) throw result.error;
  }
  const doctor = doctorResult.data as { full_name?: string; crm?: string | null } | null;
  const patient = mapMedicalPatient(row, doctor?.full_name ?? "Médico não vinculado");
  const portal = createDefaultPortalState(row.id);
  portal.bottles = ((bottleResult.data ?? []) as unknown as Record<string, unknown>[]).map(bottleFromRow);
  portal.assessments = ((assessmentResult.data ?? []) as unknown as Record<string, unknown>[]).map(assessmentFromRow);
  portal.useRecords = ((useResult.data ?? []) as unknown as Record<string, unknown>[]).map((item) => ({
    id: text(item.id),
    bottleId: text(item.bottle_id),
    date: text(item.use_date),
    registeredAt: text(item.registered_at),
    drops: number(item.drops, patient.drops ?? 6),
  }));
  const settings = (settingsResult.data ?? null) as Record<string, unknown> | null;
  if (settings) {
    portal.reminders = validReminderSettings(settings.reminders);
    portal.dayOverrides = objectValue(settings.day_overrides) as PatientPortalState["dayOverrides"];
    portal.readNotificationIds = Array.isArray(settings.read_notification_ids)
      ? settings.read_notification_ids.map(String)
      : [];
    portal.manualNotifications = Array.isArray(settings.manual_notifications)
      ? settings.manual_notifications.map(manualNotificationFromValue).filter((item): item is PatientManualNotification => Boolean(item))
      : [];
  }
  const contract = (contractResult.data ?? null) as Record<string, unknown> | null;
  if (contract) {
    portal.signedAt = text(contract.signed_at) || undefined;
    portal.signedName = text(contract.signed_name) || undefined;
    portal.signedCpf = text(contract.signed_cpf) || undefined;
  }
  const prescriptions = ((prescriptionResult.data ?? []) as unknown as Record<string, unknown>[]).map(prescriptionFromRow);
  const invoices = ((invoiceResult.data ?? []) as unknown as Record<string, unknown>[]).map((item): DemoInvoice => ({
    id: text(item.id),
    patientId: text(item.patient_id),
    patientName: text(item.patient_name, patient.name),
    patientCpf: text(item.patient_cpf, patient.cpf),
    fileName: text(item.file_name),
    fileData: text(item.file_data),
    fileSize: number(item.file_size),
    uploadedAt: text(item.created_at),
    uploadedBy: text(item.uploaded_by),
  }));
  return { context, patient, portal, prescriptions, invoices };
}

async function savePortalSettings(context: PatientContext, state: PatientPortalState) {
  const { error } = await getSupabaseClient().from("patient_portal_settings").upsert({
    patient_id: context.patientId,
    clinic_id: context.clinicId,
    reminders: state.reminders,
    day_overrides: state.dayOverrides ?? {},
    read_notification_ids: state.readNotificationIds ?? [],
    manual_notifications: state.manualNotifications ?? [],
    updated_at: new Date().toISOString(),
  }, { onConflict: "patient_id" });
  if (error) throw error;
}

async function savePortalBottles(context: PatientContext, state: PatientPortalState) {
  const supabase = getSupabaseClient();
  for (const bottle of state.bottles) {
    const payload = {
      clinic_id: context.clinicId,
      patient_id: context.patientId,
      bottle_number: bottle.number,
      received_at: bottle.receivedAt ?? null,
      started_at: bottle.status === "em-uso" || bottle.status === "finalizado" ? bottle.startedAt : null,
      completed_at: bottle.finishedAt ?? null,
      status: bottle.status,
    };
    const { data: existing, error: readError } = await supabase.from("bottles").select("id").eq("id", bottle.id).eq("patient_id", context.patientId).maybeSingle();
    if (readError) throw readError;
    const result = existing
      ? await supabase.from("bottles").update(payload).eq("id", bottle.id).eq("patient_id", context.patientId)
      : await supabase.from("bottles").insert({ id: isUuid(bottle.id) ? bottle.id : undefined, ...payload });
    if (result.error) throw result.error;
  }
}

async function savePortalUses(context: PatientContext, state: PatientPortalState) {
  const supabase = getSupabaseClient();
  const { data: existing, error: readError } = await supabase.from("patient_use_records").select("id").eq("patient_id", context.patientId);
  if (readError) throw readError;
  const desiredIds = new Set(state.useRecords.map((record) => record.id).filter(isUuid));
  const removed = (existing ?? []).map((item) => String(item.id)).filter((id) => !desiredIds.has(id));
  if (removed.length) {
    const { error } = await supabase.from("patient_use_records").delete().in("id", removed).eq("patient_id", context.patientId);
    if (error) throw error;
  }
  for (const record of state.useRecords) {
    const payload = {
      id: isUuid(record.id) ? record.id : undefined,
      clinic_id: context.clinicId,
      patient_id: context.patientId,
      bottle_id: isUuid(record.bottleId) ? record.bottleId : null,
      use_date: record.date,
      registered_at: record.registeredAt || new Date().toISOString(),
      drops: record.drops,
    };
    const { error } = await supabase.from("patient_use_records").upsert(payload, { onConflict: "patient_id,use_date" });
    if (error) throw error;
  }
}

async function savePortalAssessments(context: PatientContext, state: PatientPortalState) {
  const supabase = getSupabaseClient();
  for (const assessment of state.assessments) {
    const payload = {
      id: isUuid(assessment.id) ? assessment.id : undefined,
      clinic_id: context.clinicId,
      patient_id: context.patientId,
      bottle_reference: assessment.bottleId || null,
      bottle_number: assessment.bottleNumber,
      feeling: assessment.feeling ?? null,
      frequency: assessment.symptomFrequency ?? null,
      severity: assessment.symptomSeverity ?? null,
      medication_frequency: assessment.medicationFrequency ?? null,
      comment: assessment.notes,
      viewed_at: assessment.viewedAt ?? null,
      viewed_by: assessment.viewedBy ?? null,
      response: assessment.response ?? null,
      responded_at: assessment.respondedAt ?? null,
      responded_by: assessment.respondedBy ?? null,
      created_at: assessment.createdAt || new Date().toISOString(),
    };
    const { error } = await supabase.from("patient_assessments").upsert(payload);
    if (error) throw error;
  }
}

async function savePortalContract(context: PatientContext, state: PatientPortalState) {
  if (!state.signedAt) return;
  const { error } = await getSupabaseClient().from("patient_contracts").upsert({
    clinic_id: context.clinicId,
    patient_id: context.patientId,
    signed_at: state.signedAt,
    signed_name: state.signedName ?? context.fullName,
    signed_cpf: state.signedCpf ?? context.cpf,
    updated_at: new Date().toISOString(),
  }, { onConflict: "patient_id" });
  if (error) throw error;
}

export async function savePatientPortalState(state: PatientPortalState) {
  const { context } = await loadPatientIdentity();
  if (context.patientId !== state.patientId) throw new Error("O paciente da sessão não corresponde ao registro carregado.");
  await Promise.all([
    savePortalSettings(context, state),
    savePortalBottles(context, state),
    savePortalUses(context, state),
    savePortalAssessments(context, state),
    savePortalContract(context, state),
  ]);
  return state;
}
