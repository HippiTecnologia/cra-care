/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseClient } from "./client";

export type NursingProfile = { id: string; clinicId: string; fullName: string };
export type NursingPatient = { id: string; name: string; cpf: string; birthDate: string; phone?: string; doctorId?: string; doctorName: string; createdAt: string };
export type NursingDoctor = { id: string; fullName: string };

export async function loadNursingWorkspace() {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão não encontrada.");
  const { data: profile, error } = await supabase.from("profiles").select("id, clinic_id, full_name, role").eq("id", user.id).single();
  if (error || !profile || profile.role !== "enfermagem") throw error ?? new Error("Perfil de enfermagem não encontrado.");
  if (!profile.clinic_id) throw new Error("Clínica não encontrada para este acesso.");
  const clinicId = profile.clinic_id;
  const patientTable = supabase.from("patients") as any;
  const reportTable = supabase.from("nursing_reports") as any;
  const [patientsResult, doctorsResult, reportsResult] = await Promise.all([
    patientTable.select("id, full_name, cpf, birth_date, phone, doctor_profile_id, created_at, profiles!patients_doctor_profile_id_fkey(full_name)").eq("nursing_profile_id", user.id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("clinic_id", clinicId).eq("role", "medico").order("full_name"),
    reportTable.select("id, patient_id, report_type, content, created_at").eq("nurse_profile_id", user.id).order("created_at", { ascending: false }),
  ]);
  if (patientsResult.error) throw patientsResult.error;
  if (doctorsResult.error) throw doctorsResult.error;
  if (reportsResult.error) throw reportsResult.error;
  const patients = (patientsResult.data ?? []).map((item: any): NursingPatient => ({ id: item.id, name: item.full_name, cpf: item.cpf, birthDate: item.birth_date, phone: item.phone ?? undefined, doctorId: item.doctor_profile_id ?? undefined, doctorName: item.profiles?.full_name ?? "Não vinculado", createdAt: item.created_at }));
  return { profile: { id: profile.id, clinicId, fullName: profile.full_name } as NursingProfile, patients, doctors: (doctorsResult.data ?? []).map((doctor) => ({ id: doctor.id, fullName: doctor.full_name })), reports: reportsResult.data ?? [] };
}

export async function createNursingPatient(profile: NursingProfile, input: { name: string; cpf: string; birthDate: string; phone?: string; doctorId?: string }) {
  const { data, error } = await (getSupabaseClient().from("patients") as any).insert({ clinic_id: profile.clinicId, nursing_profile_id: profile.id, doctor_profile_id: input.doctorId || null, full_name: input.name.trim(), cpf: input.cpf.replace(/\D/g, ""), birth_date: input.birthDate, phone: input.phone?.trim() || null, status: "laudo", address: {}, treatment: {}, financial: {} }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function createNursingReport(profile: NursingProfile, input: { patientId: string; doctorId?: string; reportType: "prick_test" | "patch_test"; content: Record<string, unknown> }) {
  const { error } = await (getSupabaseClient().from("nursing_reports") as any).insert({ clinic_id: profile.clinicId, patient_id: input.patientId, nurse_profile_id: profile.id, doctor_profile_id: input.doctorId, report_type: input.reportType, content: input.content });
  if (error) throw error;
}

export async function findNursingPatientByCpf(profile: NursingProfile, cpf: string): Promise<NursingPatient | null> {
  const { data, error } = await (getSupabaseClient().from("patients") as any).select("id, full_name, cpf, birth_date, phone, doctor_profile_id, created_at, profiles!patients_doctor_profile_id_fkey(full_name)").eq("clinic_id", profile.clinicId).eq("cpf", cpf.replace(/\D/g, "")).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.full_name, cpf: data.cpf, birthDate: data.birth_date, phone: data.phone ?? undefined, doctorId: data.doctor_profile_id ?? undefined, doctorName: data.profiles?.full_name ?? "Não vinculado", createdAt: data.created_at };
}

export async function loadNursingReportsForPatient(patientId: string) {
  const { data, error } = await (getSupabaseClient().from("nursing_reports") as any).select("id, patient_id, report_type, content, created_at").eq("patient_id", patientId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
