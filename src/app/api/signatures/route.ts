/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser, requestMetadata } from "../../../lib/signatures/auth";
import { writeSignatureAudit } from "../../../lib/signatures/audit";
import { buildVerifiablePrescriptionPdf, loadPrescriptionDocument } from "../../../lib/signatures/documents";
import { getSignatureProvider, listSignatureProviders } from "../../../lib/signatures/providers";
import { allowSignatureRequest } from "../../../lib/signatures/rate-limit";
import type { CertificateType } from "../../../lib/signatures/types";
import { getSupabaseAdminClient } from "../../../lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const admin = getSupabaseAdminClient();
  let query = (admin.from("digital_signatures") as any).select("*").eq("clinic_id", user.clinicId).order("created_at", { ascending: false });
  if (user.role === "medico") query = query.eq("signer_user_id", user.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  let documentQuery = (admin.from("prescriptions") as any).select("id, patient_id, doctor_profile_id, content, created_at, signature_status").eq("clinic_id", user.clinicId).neq("signature_status", "signed").order("created_at", { ascending: false }).limit(100);
  if (user.role === "medico") documentQuery = documentQuery.eq("doctor_profile_id", user.id);
  const { data: documents } = await documentQuery;
  const availableDocuments = (documents ?? []) as Array<Record<string, unknown>>;
  const patientIds = [...new Set([...rows.map((row) => String(row.patient_id ?? "")), ...availableDocuments.map((row) => String(row.patient_id ?? ""))].filter(Boolean))];
  const signerIds = [...new Set([...rows.map((row) => String(row.signer_user_id ?? "")), ...availableDocuments.map((row) => String(row.doctor_profile_id ?? ""))].filter(Boolean))];
  const [{ data: patients }, { data: signers }] = await Promise.all([
    patientIds.length ? (admin.from("patients") as any).select("id, full_name").in("id", patientIds).eq("clinic_id", user.clinicId) : Promise.resolve({ data: [] }),
    signerIds.length ? admin.from("profiles").select("id, full_name, crm").in("id", signerIds).eq("clinic_id", user.clinicId) : Promise.resolve({ data: [] }),
  ]);
  const patientMap = new Map((patients ?? []).map((item: any) => [item.id, item.full_name]));
  const signerMap = new Map((signers ?? []).map((item) => [item.id, { name: item.full_name, crm: item.crm }]));
  return NextResponse.json({
    signatures: rows.map((row) => ({ ...row, patient_name: patientMap.get(String(row.patient_id)) ?? "—", signer: signerMap.get(String(row.signer_user_id)) ?? null })),
    availableDocuments: availableDocuments.map((row) => ({ id: row.id, patientName: patientMap.get(String(row.patient_id)) ?? "—", signer: signerMap.get(String(row.doctor_profile_id)) ?? null, createdAt: row.created_at })),
    providers: listSignatureProviders(),
    user: { role: user.role, name: user.fullName },
  });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  if (!allowSignatureRequest(`${user.id}:create`, 10)) return NextResponse.json({ error: "Muitas solicitações. Aguarde um minuto." }, { status: 429 });
  try {
    const body = await request.json() as { documentType?: string; documentId?: string; provider?: string; certificateType?: CertificateType; signerUserId?: string };
    if (body.documentType !== "prescription" || !body.documentId) return NextResponse.json({ error: "Documento não suportado." }, { status: 400 });
    const provider = getSignatureProvider(body.provider ?? "vidaas");
    if (!provider) return NextResponse.json({ error: "Provedor de assinatura inválido." }, { status: 400 });
    const certificateType = body.certificateType ?? "cloud";
    if (!provider.certificateTypes.includes(certificateType)) return NextResponse.json({ error: "O tipo de certificado não é compatível com o provedor selecionado." }, { status: 400 });
    const source = await loadPrescriptionDocument(user.clinicId, body.documentId);
    const signerId = body.signerUserId ?? source.signerId;
    if (signerId !== source.signerId) return NextResponse.json({ error: "O signatário deve ser o médico responsável pelo documento." }, { status: 403 });
    if (user.role === "medico" && signerId !== user.id) return NextResponse.json({ error: "O médico só pode solicitar assinatura dos próprios documentos." }, { status: 403 });

    const admin = getSupabaseAdminClient();
    const { data: existing } = await (admin.from("digital_signatures") as any).select("*").eq("clinic_id", user.clinicId).eq("document_type", body.documentType).eq("document_id", body.documentId).eq("signer_user_id", signerId).maybeSingle();
    if (existing?.status === "signed") return NextResponse.json({ error: "Este documento já está assinado." }, { status: 409 });
    const validationCode = existing?.validation_code ?? randomBytes(16).toString("hex").toUpperCase();
    const pdf = await buildVerifiablePrescriptionPdf(source.document, validationCode);
    const documentHash = createHash("sha256").update(pdf).digest("hex");
    const signatureId = existing?.id ?? randomUUID();
    const storagePath = `${user.clinicId}/${signatureId}/original-${documentHash.slice(0, 12)}.pdf`;
    await admin.storage.createBucket("digital-signatures", { public: false, fileSizeLimit: "25MB" }).catch(() => undefined);
    const { error: uploadError } = await admin.storage.from("digital-signatures").upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    const now = new Date().toISOString();
    const payload = {
      id: signatureId, clinic_id: user.clinicId, patient_id: source.patientId,
      document_type: body.documentType, document_id: body.documentId, document_name: `Receita médica — ${source.document.patientName}`,
      signer_user_id: signerId, requested_by: user.id, provider: provider.key, certificate_type: certificateType,
      original_storage_path: storagePath, document_hash: documentHash, validation_code: validationCode,
      status: "awaiting_signature", requested_at: now, updated_at: now, error_code: null, error_message: null,
    };
    const { data: saved, error } = await (admin.from("digital_signatures") as any).upsert(payload, { onConflict: "clinic_id,document_type,document_id,signer_user_id" }).select("*").single();
    if (error) throw error;
    const meta = requestMetadata(request);
    await writeSignatureAudit({ signatureId: saved.id, clinicId: user.clinicId, event: "signature_requested", status: "awaiting_signature", actorId: user.id, provider: provider.key, metadata: { documentType: body.documentType, documentHash }, ...meta });
    return NextResponse.json({ signature: saved }, { status: existing ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível solicitar a assinatura." }, { status: 400 });
  }
}
