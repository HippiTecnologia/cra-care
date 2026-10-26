import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { test } from "node:test";
import ts from "typescript";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

// No live document or real signing credential is used by these tests.
const source = await readFile(new URL("../src/lib/signatures/certillion.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
Object.assign(process.env, { CERTILLION_CLIENT_ID: "test-application", CERTILLION_CLIENT_SECRET: "test-secret", CERTILLION_SESSION_ENCRYPTION_KEY: "test-only-cookie-encryption-key", CERTILLION_REDIRECT_URI: "https://example.test/api/assinatura/certillion/retorno" });
const config = api.getCertillionConfig();
const user = { id: "doctor-1", clinicId: "clinic-1" };
const requestWith = (name, value) => ({ cookies: { get: (key) => key === name ? { value } : undefined } });

test("PKCE, session encryption, tenant isolation and browser authorization state", () => {
  const pkce = api.createCertillionPkce();
  assert.equal(pkce.challenge, createHash("sha256").update(pkce.verifier).digest("base64url"));
  const url = new URL(api.certillionAuthorizationUrl(config, pkce));
  assert.equal(url.searchParams.get("psc"), "VIDAAS");
  assert.equal(url.origin, "https://cloud.certillion.com");
  assert.equal(url.searchParams.get("manager_id"), config.clientId);
  assert.equal(url.searchParams.get("scope"), "signature_session");
  assert.equal(url.searchParams.has("manager_secret"), false);
  const session = api.certillionSessionFromToken({ payload: { access_token: "test-token", scope: "signature_session", expires_in: 300 }, userId: user.id, clinicId: user.clinicId });
  const cookie = api.certillionSessionCookieValue(config, session);
  assert.equal(cookie.includes("test-token"), false);
  const request = requestWith(api.CERTILLION_SESSION_COOKIE, cookie);
  assert.equal(api.readCertillionSession(request, config, user)?.accessToken, "test-token");
  assert.equal(api.readCertillionSession(request, config, { ...user, clinicId: "another-clinic" }), null);
  assert.equal(api.readCertillionSession(request, config, { ...user, id: "another-doctor" }), null);
  assert.equal(api.readCertillionSession(requestWith(api.CERTILLION_SESSION_COOKIE, "invalid"), config, user), null);
  const expired = api.certillionSessionCookieValue(config, { ...session, expiresAt: Date.now() - 1 });
  assert.equal(api.readCertillionSession(requestWith(api.CERTILLION_SESSION_COOKIE, expired), config, user), null);
  const pending = { ...pkce, userId: user.id, clinicId: user.clinicId, expiresAt: Date.now() + 60_000 };
  const authorization = api.certillionAuthorizationCookieValue(config, pending);
  assert.equal(api.readCertillionAuthorization(requestWith(api.CERTILLION_AUTH_COOKIE, authorization), config)?.state, pkce.state);
  assert.equal(api.readCertillionAuthorization(request, config), null);
  assert.throws(() => api.certillionSessionFromToken({ payload: { access_token: "token", scope: "single_signature", expires_in: 300 }, userId: user.id, clinicId: user.clinicId }));
});

function fixture() {
  const row = { id: "signature-1", clinic_id: user.clinicId, document_type: "prescription", document_id: "prescription-1", signer_user_id: user.id, provider_data: {}, status: "awaiting_signature", updated_at: new Date(0).toISOString() };
  const prescription = { id: row.document_id, clinic_id: row.clinic_id, doctor_profile_id: user.id, signature_status: "pending" };
  const files = new Map();
  const admin = {
    from(table) {
      const target = table === "prescriptions" ? prescription : row;
      let patch, filters = [];
      const execute = () => {
        if (!filters.every(([key, value]) => target[key] === value)) return { data: null, error: null };
        Object.assign(target, structuredClone(patch));
        return { data: { id: target.id }, error: null };
      };
      const builder = { update(value) { patch = value; return builder; }, eq(key, value) { filters.push([key, value]); return builder; }, select() { return builder; }, maybeSingle: async () => execute(), then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); } };
      return builder;
    },
    storage: { from: () => ({ upload: async (path, bytes) => { files.set(path, bytes); return { error: null }; }, download: async (path) => ({ data: new Blob([files.get(path)]), error: null }) }) },
  };
  return { row, prescription, admin, input: () => ({ admin, signature: structuredClone(row), accessToken: "signer-token", pdf: Buffer.from("%PDF-1.7\noriginal") }) };
}

