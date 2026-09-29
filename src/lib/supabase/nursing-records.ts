/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseClient } from "./client";

export type NursingProfile = { id: string; clinicId: string; fullName: string; coren?: string; role: "enfermagem" | "medico" };
export type NursingPatient = { id: string; name: string; cpf: string; birthDate: string; phone?: string; doctorId?: string; doctorName: string; createdAt: string };
export type NursingDoctor = { id: string; fullName: string; crm?: string };

function normalizeName(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function doctorCanAccessNursing(name: string) {
  const normalized = normalizeName(name);
  return normalized.includes("alessandra") && normalized.includes("bitencourt")
    || normalized.includes("patricia") && (normalized.includes("martinski") || normalized.includes("trudes"));
}

export async function loadNursingWorkspace() {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão não encontrada.");
  const { data: profile, error } = await supabase.from("profiles").select("id, clinic_id, full_name, crm, role").eq("id", user.id).single();
  const allowedDoctor = profile?.role === "medico" && doctorCanAccessNursing(profile.full_name);
  if (error || !profile || (profile.role !== "enfermagem" && !allowedDoctor)) throw error ?? new Error("Este perfil não possui acesso à área de Enfermagem.");
  if (!profile.clinic_id) throw new Error("Clínica não encontrada para este acesso.");
  const clinicId = profile.clinic_id;
  const patientTable = supabase.from("patients") as any;
  const reportTable = supabase.from("nursing_reports") as any;
  const [patientsResult, doctorsResult, reportsResult] = await Promise.all([
    // A Enfermagem e o médico usam a mesma carteira de pacientes da clínica.
    patientTable.select("id, full_name, cpf, birth_date, phone, doctor_profile_id, created_at, profiles!patients_doctor_profile_id_fkey(full_name)").eq("clinic_id", clinicId).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, crm").eq("clinic_id", clinicId).eq("role", "medico").order("full_name"),
    reportTable.select("id, patient_id, report_type, content, created_at").eq("clinic_id", clinicId).order("created_at", { ascending: false }),
  ]);
  if (patientsResult.error) throw patientsResult.error;
  if (doctorsResult.error) throw doctorsResult.error;
  if (reportsResult.error) throw reportsResult.error;
  const patients = (patientsResult.data ?? []).map((item: any): NursingPatient => ({ id: item.id, name: item.full_name, cpf: item.cpf, birthDate: item.birth_date, phone: item.phone ?? undefined, doctorId: item.doctor_profile_id ?? undefined, doctorName: item.profiles?.full_name ?? "Não vinculado", createdAt: item.created_at }));
  return { profile: { id: profile.id, clinicId, fullName: profile.full_name, coren: profile.crm ?? undefined, role: profile.role as "enfermagem" | "medico" } as NursingProfile, patients, doctors: (doctorsResult.data ?? []).map((doctor) => ({ id: doctor.id, fullName: doctor.full_name, crm: doctor.crm ?? undefined })), reports: reportsResult.data ?? [] };
}

export async function createNursingPatient(profile: NursingProfile, input: { name: string; cpf: string; birthDate: string; phone?: string; doctorId?: string }) {
  const { data, error } = await (getSupabaseClient().from("patients") as any).insert({ clinic_id: profile.clinicId, nursing_profile_id: profile.id, doctor_profile_id: null, full_name: input.name.trim(), cpf: input.cpf.replace(/\D/g, ""), birth_date: input.birthDate, phone: input.phone?.trim() || null, status: "laudo", address: {}, treatment: {}, financial: {} }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function createNursingReport(profile: NursingProfile, input: { patientId: string; doctorId?: string; reportType: "prick_test" | "patch_test"; content: Record<string, unknown> }) {
  const { error } = await (getSupabaseClient().from("nursing_reports") as any).insert({ clinic_id: profile.clinicId, patient_id: input.patientId, nurse_profile_id: profile.id, doctor_profile_id: input.doctorId, report_type: input.reportType, content: input.content });
  if (error) throw error;
}

export async function updateNursingReport(profile: NursingProfile, reportId: string, content: Record<string, unknown>, doctorId?: string) {
  const { error } = await (getSupabaseClient().from("nursing_reports") as any)
    .update({ content, doctor_profile_id: doctorId ?? null })
    .eq("id", reportId)
    .eq("clinic_id", profile.clinicId);
  if (error) throw error;
}

export async function findNursingPatientByCpf(profile: NursingProfile, cpf: string): Promise<NursingPatient | null> {
  const wantedCpf = cpf.replace(/\D/g, "");
  const { data: rows, error } = await (getSupabaseClient().from("patients") as any).select("id, full_name, cpf, birth_date, phone, doctor_profile_id, created_at, profiles!patients_doctor_profile_id_fkey(full_name)").eq("clinic_id", profile.clinicId);
  if (error) throw error;
  const data = (rows ?? []).find((item: { cpf?: unknown }) => String(item.cpf ?? "").replace(/\D/g, "") === wantedCpf);
  if (!data) return null;
  return { id: data.id, name: data.full_name, cpf: data.cpf, birthDate: data.birth_date, phone: data.phone ?? undefined, doctorId: data.doctor_profile_id ?? undefined, doctorName: data.profiles?.full_name ?? "Não vinculado", createdAt: data.created_at };
}

export async function findNursingPatient(profile: NursingProfile, query: string): Promise<NursingPatient | null> {
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const digits = query.replace(/\D/g, "");
  const { data: rows, error } = await (getSupabaseClient().from("patients") as any)
    .select("id, full_name, cpf, birth_date, phone, doctor_profile_id, created_at, profiles!patients_doctor_profile_id_fkey(full_name)")
    .eq("clinic_id", profile.clinicId);
  if (error) throw error;
  const item = (rows ?? []).find((candidate: { cpf?: unknown; full_name?: unknown }) => {
    const candidateCpf = String(candidate.cpf ?? "").replace(/\D/g, "");
    const candidateName = String(candidate.full_name ?? "").toLocaleLowerCase("pt-BR");
    return digits.length === 11 ? candidateCpf === digits : candidateName.includes(normalizedQuery);
  });
  if (!item) return null;
  return { id: item.id, name: item.full_name, cpf: item.cpf, birthDate: item.birth_date, phone: item.phone ?? undefined, doctorId: item.doctor_profile_id ?? undefined, doctorName: item.profiles?.full_name ?? "Não vinculado", createdAt: item.created_at };
}

export async function loadNursingReportsForPatient(patientId: string) {
  const { data, error } = await (getSupabaseClient().from("nursing_reports") as any).select("id, patient_id, report_type, content, created_at").eq("patient_id", patientId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
