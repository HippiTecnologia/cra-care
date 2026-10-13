/* eslint-disable @typescript-eslint/no-explicit-any */
import { X509Certificate } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser } from "../../../../../lib/signatures/auth";
import { certificateFingerprintFromDer } from "../../../../../lib/signatures/a1";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";

function isAdmin(role: string) {
  return role === "admin" || role === "super_admin";
}

export async function GET(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: "Acesso restrito à administração." }, { status: 403 });
  const admin = getSupabaseAdminClient();
  const [{ data: doctors, error: doctorsError }, { data: certificates, error: certificatesError }] = await Promise.all([
    (admin.from("profiles") as any).select("id, full_name, crm").eq("clinic_id", user.clinicId).eq("role", "medico").order("full_name"),
    (admin.from("doctor_a1_certificates") as any).select("id, doctor_user_id, certificate_fingerprint, certificate_serial, certificate_subject, certificate_issuer, active, enrolled_at").eq("clinic_id", user.clinicId).order("enrolled_at", { ascending: false }),
  ]);
  if (doctorsError || certificatesError) return NextResponse.json({ error: doctorsError?.message ?? certificatesError?.message ?? "Não foi possível carregar os certificados." }, { status: 400 });
  return NextResponse.json({ doctors: doctors ?? [], certificates: certificates ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: "Apenas administradores podem vincular um certificado A1." }, { status: 403 });
  try {
    const body = await request.json() as { doctorUserId?: string; certificateDerBase64?: string };
    if (!body.doctorUserId || !body.certificateDerBase64) return NextResponse.json({ error: "Médico e certificado são obrigatórios." }, { status: 400 });
    const der = Buffer.from(body.certificateDerBase64, "base64");
    if (!der.length || der.length > 1024 * 1024) return NextResponse.json({ error: "Certificado inválido." }, { status: 400 });
    const certificate = new X509Certificate(der);
    const admin = getSupabaseAdminClient();
    const { data: doctor } = await (admin.from("profiles") as any).select("id, full_name").eq("id", body.doctorUserId).eq("clinic_id", user.clinicId).eq("role", "medico").maybeSingle();
    if (!doctor) return NextResponse.json({ error: "Médico não encontrado nesta clínica." }, { status: 404 });
    const payload = {
      clinic_id: user.clinicId, doctor_user_id: doctor.id,
      certificate_fingerprint: certificateFingerprintFromDer(der),
      certificate_serial: certificate.serialNumber.replace(/:/g, "").toUpperCase(),
      certificate_subject: certificate.subject, certificate_issuer: certificate.issuer,
      active: true, enrolled_by: user.id, revoked_at: null,
    };
    const { data: saved, error } = await (admin.from("doctor_a1_certificates") as any).upsert(payload, { onConflict: "clinic_id,doctor_user_id,certificate_fingerprint" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ certificate: saved, doctor: { id: doctor.id, name: doctor.full_name } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível vincular o certificado." }, { status: 400 });
  }
}
