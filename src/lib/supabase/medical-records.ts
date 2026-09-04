import type {
  DemoPatientRecord,
  DemoPrescription,
  MedicalRecord,
} from "../../app/medico/patient-store";
import type {
  PatientAssessment,
  PatientBottle,
  PatientPortalState,
} from "../../app/paciente/patient-portal-store";
import { createDefaultPortalState } from "../../app/paciente/patient-portal-store";
import { getSupabaseClient } from "./client";

export type MedicalDoctorProfile = {
  id: string;
  clinicId: string;
  fullName: string;
  crm: string;
  specialty: string;
};

export type MedicalPatientRow = {
  id: string;
  clinic_id: string;
  auth_user_id: string | null;
  username: string | null;
  full_name: string;
  cpf: string;
  birth_date: string;
  phone: string | null;
  email: string | null;
  status: string;
  doctor_profile_id: string | null;
  address: Record<string, unknown> | null;
  treatment: Record<string, unknown> | null;
  financial: Record<string, unknown> | null;
  created_at: string;
};

type PrescriptionRow = {
  id: string;
  patient_id: string;
  content: Record<string, unknown> | null;
  signature_status: string;
  created_at: string;
};

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function numberValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validStatus(value: string): DemoPatientRecord["status"] {
  const statuses: DemoPatientRecord["status"][] = [
    "com-pedido",
    "em-conversa",
    "ativo",
    "bacteriana",
    "tentar-novamente",
    "perdido",
    "concluido",
    "desistente",
  ];

  return statuses.includes(value as DemoPatientRecord["status"])
    ? value as DemoPatientRecord["status"]
    : "em-conversa";
}

function validDelivery(value?: string): DemoPatientRecord["delivery"] {
  return ["Motoboy", "Retirada", "Sedex", "Aéreo"].includes(value ?? "")
    ? value as DemoPatientRecord["delivery"]
    : undefined;
}

function validPaymentStatus(value?: string): DemoPatientRecord["paymentStatus"] {
  return ["A definir", "Pendente", "Em dia", "Vencido", "Cancelado"].includes(value ?? "")
    ? value as DemoPatientRecord["paymentStatus"]
    : undefined;
}

export function mapMedicalPatient(
  row: MedicalPatientRow,
  doctorName: string,
): DemoPatientRecord {
  const address = recordValue(row.address);
  const treatment = recordValue(row.treatment);
  const financial = recordValue(row.financial);
  const hasSecretaryData = Boolean(
    row.auth_user_id ||
    row.username ||
    row.email ||
    stringValue(address, "street") ||
    stringValue(address, "city") ||
    stringValue(financial, "acquisitionMethod"),
  );
  const registrationStatus: DemoPatientRecord["registrationStatus"] = hasSecretaryData
    ? "completed"
    : "pending-secretary";

  return {
    id: row.id,
    username: row.username ?? undefined,
    name: row.full_name,
    cpf: row.cpf,
    birthDate: row.birth_date,
    doctor: doctorName,
    createdAt: row.created_at,
    registrationStatus,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    zipCode: stringValue(address, "zipCode"),
    street: stringValue(address, "street"),
    addressNumber: stringValue(address, "number") ?? stringValue(address, "addressNumber"),
    addressComplement: stringValue(address, "complement") ?? stringValue(address, "addressComplement"),
    neighborhood: stringValue(address, "neighborhood"),
    city: stringValue(address, "city"),
    state: stringValue(address, "state"),
    deliveryNotes: stringValue(address, "deliveryNotes"),
    billingName: stringValue(financial, "billingName"),
    billingCpf: stringValue(financial, "billingCpf"),
    treatment: stringValue(treatment, "name") ?? stringValue(treatment, "treatment"),
    startDate: stringValue(treatment, "startDate"),
    totalMonths: numberValue(treatment, "totalMonths"),
    lastReceivedDate: stringValue(treatment, "lastReceivedDate"),
    bottlesReceived: numberValue(treatment, "bottlesReceived"),
    drops: numberValue(treatment, "drops"),
    phase: stringValue(treatment, "phase"),
    delivery: validDelivery(stringValue(treatment, "delivery") ?? stringValue(address, "delivery")),
    status: registrationStatus === "pending-secretary" && row.status === "em-conversa"
      ? "com-pedido"
      : validStatus(row.status),
    acquisitionMethod: stringValue(financial, "acquisitionMethod"),
    agreedCondition: stringValue(financial, "agreedCondition") as DemoPatientRecord["agreedCondition"],
    methodSnapshotId: stringValue(financial, "methodSnapshotId"),
    methodSnapshotVersion: numberValue(financial, "methodSnapshotVersion"),
    discountAmount: numberValue(financial, "discountAmount"),
    paymentMethod: stringValue(financial, "paymentMethod"),
    paymentInstallments: numberValue(financial, "installments") ?? numberValue(financial, "paymentInstallments"),
    installmentValue: numberValue(financial, "installmentValue"),
    contractValue: numberValue(financial, "contractValue"),
    paymentDueDate: stringValue(financial, "dueDate") ?? stringValue(financial, "paymentDueDate"),
    paymentStatus: validPaymentStatus(stringValue(financial, "paymentStatus")),
    asaasReference: stringValue(financial, "asaasReference"),
    financialNotes: stringValue(financial, "notes") ?? stringValue(financial, "financialNotes"),
    medicalRecord: (() => {
      const record = recordValue(treatment.medicalRecord);
      return Object.keys(record).length ? {
        chiefComplaint: stringValue(record, "chiefComplaint"),
        history: stringValue(record, "history"),
        allergies: stringValue(record, "allergies"),
        currentMedications: stringValue(record, "currentMedications"),
        clinicalNotes: stringValue(record, "clinicalNotes"),
        updatedAt: stringValue(record, "updatedAt"),
        updatedBy: stringValue(record, "updatedBy"),
      } : undefined;
    })(),
    notes: stringValue(treatment, "notes"),
    abandonmentReason: stringValue(treatment, "abandonmentReason"),
  };
}