function mockProvider({ signatureStatus = 200, downloadFailures = 0, validSignature = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path.endsWith("/client_token")) return Response.json({ access_token: "application-token" });
    if (path.endsWith("/signature/validate")) return Response.json({ status: validSignature ? { code: 140, name: "SIGNATURE_VALID" } : { code: 600, name: "CERTIFICATE_INVALID" } });
    if (path.endsWith("/signature")) {
      assert.equal(init.headers.Authorization, "Bearer signer-token");
      assert.equal(JSON.parse(init.body).signature_standard, "PADES_ICP_BR");
      return signatureStatus === 200 ? Response.json({ transaction: "transaction-1", signatures: [{ id: "signed-1" }] }) : Response.json({ error: "upstream_timeout" }, { status: signatureStatus });
    }
    if (path.endsWith("/document/transaction-1")) {
      if (downloadFailures-- > 0) return new Response("", { status: 503 });
      return new Response("%PDF-1.7\nsigned", { headers: { "Content-Type": "application/pdf" } });
    }
    if (path.endsWith("/document")) return Response.json({ document_hash: "uploaded-document-hash" });
    throw new Error(`Unexpected endpoint: ${path}`);
  };
  return calls;
}

test("upload → sign → download → validate completes only after valid signature", async () => {
  const f = fixture(), calls = mockProvider();
  await api.signCertillionDocument(f.input());
  assert.equal(f.row.status, "signed");
  assert.equal(f.row.validation_result.name, "SIGNATURE_VALID");
  assert.equal(f.prescription.signature_status, "signed");
  assert.equal(calls.filter((path) => path.endsWith("/signature")).length, 1);
  assert.equal(f.row.provider_data.certillion.processingStartedAt, null);
});

test("download retry resumes the existing transaction without signing twice", async () => {
  const f = fixture(), calls = mockProvider({ downloadFailures: 1 });
  await assert.rejects(api.signCertillionDocument(f.input()));
  assert.equal(f.row.provider_data.certillion.transaction, "transaction-1");
  await api.signCertillionDocument(f.input());
  assert.equal(f.row.status, "signed");
  assert.equal(calls.filter((path) => path.endsWith("/signature")).length, 1);
  assert.equal(calls.filter((path) => path.endsWith("/document")).length, 1);
});

test("ambiguous signature timeout is blocked on the next request", async () => {
  const f = fixture(), calls = mockProvider({ signatureStatus: 504 });
  await assert.rejects(api.signCertillionDocument(f.input()));
  assert.equal(f.row.provider_data.certillion.signatureSubmissionInFlight, true);
  await assert.rejects(api.signCertillionDocument(f.input()));
  assert.equal(calls.filter((path) => path.endsWith("/signature")).length, 1);
  assert.notEqual(f.row.status, "signed");
});

test("two concurrent clicks cannot submit two signatures", async () => {
  const f = fixture(), calls = mockProvider();
  const stale = f.input();
  const results = await Promise.allSettled([api.signCertillionDocument(stale), api.signCertillionDocument({ ...stale, signature: structuredClone(stale.signature) })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(calls.filter((path) => path.endsWith("/signature")).length, 1);
});

test("documents above the account limit are never uploaded", async () => {
  const f = fixture(), calls = mockProvider();
  await assert.rejects(api.signCertillionDocument({ ...f.input(), pdf: new Uint8Array(100_001) }), /100 KB/);
  assert.equal(calls.some((path) => path.endsWith("/document")), false);
});

test("an invalid certificate never marks the signature or prescription as signed", async () => {
  const f = fixture(); mockProvider({ validSignature: false });
  await assert.rejects(api.signCertillionDocument(f.input()));
  assert.notEqual(f.row.status, "signed");
  assert.equal(f.prescription.signature_status, "pending");
});

test("a CRA Care prescription PDF fits the Certillion account limit", async () => {
  const require = createRequire(import.meta.url);
  const previous = require.extensions[".ts"];
  require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  try {
    const { buildVerifiablePrescriptionPdf } = require("../src/lib/signatures/documents.ts");
    const pdf = await buildVerifiablePrescriptionPdf({ id: "test-prescription", doctor: "Médico de teste", doctorCrm: "00000", patientName: "Paciente de teste", patientCpf: "", createdAt: new Date(0).toISOString(), treatment: "Rinite", bottles: 1, drops: 6, frequency: "3 vezes por semana", posology: "Conforme prescrição", formulas: [{ name: "D. pteronyssinus", percentage: 100 }] }, "TESTE123456");
    assert.ok(pdf.byteLength < 100_000, `PDF has ${pdf.byteLength} bytes, exceeding the 100 KB account limit`);
  } finally { if (previous) require.extensions[".ts"] = previous; else delete require.extensions[".ts"]; }
});
