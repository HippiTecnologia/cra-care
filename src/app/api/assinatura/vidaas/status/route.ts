import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";

async function currentDoctor(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getSupabaseAdminClient();
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return null;
  const { data: profile } = await admin.from("profiles").select("id, clinic_id, role").eq("id", auth.user.id).maybeSingle();
  return profile?.role === "medico" && profile.clinic_id ? profile : null;
}

export async function GET(request: NextRequest) {
  const doctor = await currentDoctor(request);
  const prescriptionId = request.nextUrl.searchParams.get("prescriptionId");
  if (!doctor || !prescriptionId) return NextResponse.json({ error: "Consulta não autorizada." }, { status: 401 });
  const admin = getSupabaseAdminClient();
  const { data: prescription } = await (admin.from("prescriptions") as any).select("patient_id").eq("id", prescriptionId).eq("clinic_id", doctor.clinic_id).eq("doctor_profile_id", doctor.id).maybeSingle();
  if (!prescription) return NextResponse.json({ error: "Receita não encontrada." }, { status: 404 });
  const { data: activePatient } = await (admin.from("patients") as any).select("id").eq("id", prescription.patient_id).eq("clinic_id", doctor.clinic_id).is("archived_at", null).maybeSingle();
  if (!activePatient) return NextResponse.json({ error: "Receita não encontrada." }, { status: 404 });
  const { data, error } = await (admin.from("prescription_digital_signatures") as any).select("status, signed_at, error_message, certificate_alias").eq("prescription_id", prescriptionId).eq("doctor_profile_id", doctor.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ signature: data ?? null });
}