function mapPrescription(
  row: PrescriptionRow,
  doctor: MedicalDoctorProfile,
): DemoPrescription {
  const content = recordValue(row.content);
  const formulas = Array.isArray(content.formulas)
    ? content.formulas.filter((item) => item && typeof item === "object") as DemoPrescription["formulas"]
    : [];
  const status = ["pending", "ready", "signed"].includes(row.signature_status)
    ? row.signature_status as DemoPrescription["signatureStatus"]
    : "pending";

  return {
    id: row.id,
    patientId: row.patient_id,
    doctor: stringValue(content, "doctor") ?? doctor.fullName,
    doctorCrm: stringValue(content, "doctorCrm") ?? doctor.crm,
    createdAt: row.created_at,
    treatment: stringValue(content, "treatment") ?? "Imunoterapia para rinite",
    phase: stringValue(content, "phase") ?? "",
    bottles: numberValue(content, "bottles") ?? 1,
    drops: numberValue(content, "drops") ?? 6,
    frequency: stringValue(content, "frequency") ?? "3 vezes por semana",
    posology: stringValue(content, "posology") ?? "",
    formulas,
    notes: stringValue(content, "notes") ?? "",
    signatureStatus: status,
    signaturePreparedAt: stringValue(content, "signaturePreparedAt"),
    signaturePreparedBy: stringValue(content, "signaturePreparedBy"),
  };
}

export async function loadCurrentDoctorProfile(): Promise<MedicalDoctorProfile> {
  const supabase = getSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sessão médica não encontrada.");

  const { data, error } = await supabase
    .from("profiles")
    .select("id, clinic_id, role, full_name, crm, specialty")
    .eq("id", user.id)
    .single();
  if (error || !data || data.role !== "medico" || !data.clinic_id) {
    throw new Error("Este acesso não pertence a um médico.");
  }

  return {
    id: data.id,
    clinicId: data.clinic_id,
    fullName: data.full_name,
    crm: data.crm ?? "",
    specialty: data.specialty ?? "Especialidade não informada",
  };
}

export async function loadDoctorPatients(doctor: MedicalDoctorProfile) {
  const { data, error } = await getSupabaseClient()
    .from("patients")
    .select("*")
    .eq("clinic_id", doctor.clinicId)
    .eq("doctor_profile_id", doctor.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as MedicalPatientRow[]).map((row) =>
    mapMedicalPatient(row, doctor.fullName),
  );
}

