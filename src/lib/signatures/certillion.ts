/* eslint-disable @typescript-eslint/no-explicit-any */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";

const API_PATH = "/css/restful/application/oauth";
const CERTILLION_PSC = "VIDAAS" as const;
const CERTILLION_API_BASE_URL = "https://cloud.certillion.com";
export const CERTILLION_SESSION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-cra-certillion-session"
  : "cra-certillion-session";
export const CERTILLION_AUTH_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-cra-certillion-auth"
  : "cra-certillion-auth";
const SIGNATURE_SESSION_SCOPE = "signature_session";
// Certillion's status catalog includes several successful states beyond the
// request-accepted, in-progress, and signature-valid codes.
const CERTILLION_SUCCESS_STATUS_CODES = new Set([100, 110, 120, 130, 131, 132, 140, 150, 151]);
const MAX_ORIGINAL_DOCUMENT_BYTES = 100_000;
const MAX_SIGNED_DOCUMENT_BYTES = 20 * 1024 * 1024;

function isDocumentHash(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+/_-]{43}=?$/.test(value) && Buffer.from(value, "base64url").byteLength === 32;
}

export type CertillionConfig = {
  baseUrl: string; psc: typeof CERTILLION_PSC; clientId: string; clientSecret: string; managerId: string;
  managerSecret: string; redirectUri: string; encryptionKey: Buffer; sessionLifetimeSeconds: number;
};
export type CertillionSession = { accessToken: string; expiresAt: number; userId: string; clinicId: string; scope: string };
export type CertillionAuthorization = { verifier: string; state: string; expiresAt: number; userId: string; clinicId: string; signatureId?: string };

export class CertillionApiError extends Error {
  constructor(message: string, readonly stage: string, readonly responseReceived: boolean, readonly rejected = false) {
    super(message); this.name = "CertillionApiError";
  }
}

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`Configuração pendente no servidor: ${name}.`);
  return value.trim();
}

export function getCertillionConfig(): CertillionConfig {
  const clientId = required(process.env.CERTILLION_CLIENT_ID, "CERTILLION_CLIENT_ID");
  const clientSecret = required(process.env.CERTILLION_CLIENT_SECRET, "CERTILLION_CLIENT_SECRET");
  const encryptionSecret = required(process.env.CERTILLION_SESSION_ENCRYPTION_KEY, "CERTILLION_SESSION_ENCRYPTION_KEY");
  const lifetime = Number.parseInt(process.env.CERTILLION_SESSION_LIFETIME_SECONDS ?? "3600", 10);
  return {
    // VIDaaS is a cloud PSC, so all API calls use the cloud.certillion.com endpoint.
    baseUrl: CERTILLION_API_BASE_URL,
    psc: CERTILLION_PSC,
    clientId, clientSecret,
    managerId: process.env.CERTILLION_MANAGER_ID?.trim() || clientId,
    managerSecret: process.env.CERTILLION_MANAGER_SECRET?.trim() || clientSecret,
    redirectUri: required(process.env.CERTILLION_REDIRECT_URI, "CERTILLION_REDIRECT_URI"),
    encryptionKey: createHash("sha256").update(encryptionSecret).digest(),
    sessionLifetimeSeconds: Number.isFinite(lifetime) && lifetime > 0 ? lifetime : 3600,
  };
}

export function isCertillionConfigured() {
  try { getCertillionConfig(); return true; } catch { return false; }
}

export function createCertillionPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(32).toString("base64url") };
}

export function certillionAuthorizationUrl(config: CertillionConfig, pkce: ReturnType<typeof createCertillionPkce>) {
  const url = new URL(`${config.baseUrl}${API_PATH}/authorize`);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("manager_id", config.managerId);
  // The public API contract documents manager_id on this GET endpoint. Never put
  // manager_secret in its URL: query strings can leak via browser history/logs.
  url.searchParams.set("psc", config.psc);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("lifetime", String(config.sessionLifetimeSeconds));
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", pkce.state);
  url.searchParams.set("scope", SIGNATURE_SESSION_SCOPE);
  return url.toString();
}

async function responseError(response: Response, stage: string) {
  const raw = await response.text().catch(() => "");
  let detail = "";
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    detail = [payload.error_description, payload.message, payload.error].find((value) => typeof value === "string" && value.trim()) as string | undefined ?? "";
  } catch { /* Do not return upstream HTML or raw body to the browser. */ }
  const rejected = response.status >= 400 && response.status < 500 && response.status !== 408;
  return new CertillionApiError(detail ? `Certillion recusou a etapa ${stage}: ${detail.slice(0, 240)}` : `Falha do Certillion na etapa ${stage} (HTTP ${response.status}).`, stage, true, rejected);
}

