import { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "../supabase/admin";
import type { SignatureUser } from "./types";

export async function authenticatedSignatureUser(request: NextRequest): Promise<SignatureUser | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getSupabaseAdminClient();
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return null;
  const { data: profile } = await admin.from("profiles").select("id, clinic_id, role, full_name, crm").eq("id", auth.user.id).maybeSingle();
  if (!profile?.clinic_id || !["medico", "secretaria", "admin", "super_admin"].includes(profile.role)) return null;
  return {
    id: profile.id,
    clinicId: profile.clinic_id,
    role: profile.role as SignatureUser["role"],
    fullName: profile.full_name,
    crm: profile.crm ?? undefined,
  };
}

export function requestMetadata(request: NextRequest) {
  return {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent") ?? null,
  };
}