export async function loadDoctorPortalStates(
  doctor: MedicalDoctorProfile,
  patientIds: string[],
) {
  if (!patientIds.length) return {} as Record<string, PatientPortalState>;

  const supabase = getSupabaseClient();
  const [assessmentResult, bottleResult, settingsResult, useResult] = await Promise.all([
    supabase.from("patient_assessments").select("*").in("patient_id", patientIds).order("created_at", { ascending: false }),
    supabase.from("bottles").select("*").in("patient_id", patientIds).order("bottle_number", { ascending: false }),
    supabase.from("patient_portal_settings").select("*").in("patient_id", patientIds),
    supabase.from("patient_use_records").select("*").in("patient_id", patientIds).order("use_date", { ascending: false }),
  ]);
  if (assessmentResult.error) throw assessmentResult.error;
  if (bottleResult.error) throw bottleResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (useResult.error) throw useResult.error;

  const result = Object.fromEntries(patientIds.map((id) => [id, createDefaultPortalState(id)])) as Record<string, PatientPortalState>;
  for (const row of (assessmentResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const patientId = String(row.patient_id ?? "");
    if (!result[patientId]) continue;
    result[patientId].assessments.push({
      id: String(row.id),
      bottleId: String(row.bottle_reference ?? ""),
      bottleNumber: Number(row.bottle_number ?? 0),
      feeling: row.feeling as PatientAssessment["feeling"],
      symptomFrequency: row.frequency as PatientAssessment["symptomFrequency"],
      symptomSeverity: row.severity as PatientAssessment["symptomSeverity"],
      medicationFrequency: row.medication_frequency as PatientAssessment["medicationFrequency"],
      notes: typeof row.comment === "string" ? row.comment : "",
      createdAt: String(row.created_at ?? ""),
      viewedAt: typeof row.viewed_at === "string" ? row.viewed_at : undefined,
      viewedBy: typeof row.viewed_by === "string" ? row.viewed_by : undefined,
      response: typeof row.response === "string" ? row.response : undefined,
      respondedAt: typeof row.responded_at === "string" ? row.responded_at : undefined,
      respondedBy: typeof row.responded_by === "string" ? row.responded_by : undefined,
    });
  }
  for (const row of (bottleResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const patientId = String(row.patient_id ?? "");
    if (!result[patientId]) continue;
    const rawStatus = String(row.status ?? "").toLowerCase();
    result[patientId].bottles.push({
      id: String(row.id),
      number: Number(row.bottle_number ?? 0),
      receivedAt: typeof row.received_at === "string" ? row.received_at : undefined,
      startedAt: typeof row.started_at === "string" ? row.started_at : String(row.received_at ?? row.created_at ?? ""),
      finishedAt: typeof row.completed_at === "string" ? row.completed_at : undefined,
      status: row.completed_at || rawStatus === "finalizado"
        ? "finalizado"
        : row.started_at || rawStatus === "em-uso"
          ? "em-uso"
          : "recebido",
    });
  }
  for (const row of (settingsResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const patientId = String(row.patient_id ?? "");
    if (!result[patientId]) continue;
    const reminders = recordValue(row.reminders);
    result[patientId].reminders = {
      enabled: reminders.enabled === true,
      weekdays: Array.isArray(reminders.weekdays)
        ? reminders.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [1, 3, 5],
      time: typeof reminders.time === "string" ? reminders.time : "09:00",
    };
    result[patientId].dayOverrides = recordValue(row.day_overrides) as PatientPortalState["dayOverrides"];
    result[patientId].manualNotifications = Array.isArray(row.manual_notifications)
      ? row.manual_notifications.filter((item) => item && typeof item === "object") as PatientPortalState["manualNotifications"]
      : [];
  }
  for (const row of (useResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const patientId = String(row.patient_id ?? "");
    if (!result[patientId]) continue;
    result[patientId].useRecords.push({
      id: String(row.id),
      bottleId: String(row.bottle_id ?? ""),
      date: String(row.use_date ?? ""),
      registeredAt: String(row.registered_at ?? ""),
      drops: Number(row.drops ?? 0),
    });
  }
  return result;
}

export async function createDoctorPatient(
  doctor: MedicalDoctorProfile,
  input: { name: string; cpf: string; birthDate: string; phone?: string },
) {
  const supabase = getSupabaseClient();
  const { data: duplicate, error: duplicateError } = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", doctor.clinicId)
    .eq("cpf", input.cpf)
    .maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) throw new Error("CPF_DUPLICADO");

  const { data, error } = await supabase.from("patients").insert({
    clinic_id: doctor.clinicId,
    doctor_profile_id: doctor.id,
    full_name: input.name.trim(),
    cpf: input.cpf,
    birth_date: input.birthDate,
    phone: input.phone?.trim() || null,
    status: "com-pedido",
    address: {},
    treatment: {},
    financial: {},
  }).select("*").single();
  if (error?.code === "23505") throw new Error("CPF_DUPLICADO");
  if (error || !data) throw error ?? new Error("Paciente não retornado.");

  return mapMedicalPatient(data as unknown as MedicalPatientRow, doctor.fullName);
}

export async function saveMedicalPatientRecord(
  doctor: MedicalDoctorProfile,
  patientId: string,
  record: MedicalRecord,
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("patients")
    .select("treatment")
    .eq("id", patientId)
    .eq("clinic_id", doctor.clinicId)
    .eq("doctor_profile_id", doctor.id)
    .single();
  if (error || !data) throw error ?? new Error("Paciente não encontrado.");

  const medicalRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
    updatedBy: doctor.fullName,
  };
  const treatment = {
    ...recordValue(data.treatment),
    medicalRecord,
  };
  const { error: updateError } = await supabase.from("patients")
    .update({ treatment: treatment as unknown as Record<string, string | number>, updated_at: new Date().toISOString() })
    .eq("id", patientId)
    .eq("clinic_id", doctor.clinicId)
    .eq("doctor_profile_id", doctor.id);
  if (updateError) throw updateError;
  return medicalRecord;
}

export async function loadMedicalPatientWorkspace(patientId: string) {
  const doctor = await loadCurrentDoctorProfile();
  const supabase = getSupabaseClient();
  const [patientResult, prescriptionResult, assessmentResult, bottleResult, settingsResult, useResult] = await Promise.all([
    supabase.from("patients").select("*").eq("id", patientId).eq("clinic_id", doctor.clinicId).eq("doctor_profile_id", doctor.id).maybeSingle(),
    supabase.from("prescriptions").select("id, patient_id, content, signature_status, created_at").eq("patient_id", patientId).eq("doctor_profile_id", doctor.id).order("created_at", { ascending: false }),
    supabase.from("patient_assessments").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }),
    supabase.from("bottles").select("*").eq("patient_id", patientId).order("bottle_number", { ascending: false }),
    supabase.from("patient_portal_settings").select("*").eq("patient_id", patientId).maybeSingle(),
    supabase.from("patient_use_records").select("*").eq("patient_id", patientId).order("use_date", { ascending: false }),
  ]);

  if (patientResult.error) throw patientResult.error;
  if (prescriptionResult.error) throw prescriptionResult.error;
  if (assessmentResult.error) throw assessmentResult.error;
  if (bottleResult.error) throw bottleResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (useResult.error) throw useResult.error;
  if (!patientResult.data) return { doctor, patient: null, prescriptions: [], portal: createDefaultPortalState(patientId) };

  const assessments = ((assessmentResult.data ?? []) as unknown as Record<string, unknown>[]).map((row): PatientAssessment => ({
    id: String(row.id),
    bottleId: String(row.bottle_id ?? ""),
    bottleNumber: Number(row.bottle_number ?? 0),
    symptomFrequency: row.frequency as PatientAssessment["symptomFrequency"],
    symptomSeverity: row.severity as PatientAssessment["symptomSeverity"],
    medicationFrequency: row.medication_frequency as PatientAssessment["medicationFrequency"],
    notes: typeof row.comment === "string" ? row.comment : "",
    createdAt: String(row.created_at),
  }));
  const bottles = ((bottleResult.data ?? []) as unknown as Record<string, unknown>[]).map((row): PatientBottle => {
    const rawStatus = String(row.status ?? "").toLowerCase();
    return {
      id: String(row.id),
      number: Number(row.bottle_number ?? 0),
      receivedAt: typeof row.received_at === "string" ? row.received_at : undefined,
      startedAt: typeof row.started_at === "string" ? row.started_at : String(row.received_at ?? row.created_at ?? ""),
      finishedAt: typeof row.completed_at === "string" ? row.completed_at : undefined,
      status: row.completed_at || rawStatus === "finalizado"
        ? "finalizado"
        : row.started_at || rawStatus === "em-uso"
          ? "em-uso"
          : "recebido",
    };
  });
  const portal: PatientPortalState = {
    ...createDefaultPortalState(patientId),
    assessments,
    bottles,
    useRecords: ((useResult.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      bottleId: String(row.bottle_id ?? ""),
      date: String(row.use_date ?? ""),
      registeredAt: String(row.registered_at ?? ""),
      drops: Number(row.drops ?? 0),
    })),
  };
  const settings = settingsResult.data as unknown as Record<string, unknown> | null;
  if (settings) {
    const reminders = recordValue(settings.reminders);
    portal.reminders = {
      enabled: reminders.enabled === true,
      weekdays: Array.isArray(reminders.weekdays)
        ? reminders.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [1, 3, 5],
      time: typeof reminders.time === "string" ? reminders.time : "09:00",
    };
    portal.dayOverrides = recordValue(settings.day_overrides) as PatientPortalState["dayOverrides"];
    portal.readNotificationIds = Array.isArray(settings.read_notification_ids)
      ? settings.read_notification_ids.map(String)
      : [];
  }

  return {
    doctor,
    patient: mapMedicalPatient(patientResult.data as unknown as MedicalPatientRow, doctor.fullName),
    prescriptions: ((prescriptionResult.data ?? []) as unknown as PrescriptionRow[]).map((row) => mapPrescription(row, doctor)),
    portal,
  };
}