async function jsonRequest(url: string, init: RequestInit, stage: string) {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000), cache: "no-store" }); }
  catch { throw new CertillionApiError(`Não foi possível confirmar a resposta do Certillion na etapa ${stage}. Não repita uma assinatura sem verificar o estado da solicitação.`, stage, false); }
  if (!response.ok) throw await responseError(response, stage);
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new CertillionApiError(`Resposta inválida do Certillion na etapa ${stage}.`, stage, true);
  const status = (payload as Record<string, any>).status;
  if (status && typeof status === "object" && status.code !== undefined) {
    const code = Number(status.code);
    const name = typeof status.name === "string" ? status.name.trim().toUpperCase() : "";
    const knownSuccess = CERTILLION_SUCCESS_STATUS_CODES.has(code);
    // Some successful OAuth responses use the generic name "OK". Accept that
    // only when the code is not one of Certillion's documented error codes.
    const uploadHash = stage === "upload" && (isDocumentHash((payload as Record<string, any>).document_hash) || isDocumentHash(status.detail));
    const genericOk = name === "OK" && ((!Number.isFinite(code) || code < 200) || uploadHash);
    if (knownSuccess || genericOk) return payload as Record<string, any>;
    const rejected = stage !== "signature" || (code >= 200 && code < 300) || code === 400 || code >= 600;
    const label = name || String(status.code);
    // Never include status.detail here: Certillion may place temporary tokens
    // or authorization values in that field.
    throw new CertillionApiError(`Certillion retornou status ${label} na etapa ${stage}.`, stage, true, rejected);
  }
  return payload as Record<string, any>;
}

export async function exchangeCertillionCode(config: CertillionConfig, code: string, verifier: string) {
  const body = new URLSearchParams({ grant_type: "authorization_code", manager_id: config.managerId, manager_secret: config.managerSecret, code, code_verifier: verifier, psc: config.psc, redirect_uri: config.redirectUri });
  return jsonRequest(`${config.baseUrl}${API_PATH}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body }, "token");
}

function sealSession(config: CertillionConfig, session: CertillionSession | CertillionAuthorization) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  cipher.setAAD(Buffer.from("cra-care-certillion-session-v1"));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function openSession(config: CertillionConfig, value: string): Record<string, unknown> | null {
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 30 || bytes[0] !== 1) return null;
    const decipher = createDecipheriv("aes-256-gcm", config.encryptionKey, bytes.subarray(1, 13));
    decipher.setAAD(Buffer.from("cra-care-certillion-session-v1"));
    decipher.setAuthTag(bytes.subarray(13, 29));
    const json = Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString("utf8");
    const session: unknown = JSON.parse(json);
    return session && typeof session === "object" && !Array.isArray(session) ? session as Record<string, unknown> : null;
  } catch { return null; }
}

export function certillionSessionCookieValue(config: CertillionConfig, session: CertillionSession) { return sealSession(config, session); }
export function certillionAuthorizationCookieValue(config: CertillionConfig, authorization: CertillionAuthorization) { return sealSession(config, authorization); }

export function readCertillionAuthorization(request: NextRequest, config: CertillionConfig): CertillionAuthorization | null {
  const value = request.cookies.get(CERTILLION_AUTH_COOKIE)?.value;
  const pending = value ? openSession(config, value) : null;
  if (!pending || typeof pending.verifier !== "string" || typeof pending.state !== "string" || typeof pending.userId !== "string" || typeof pending.clinicId !== "string" || typeof pending.expiresAt !== "number" || pending.expiresAt <= Date.now()) return null;
  if (pending.signatureId !== undefined && typeof pending.signatureId !== "string") return null;
  return pending as CertillionAuthorization;
}

export function readCertillionSession(request: NextRequest, config: CertillionConfig, user: { id: string; clinicId: string }) {
  const value = request.cookies.get(CERTILLION_SESSION_COOKIE)?.value;
  if (!value) return null;
  const session = openSession(config, value);
  if (!session || typeof session.accessToken !== "string" || typeof session.expiresAt !== "number" || typeof session.scope !== "string" || session.userId !== user.id || session.clinicId !== user.clinicId || session.expiresAt <= Date.now() || !session.scope.split(/\s+/).includes(SIGNATURE_SESSION_SCOPE)) return null;
  return session as CertillionSession;
}

export async function testCertillionConnection() {
  await getClientToken(getCertillionConfig());
  return "Credenciais aceitas pela Certillion. Conecte o A3 em nuvem pelo VIDaaS no CRA Care.";
}

async function getClientToken(config: CertillionConfig) {
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "client_credentials", lifetime: "300" });
  const payload = await jsonRequest(`${config.baseUrl}${API_PATH}/client_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body }, "client_token");
  if (typeof payload.access_token !== "string") throw new CertillionApiError("Certillion não retornou o token técnico da aplicação.", "client_token", true);
  return payload.access_token as string;
}

