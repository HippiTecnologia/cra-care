import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser } from "../../../../../lib/signatures/auth";
import { allowSignatureRequest } from "../../../../../lib/signatures/rate-limit";
import {
  CERTILLION_AUTH_COOKIE, CERTILLION_SESSION_COOKIE, certillionAuthorizationCookieValue,
  certillionAuthorizationUrl, createCertillionPkce, getCertillionConfig, isCertillionConfigured, readCertillionSession,
} from "../../../../../lib/signatures/certillion";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const configured = isCertillionConfigured();
  const session = configured ? readCertillionSession(request, getCertillionConfig(), user) : null;
  return NextResponse.json({ configured, connected: Boolean(session), expiresAt: session?.expiresAt ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user || user.role !== "medico") return NextResponse.json({ error: "Entre com o acesso do médico para conectar o A3." }, { status: 403 });
  if (!allowSignatureRequest(`${user.id}:certillion-connect`, 6)) return NextResponse.json({ error: "Aguarde um minuto antes de tentar novamente." }, { status: 429 });
  try {
    const config = getCertillionConfig();
    const pkce = createCertillionPkce();
    const response = NextResponse.json({ authorizationUrl: certillionAuthorizationUrl(config, pkce) });
    response.cookies.set(CERTILLION_AUTH_COOKIE, certillionAuthorizationCookieValue(config, {
      ...pkce, userId: user.id, clinicId: user.clinicId, expiresAt: Date.now() + 15 * 60_000,
    }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 900 });
    return response;
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Não foi possível conectar o certificado." }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Sua sessão expirou." }, { status: 401 });
  const response = NextResponse.json({ connected: false });
  for (const name of [CERTILLION_AUTH_COOKIE, CERTILLION_SESSION_COOKIE]) response.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
