/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseAdminClient } from "../supabase/admin";

export async function writeSignatureAudit(input: {
  signatureId: string;
  clinicId: string;
  event: string;
  status: string;
  actorId?: string | null;
  provider?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const admin = getSupabaseAdminClient();
  const { error } = await (admin.from("signature_audit_logs") as any).insert({
    signature_id: input.signatureId,
    clinic_id: input.clinicId,
    event: input.event,
    status: input.status,
    actor_id: input.actorId ?? null,
    provider: input.provider ?? null,
    metadata: input.metadata ?? {},
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  });
  if (error) throw error;
}