async function uploadDocument(config: CertillionConfig, clientToken: string, signatureId: string, pdf: Uint8Array) {
  if (pdf.byteLength > MAX_ORIGINAL_DOCUMENT_BYTES) throw new Error("O PDF excede o limite de 100 KB informado pela Certillion.");
  const form = new FormData();
  form.set("file", new Blob([Buffer.from(pdf)], { type: "application/pdf" }), `${signatureId}.pdf`);
  const payload = await jsonRequest(`${config.baseUrl}${API_PATH}/document`, { method: "POST", headers: { Authorization: `Bearer ${clientToken}`, Accept: "application/json" }, body: form }, "upload");
  const hash = isDocumentHash(payload.document_hash) ? payload.document_hash : payload.status?.detail;
  if (!isDocumentHash(hash)) throw new CertillionApiError("Certillion não retornou um hash válido do documento enviado.", "upload", true);
  if (hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=$/, "") !== createHash("sha256").update(pdf).digest("base64url")) {
    throw new CertillionApiError("O hash informado pela Certillion não corresponde ao PDF enviado.", "upload", true);
  }
  return hash;
}

async function requestSignature(config: CertillionConfig, accessToken: string, signatureId: string, documentHash: string) {
  const payload = await jsonRequest(`${config.baseUrl}${API_PATH}/signature`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ signature_standard: "PADES_ICP_BR", signature_policy: "AD_RB", pki_name: "ICP_BR", hashes: [{ id: signatureId, alias: `receita-${signatureId}.pdf`, hash: documentHash }] }),
  }, "signature");
  const signatures = Array.isArray(payload.signatures) ? payload.signatures : [];
  const item = signatures[0] && typeof signatures[0] === "object" ? signatures[0] as Record<string, any> : {};
  const transaction = payload.transaction ?? payload.transaction_id ?? item.transaction ?? item.transaction_id;
  if (typeof transaction !== "string" && typeof transaction !== "number") throw new CertillionApiError("A resposta não trouxe o identificador do documento assinado. Não repita o pedido; confirme a transação com a Certillion.", "signature", false);
  return { transaction: String(transaction), providerSignatureId: typeof item.id === "string" ? item.id : undefined };
}

async function downloadDocument(config: CertillionConfig, clientToken: string, transaction: string) {
  let response: Response;
  try { response = await fetch(`${config.baseUrl}${API_PATH}/document/${encodeURIComponent(transaction)}`, { headers: { Authorization: `Bearer ${clientToken}`, Accept: "application/pdf, application/octet-stream" }, signal: AbortSignal.timeout(60_000), cache: "no-store" }); }
  catch { throw new CertillionApiError("Não foi possível baixar o PDF assinado. A solicitação pode ser retomada sem pedir outra assinatura.", "download", false); }
  if (!response.ok) throw await responseError(response, "download");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SIGNED_DOCUMENT_BYTES || Buffer.from(bytes).subarray(0, 4).toString() !== "%PDF") throw new CertillionApiError("Certillion não retornou um PDF assinado válido.", "download", true);
  return bytes;
}

