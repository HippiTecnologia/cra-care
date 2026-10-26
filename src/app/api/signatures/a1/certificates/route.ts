/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser } from "../../../../../lib/signatures/auth";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";

function isAdmin(role: string) {
  return role === "secretaria" || role === "admin" || role === "super_admin";
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
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  return NextResponse.json({ error: "O vínculo do Hippi A1 foi substituído pela conexão Certillion via VIDaaS. Use Conectar VIDaaS na tela Assinatura Digital." }, { status: 410 });
}
