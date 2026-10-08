/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser } from "../../../../lib/signatures/auth";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function GET(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { data, error } = await (getSupabaseAdminClient().from("signature_document_rules") as any).select("*").eq("clinic_id", user.clinicId).order("label");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rules: data ?? [] });
}

export async function PUT(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user || !["admin", "super_admin"].includes(user.role)) return NextResponse.json({ error: "Apenas o administrador pode alterar esta regra." }, { status: 403 });
  const body = await request.json() as { documentType?: string; label?: string; signatureRequired?: boolean; active?: boolean; allowedProviders?: string[] };
  if (!body.documentType || !body.label) return NextResponse.json({ error: "Regra inválida." }, { status: 400 });
  const allowed = (body.allowedProviders ?? []).filter((item) => ["vidaas", "soluti", "a1", "a3", "cloud"].includes(item));
  const { data, error } = await (getSupabaseAdminClient().from("signature_document_rules") as any).upsert({
    clinic_id: user.clinicId, document_type: body.documentType, label: body.label,
    signature_required: body.signatureRequired === true, active: body.active !== false,
    allowed_providers: allowed.length ? allowed : ["vidaas"], updated_at: new Date().toISOString(),
  }, { onConflict: "clinic_id,document_type" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rule: data });
}
