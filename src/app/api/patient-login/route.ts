import { NextRequest, NextResponse } from "next/server";
import { authEmailForUsername } from "../../../lib/auth/credentials";
import { getSupabaseAdminClient } from "../../../lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { cpf } = await request.json() as { cpf?: unknown };
    const digits = String(cpf ?? "").replace(/\D/g, "");
    if (digits.length !== 11) return NextResponse.json({ email: null });

    const { data, error } = await getSupabaseAdminClient()
      .from("patients")
      .select("cpf, username, auth_user_id")
      .not("auth_user_id", "is", null);
    if (error) throw error;

    const patient = (data ?? []).find((item) =>
      String(item.cpf ?? "").replace(/\D/g, "") === digits &&
      typeof item.username === "string" && item.username.trim(),
    );

    return NextResponse.json({
      email: patient?.username ? authEmailForUsername(patient.username) : null,
    });
  } catch {
    return NextResponse.json({ email: null });
  }
}