async function validateDocument(config: CertillionConfig, clientToken: string, signedPdf: Uint8Array) {
  const payload = await jsonRequest(`${config.baseUrl}${API_PATH}/signature/validate`, {
    method: "POST", headers: { Authorization: `Bearer ${clientToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ signature: Buffer.from(signedPdf).toString("base64"), pki_name: "ICP_BR" }),
  }, "validate");
  const status = payload.status && typeof payload.status === "object" ? payload.status as Record<string, any> : {};
  const signatureResults = Array.isArray(payload.signatures) ? payload.signatures : [];
  const isValidStatus = (item: Record<string, any>) => item.name === "SIGNATURE_VALID" || item.code === 140 || item.code === "140";
  const allSignaturesValid = signatureResults.length > 0 && signatureResults.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const result = item as Record<string, any>;
    const nested = result.status && typeof result.status === "object" ? result.status as Record<string, any> : {};
    return isValidStatus(nested);
  });
  if (!(signatureResults.length > 0 ? allSignaturesValid : isValidStatus(status))) {
    const name = typeof status.name === "string" ? status.name.replace(/[^A-Za-z_]/g, "").slice(0, 40) : "SEM_STATUS";
    const code = typeof status.code === "number" || typeof status.code === "string" ? String(status.code).replace(/[^0-9]/g, "").slice(0, 8) : "";
    const fields = Object.keys(payload).filter((key) => key !== "status" && /^[A-Za-z_]{1,40}$/.test(key)).slice(0, 8).join(", ");
    const nestedCodes = signatureResults.slice(0, 5).map((item: unknown) => {
      const result = item && typeof item === "object" ? item as Record<string, any> : {};
      const nested = result.status && typeof result.status === "object" ? result.status as Record<string, any> : {};
      return `${String(nested.name ?? "SEM_STATUS").replace(/[^A-Za-z_]/g, "").slice(0, 40)} ${String(nested.code ?? "").replace(/[^0-9]/g, "").slice(0, 8)}`.trim();
    }).join(", ");
    throw new CertillionApiError(`A validação ICP-Brasil não confirmou a assinatura (status ${name}${code ? ` ${code}` : ""}${fields ? `; campos ${fields}` : ""}${nestedCodes ? `; assinaturas ${nestedCodes}` : ""}).`, "validate", true);
  }
  return {
    valid: true,
    status: { code: status.code, name: status.name },
    signatures: signatureResults.map((item: Record<string, any>) => ({ code: item.status?.code, name: item.status?.name })),
  };
}

function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {}; }

async function saveProviderData(admin: any, signature: Record<string, any>, providerData: Record<string, any>, extra: Record<string, unknown> = {}) {
  const { error } = await (admin.from("digital_signatures") as any).update({ ...extra, provider_data: providerData, updated_at: new Date().toISOString() }).eq("id", signature.id).eq("clinic_id", signature.clinic_id);
  if (error) throw error;
}

/** Resume only confirmed stages. An ambiguous /signature request is never sent twice. */
export async function signCertillionDocument(input: { admin: any; signature: Record<string, any>; accessToken: string; pdf: Uint8Array }) {
  const { admin, signature, accessToken, pdf } = input;
  const config = getCertillionConfig();
  const providerData = record(signature.provider_data);
  let certillion = record(providerData.certillion);
  if (certillion.processingStartedAt && Date.now() - Date.parse(String(certillion.processingStartedAt)) < 10 * 60_000) {
    throw new Error("Esta assinatura já está sendo processada. Aguarde a conclusão antes de tentar novamente.");
  }
  const claimedAt = new Date(Math.max(Date.now(), Date.parse(signature.updated_at) + 1)).toISOString();
  certillion = { ...certillion, processingStartedAt: claimedAt };
  providerData.certillion = certillion;
  const { data: claimed, error: claimError } = await admin.from("digital_signatures")
    .update({ provider_data: providerData, updated_at: claimedAt })
    .eq("id", signature.id).eq("clinic_id", signature.clinic_id).eq("updated_at", signature.updated_at).select("id").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error("Esta solicitação foi atualizada por outra tentativa. Atualize a lista de documentos.");
  try {
  const clientToken = await getClientToken(config);

  if (!certillion.documentHash) {
    certillion = { ...certillion, documentHash: await uploadDocument(config, clientToken, String(signature.id), pdf), signatureSubmissionInFlight: false };
    providerData.certillion = certillion;
    await saveProviderData(admin, signature, providerData, { status: "signing", error_code: null, error_message: null });
  }
  if (!certillion.transaction) {
    if (certillion.signatureSubmissionInFlight) throw new CertillionApiError("A resposta do pedido anterior ficou incerta. Não envie outra assinatura; confirme a transação com a Certillion antes de continuar.", "signature", false);
    certillion = { ...certillion, signatureSubmissionInFlight: true, signatureSubmittedAt: new Date().toISOString() };
    providerData.certillion = certillion;
    await saveProviderData(admin, signature, providerData, { status: "signing", error_code: null, error_message: null });
    let result: Awaited<ReturnType<typeof requestSignature>>;
    try { result = await requestSignature(config, accessToken, String(signature.id), String(certillion.documentHash)); }
    catch (cause) {
      if (cause instanceof CertillionApiError && cause.rejected) {
        certillion = { ...certillion, signatureSubmissionInFlight: false, lastSignatureError: cause.message };
        providerData.certillion = certillion;
        await saveProviderData(admin, signature, providerData, { status: "error", error_code: "CERTILLION_SIGNATURE_REJECTED", error_message: cause.message.slice(0, 500) });
      }
      throw cause;
    }
    certillion = { ...certillion, transaction: result.transaction, signatureId: result.providerSignatureId, signatureSubmissionInFlight: false };
    providerData.certillion = certillion;
    await saveProviderData(admin, signature, providerData, { provider_transaction_id: result.transaction, provider_signature_id: result.providerSignatureId ?? null, status: "signing", error_code: null, error_message: null });
  }
  if (!certillion.signedStoragePath) {
    const signedPdf = await downloadDocument(config, clientToken, String(certillion.transaction));
    const signedHash = createHash("sha256").update(signedPdf).digest("hex");
    const signedStoragePath = `${signature.clinic_id}/${signature.id}/signed-${signedHash.slice(0, 12)}.pdf`;
    const { error } = await admin.storage.from("digital-signatures").upload(signedStoragePath, Buffer.from(signedPdf), { contentType: "application/pdf", upsert: true });
    if (error) throw error;
    certillion = { ...certillion, signedStoragePath, signedHash };
    providerData.certillion = certillion;
    await saveProviderData(admin, signature, providerData, { signed_storage_path: signedStoragePath, signed_document_hash: signedHash, status: "signing" });
  }
  let validationResult = certillion.validationResult;
  if (!validationResult) {
    const storedPdf = await admin.storage.from("digital-signatures").download(String(certillion.signedStoragePath));
    if (storedPdf.error || !storedPdf.data) throw new Error("PDF assinado salvo, mas indisponível para validação. Tente retomar a validação.");
    validationResult = await validateDocument(config, clientToken, new Uint8Array(await storedPdf.data.arrayBuffer()));
    certillion = { ...certillion, validationResult };
    providerData.certillion = certillion;
  }
  const now = new Date().toISOString();
  if (signature.document_type === "prescription") {
    const { error } = await admin.from("prescriptions").update({ signature_status: "signed" })
      .eq("id", signature.document_id).eq("clinic_id", signature.clinic_id).eq("doctor_profile_id", signature.signer_user_id);
    if (error) throw error;
  }
  await saveProviderData(admin, signature, providerData, { status: "signed", validation_result: validationResult, validated_at: now, signed_at: now, authenticated_at: signature.authenticated_at ?? now, error_code: null, error_message: null });
  return { transaction: String(certillion.transaction), signedStoragePath: String(certillion.signedStoragePath) };
  } catch (cause) {
    // Before /signature, a retry cannot create a duplicate signature. Record
    // the failed stage so the pending document explains why it did not advance.
    if ((!certillion.documentHash || certillion.transaction) && !certillion.signatureSubmissionInFlight) {
      const stage = cause instanceof CertillionApiError ? cause.stage : "preparation";
      const message = cause instanceof Error ? cause.message : "Não foi possível concluir a assinatura.";
      certillion = { ...certillion, lastFailureStage: stage, lastFailureAt: new Date().toISOString() };
      providerData.certillion = certillion;
      await saveProviderData(admin, signature, providerData, {
        status: certillion.transaction ? "signing" : "awaiting_signature",
        error_code: `CERTILLION_${stage.toUpperCase()}`,
        error_message: message.slice(0, 500),
      }).catch(() => undefined);
    }
    throw cause;
  } finally {
    certillion = { ...certillion, processingStartedAt: null };
    providerData.certillion = certillion;
    await saveProviderData(admin, signature, providerData).catch(() => undefined);
  }
}

export function certillionSessionFromToken(input: { payload: Record<string, any>; userId: string; clinicId: string }) {
  const { payload, userId, clinicId } = input;
  const scope = typeof payload.scope === "string" ? payload.scope : "";
  const expiresIn = Number(payload.expires_in);
  if (typeof payload.access_token !== "string" || !scope.split(/\s+/).includes(SIGNATURE_SESSION_SCOPE) || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new CertillionApiError("A Certillion não criou uma sessão signature_session válida. Confirme se esse escopo foi liberado para a conta.", "token", true);
  return { accessToken: payload.access_token as string, scope, expiresAt: Date.now() + expiresIn * 1000, userId, clinicId } satisfies CertillionSession;
}
