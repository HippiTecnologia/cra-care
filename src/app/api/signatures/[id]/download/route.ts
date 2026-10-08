/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser } from "../../../../../lib/signatures/auth";
import { getSupabaseAdminClient } from "../../../../../lib/supabase/admin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const admin = getSupabaseAdminClient();
  const { data: signature } = await (admin.from("digital_signatures") as any).select("*").eq("id", id).eq("clinic_id", user.clinicId).maybeSingle();
  if (!signature || (user.role === "medico" && signature.signer_user_id !== user.id)) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const path = signature.status === "signed" && signature.signed_storage_path ? signature.signed_storage_path : signature.original_storage_path;
  const result = await admin.storage.from("digital-signatures").download(path);
  if (result.error || !result.data) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  return new NextResponse(await result.data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${signature.status === "signed" ? "documento-assinado" : "documento-para-assinatura"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