export async function createMedicalPrescription(
  doctor: MedicalDoctorProfile,
  patient: DemoPatientRecord,
  prescription: DemoPrescription,
) {
  const supabase = getSupabaseClient();
  const content = {
    doctor: doctor.fullName,
    doctorCrm: doctor.crm,
    treatment: prescription.treatment,
    phase: prescription.phase,
    bottles: prescription.bottles,
    drops: prescription.drops,
    frequency: prescription.frequency,
    posology: prescription.posology,
    formulas: prescription.formulas,
    notes: prescription.notes,
  };
  const { data, error } = await supabase.from("prescriptions").insert({
    clinic_id: doctor.clinicId,
    patient_id: patient.id,
    doctor_profile_id: doctor.id,
    content,
    signature_status: "pending",
  }).select("id, patient_id, content, signature_status, created_at").single();
  if (error || !data) throw error ?? new Error("Receita não retornada.");

  const { data: currentPatient, error: currentPatientError } = await supabase
    .from("patients")
    .select("treatment")
    .eq("id", patient.id)
    .eq("doctor_profile_id", doctor.id)
    .single();
  if (currentPatientError || !currentPatient) throw currentPatientError ?? new Error("Paciente não encontrado.");
  const treatment = {
    ...recordValue(currentPatient.treatment),
    ...(patient.treatment ? { name: patient.treatment } : {}),
    phase: prescription.phase,
    drops: prescription.drops,
  };
  const { error: patientError } = await supabase.from("patients").update({
    treatment,
    status: "com-pedido",
    updated_at: new Date().toISOString(),
  }).eq("id", patient.id).eq("doctor_profile_id", doctor.id);
  if (patientError) throw patientError;

  return mapPrescription(data as unknown as PrescriptionRow, doctor);
}

export async function prepareMedicalPrescriptionSignature(
  doctor: MedicalDoctorProfile,
  prescription: DemoPrescription,
) {
  const prepared: DemoPrescription = {
    ...prescription,
    signatureStatus: "ready",
    signaturePreparedAt: new Date().toISOString(),
    signaturePreparedBy: doctor.fullName,
  };
  const { data, error } = await getSupabaseClient().from("prescriptions").update({
    signature_status: "ready",
    content: {
      doctor: prepared.doctor,
      doctorCrm: prepared.doctorCrm,
      treatment: prepared.treatment,
      phase: prepared.phase,
      bottles: prepared.bottles,
      drops: prepared.drops,
      frequency: prepared.frequency,
      posology: prepared.posology,
      formulas: prepared.formulas,
      notes: prepared.notes,
      signaturePreparedAt: prepared.signaturePreparedAt,
      signaturePreparedBy: prepared.signaturePreparedBy,
    },
  }).eq("id", prescription.id).eq("doctor_profile_id", doctor.id).select("id, patient_id, content, signature_status, created_at").single();
  if (error || !data) throw error ?? new Error("Receita não retornada.");

  return mapPrescription(data as unknown as PrescriptionRow, doctor);
}
