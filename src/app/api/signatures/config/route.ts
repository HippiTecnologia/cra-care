/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser } from "../../../../lib/signatures/auth";
import { getSignatureProvider, listSignatureProviders } from "../../../../lib/signatures/providers";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

function adminOnly(role: string) {
  return role === "admin" || role === "super_admin";
}

export async function GET(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user || !adminOnly(user.role)) return NextResponse.json({ error: "Apenas o administrador pode configurar provedores." }, { status: 403 });
  const { data, error } = await (getSupabaseAdminClient().from("signature_provider_configs") as any).select("*").eq("clinic_id", user.clinicId).order("provider");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ configs: data ?? [], providers: listSignatureProviders() });
}

export async function PUT(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user || !adminOnly(user.role)) return NextResponse.json({ error: "Apenas o administrador pode configurar provedores." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const provider = typeof body.provider === "string" ? getSignatureProvider(body.provider) : null;
  if (!provider) return NextResponse.json({ error: "Provedor inválido." }, { status: 400 });
  const environment = body.environment === "production" ? "production" : "sandbox";
  const payload = {
    clinic_id: user.clinicId,
    provider: provider.key,
    environment,
    enabled: body.enabled === true,
    api_base_url: typeof body.apiBaseUrl === "string" ? body.apiBaseUrl.trim() || null : null,
    authorization_url: typeof body.authorizationUrl === "string" ? body.authorizationUrl.trim() || null : null,
    client_id_env_key: typeof body.clientIdEnvKey === "string" ? body.clientIdEnvKey.trim() || null : null,
    client_secret_env_key: typeof body.clientSecretEnvKey === "string" ? body.clientSecretEnvKey.trim() || null : null,
    webhook_secret_env_key: typeof body.webhookSecretEnvKey === "string" ? body.webhookSecretEnvKey.trim() || null : null,
    settings: {},
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await (getSupabaseAdminClient().from("signature_provider_configs") as any).upsert(payload, { onConflict: "clinic_id,provider" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ config: data });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user || !adminOnly(user.role)) return NextResponse.json({ error: "Apenas o administrador pode testar provedores." }, { status: 403 });
  const body = await request.json() as { provider?: string };
  const provider = body.provider ? getSignatureProvider(body.provider) : null;
  if (!provider) return NextResponse.json({ error: "Provedor inválido." }, { status: 400 });
  if (!provider.isConfigured()) return NextResponse.json({ ok: false, message: `Integração ${provider.label} pendente de configuração.` }, { status: 409 });
  return NextResponse.json({ ok: true, message: "Configuração necessária encontrada no ambiente seguro do servidor." });
}
