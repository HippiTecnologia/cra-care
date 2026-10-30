import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser, isActiveSignaturePatient } from "../../../../lib/signatures/auth";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function GET(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user || user.role !== "medico") return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  const patientId = request.nextUrl.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "Paciente não informado." }, { status: 400 });
  if (!(await isActiveSignaturePatient(user.clinicId, patientId))) return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
  const { data, error } = await getSupabaseAdminClient().from("digital_signatures")
    .select("id, document_id, signed_at, validated_at, validation_code")
    .eq("clinic_id", user.clinicId).eq("signer_user_id", user.id)
    .eq("patient_id", patientId).eq("document_type", "prescription").eq("status", "signed");
  if (error) return NextResponse.json({ error: "Não foi possível consultar as receitas assinadas." }, { status: 500 });
  return NextResponse.json({ signatures: data ?? [] });
}
