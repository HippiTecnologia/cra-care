import type {
  DemoBatch,
  DemoBatchItem,
  DemoBatchStatus,
  DemoPrescription,
  PrescriptionFormula,
} from "../../app/medico/patient-store";
import { getSupabaseClient } from "./client";

export type LaboratoryContext = {
  id: string;
  clinicId: string;
  fullName: string;
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

function prescriptionFromRow(row: Record<string, unknown>): DemoPrescription {
  const content = objectValue(row.content);
  const formulas = Array.isArray(content.formulas)
    ? content.formulas.filter((item) => item && typeof item === "object") as PrescriptionFormula[]
    : [];
  const signatureStatus = ["pending", "ready", "signed"].includes(text(row.signature_status))
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
    signatureStatus,
    signaturePreparedAt: text(content.signaturePreparedAt) || undefined,
    signaturePreparedBy: text(content.signaturePreparedBy) || undefined,
  };
}

function batchItemFromRow(row: Record<string, unknown>): DemoBatchItem {
  const metadata = objectValue(row.metadata);
  return {
    ...(metadata as unknown as DemoBatchItem),
    prescriptionId: text(metadata.prescriptionId, text(row.prescription_id)),
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

export async function loadLaboratoryContext(): Promise<LaboratoryContext> {
  const supabase = getSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sessão do Laboratório não encontrada.");
  const { data, error } = await supabase.from("profiles")
    .select("id, clinic_id, full_name, role")
    .eq("id", user.id)
    .single();
  if (error || !data?.clinic_id || data.role !== "laboratorio") {
    throw new Error("Este acesso não pertence ao Laboratório.");
  }
  return { id: data.id, clinicId: data.clinic_id, fullName: data.full_name };
}

export async function loadLaboratoryWorkspace(context?: LaboratoryContext) {
  const current = context ?? await loadLaboratoryContext();
  const supabase = getSupabaseClient();
  const [batchResult, itemResult, prescriptionResult] = await Promise.all([
    supabase.from("batches").select("*").eq("clinic_id", current.clinicId).neq("status", "rascunho").order("created_at", { ascending: false }),
    supabase.from("batch_items").select("*"),
    supabase.from("prescriptions").select("*").eq("clinic_id", current.clinicId).order("created_at", { ascending: false }),
  ]);
  if (batchResult.error) throw batchResult.error;
  if (itemResult.error) throw itemResult.error;
  if (prescriptionResult.error) throw prescriptionResult.error;

  const itemsByBatch = new Map<string, DemoBatchItem[]>();
  for (const row of (itemResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const batchId = text(row.batch_id);
    itemsByBatch.set(batchId, [...(itemsByBatch.get(batchId) ?? []), batchItemFromRow(row)]);
  }
  const batches = ((batchResult.data ?? []) as unknown as Record<string, unknown>[]).map((row): DemoBatch => {
    const metadata = objectValue(row.metadata);
    return {
      ...(metadata as unknown as Partial<DemoBatch>),
      id: text(row.id),
      code: text(row.code, text(metadata.code, `CRA-${text(row.created_at).slice(0, 10)}`)),
      name: text(row.name, text(metadata.name)),
      createdAt: text(row.created_at),
      status: text(row.status, "rascunho") as DemoBatchStatus,
      laboratory: text(row.laboratory),
      notes: text(metadata.notes),
      items: itemsByBatch.get(text(row.id)) ?? [],
    };
  });
  const prescriptions = ((prescriptionResult.data ?? []) as unknown as Record<string, unknown>[]).map(prescriptionFromRow);
  return { context: current, batches, prescriptions };
}

export async function saveLaboratoryBatch(context: LaboratoryContext, batch: DemoBatch) {
  if (!isUuid(batch.id)) throw new Error("Lote inválido para atualização.");
  const metadata = {
    code: batch.code,
    name: batch.name,
    notes: batch.notes,
    sentAt: batch.sentAt,
    productionStartedAt: batch.productionStartedAt,
    productionFinishedAt: batch.productionFinishedAt,
    productionResponsible: batch.productionResponsible,
    productionNotes: batch.productionNotes,
    preparedPrescriptionIds: batch.preparedPrescriptionIds,
    checkedPrescriptionIds: batch.checkedPrescriptionIds,
    checkedAt: batch.checkedAt,
    checkedBy: batch.checkedBy,
    conferenceNotes: batch.conferenceNotes,
    laboratoryOkAt: batch.laboratoryOkAt,
    laboratoryOkBy: batch.laboratoryOkBy,
    orderType: batch.orderType,
  };
  const { error } = await getSupabaseClient().from("batches").update({
    name: batch.name ?? batch.code,
    status: batch.status,
    laboratory: batch.laboratory,
    metadata,
  }).eq("id", batch.id).eq("clinic_id", context.clinicId);
  if (error) throw error;
  return batch;
}

export async function markLaboratoryBatchOk(
  context: LaboratoryContext,
  batch: DemoBatch,
) {
  if (batch.status !== "pronto") throw new Error("O lote precisa estar finalizado antes de receber o OK do laboratório.");
  if (!batch.items.length) throw new Error("O lote não possui itens para confirmar.");
  const approved = {
    ...batch,
    laboratoryOkAt: new Date().toISOString(),
    laboratoryOkBy: context.fullName,
  };
  return saveLaboratoryBatch(context, approved);
}
