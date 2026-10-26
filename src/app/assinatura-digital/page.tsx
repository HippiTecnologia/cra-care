/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";

type SignatureRow = {
  id: string; patient_name: string; document_name: string; status: string; provider: string;
  certificate_type: string; requested_at: string; signed_at?: string; validation_code: string;
  signer?: { name: string; crm?: string } | null;
};
type Provider = { key: string; label: string; certificateTypes: string[]; configured: boolean };
type AvailableDocument = { id: string; patientName: string; signer?: { name: string; crm?: string } | null; createdAt: string };

const statusLabels: Record<string, string> = {
  draft: "Rascunho", awaiting_signature: "Aguardando assinatura", authentication_pending: "Autenticação pendente",
  signing: "Assinando", signed: "Assinado", rejected: "Assinatura recusada", cancelled: "Cancelado",
  expired: "Expirado", error: "Erro", invalid: "Assinatura inválida",
};

const statusColors: Record<string, string> = {
  signed: "bg-emerald-50 text-emerald-700", awaiting_signature: "bg-amber-50 text-amber-700",
  authentication_pending: "bg-blue-50 text-blue-700", signing: "bg-blue-50 text-blue-700",
  error: "bg-red-50 text-red-700", invalid: "bg-red-50 text-red-700", rejected: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-600", expired: "bg-slate-100 text-slate-600", draft: "bg-slate-100 text-slate-600",
};

function formatDate(value?: string) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function DigitalSignatureContent() {
  const params = useSearchParams();
  const prescriptionId = params.get("prescriptionId") ?? "";
  const [rows, setRows] = useState<SignatureRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [availableDocuments, setAvailableDocuments] = useState<AvailableDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(prescriptionId);
  const [role, setRole] = useState("");
  const [provider, setProvider] = useState("a3");
  const [certificateType, setCertificateType] = useState("a3");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [a3Session, setA3Session] = useState<{ connected: boolean; expiresAt: number | null }>({ connected: false, expiresAt: null });

  async function authFetch(url: string, init?: RequestInit) {
    const { data } = await getSupabaseClient().auth.getSession();
    if (!data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
    return fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${data.session.access_token}` } });
  }

  async function load() {
    try {
      const [response, sessionResponse] = await Promise.all([authFetch("/api/signatures"), authFetch("/api/assinatura/certillion/conectar")]);
      if (sessionResponse.ok) setA3Session(await sessionResponse.json());
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar as assinaturas.");
      const documents = payload.availableDocuments ?? [];
      setRows(payload.signatures ?? []); setProviders(payload.providers ?? []); setAvailableDocuments(documents); setRole(payload.user?.role ?? "");
      setSelectedDocumentId((current) => current || prescriptionId || documents[0]?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as assinaturas."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const onSignatureFinished = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "certillion-signature-finished") return;
      setWorking(false);
      if (event.data.ok) { setError(""); setMessage(event.data.message ?? "Assinatura A3 concluída."); }
      else { setMessage(""); setError(event.data.message ?? "Não foi possível concluir a assinatura A3."); }
      void load();
    };
    const onFocus = () => { void load(); };
    window.addEventListener("message", onSignatureFinished);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("message", onSignatureFinished); window.removeEventListener("focus", onFocus); };
  }, []);

  const selectedProvider = providers.find((item) => item.key === provider);
  useEffect(() => {
    if (selectedProvider && !selectedProvider.certificateTypes.includes(certificateType)) setCertificateType(selectedProvider.certificateTypes[0] ?? "cloud");
  }, [certificateType, selectedProvider]);

  const visible = useMemo(() => rows.filter((row) => {
    const matchesStatus = filter === "all" || row.status === filter;
    const term = search.toLocaleLowerCase("pt-BR");
    return matchesStatus && (!term || `${row.patient_name} ${row.document_name} ${row.signer?.name ?? ""}`.toLocaleLowerCase("pt-BR").includes(term));
  }), [filter, rows, search]);

  async function requestSignature() {
    if (!selectedDocumentId) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const response = await authFetch("/api/signatures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentType: "prescription", documentId: selectedDocumentId, provider, certificateType }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível solicitar a assinatura.");
      setMessage("Documento preparado e enviado para assinatura.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível solicitar a assinatura."); }
    finally { setWorking(false); }
  }

  async function startSignature(row: SignatureRow) {
    const authorizationPopup = row.provider === "a3" ? window.open("about:blank", "cra-care-assinatura", "popup,width=620,height=760") : null;
    setWorking(true); setError(""); setMessage("");
    try {
      const response = await authFetch(`/api/signatures/${row.id}/start`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível iniciar a assinatura.");
      if (payload.kind === "redirect" && payload.authorizationUrl) {
        const popup = authorizationPopup ?? window.open(payload.authorizationUrl, "cra-care-assinatura", "popup,width=620,height=760");
        if (!popup) throw new Error("Permita a abertura da janela para autenticar o certificado.");
        popup.location.href = payload.authorizationUrl;
        setMessage("Autenticação aberta. Autorize a assinatura no provedor.");
      } else if (payload.kind === "completed") {
        authorizationPopup?.close();
        setMessage(payload.message ?? "Documento assinado e validado.");
        await load();
      } else { authorizationPopup?.close(); setMessage(payload.message ?? "Conclua a autorização no conector oficial."); }
    } catch (cause) { authorizationPopup?.close(); setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a assinatura."); }
    finally { setWorking(false); }
  }

  async function connectCertificate() {
    const popup = window.open("about:blank", "cra-care-assinatura", "popup,width=620,height=760");
    if (!popup) { setError("Permita a abertura da janela para conectar o VIDaaS."); return; }
    setWorking(true); setError(""); setMessage("");
    try {
      const response = await authFetch("/api/assinatura/certillion/conectar", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error ?? "Não foi possível conectar o certificado.");
      popup.location.href = payload.authorizationUrl;
      setMessage("Entre no VIDaaS e autorize a sessão do seu certificado. Depois, use Assinar nas receitas.");
    } catch (cause) { popup.close(); setError(cause instanceof Error ? cause.message : "Não foi possível conectar o certificado."); }
    finally { setWorking(false); }
  }

  async function cancelSignature(row: SignatureRow) {
    setWorking(true); setError("");
    try {
      const response = await authFetch(`/api/signatures/${row.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível cancelar.");
      setMessage("Solicitação cancelada."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cancelar."); }
    finally { setWorking(false); }
  }

  async function openDocument(row: SignatureRow) {
    const response = await authFetch(`/api/signatures/${row.id}/download`);
    if (!response.ok) { const payload = await response.json(); setError(payload.error ?? "Documento indisponível."); return; }
    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const counts = { pending: rows.filter((row) => ["awaiting_signature", "authentication_pending", "signing"].includes(row.status)).length, signed: rows.filter((row) => row.status === "signed").length, cancelled: rows.filter((row) => row.status === "cancelled").length };
  const returnPath = role === "medico" ? "/medico"
    : role === "secretaria" ? "/secretaria"
      : role === "enfermagem" ? "/enfermagem"
        : role === "laboratorio" ? "/laboratorio"
          : ["admin", "super_admin"].includes(role) ? "/adm"
            : null;

  return <main className="min-h-screen bg-[#f6f8fc] text-[#17233b]">
    <header className="border-b border-[#dce3ef] bg-[#07152f] px-5 py-5 text-white sm:px-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-4"><Image src="/logo-cra-branca.png" alt="CRA Care" width={112} height={75} className="h-auto w-24"/><div><p className="text-xs uppercase tracking-[0.22em] text-cyan-300">CRA Care</p><h1 className="text-2xl font-bold">Assinatura Digital</h1></div></div>
        <div className="flex gap-2">{["admin", "super_admin"].includes(role) && <Link href="/assinatura-digital/configuracoes" className="rounded-xl border border-white/20 px-4 py-2 text-sm">Configurações</Link>}{returnPath ? <Link href={returnPath} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#07152f]">Voltar</Link> : <button type="button" disabled className="rounded-xl bg-white/50 px-4 py-2 text-sm font-semibold text-[#07152f]">Carregando…</button>}</div>
      </div>
    </header>
    <section className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-10">
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
      {role === "medico" && <section className="rounded-3xl border border-blue-200 bg-white p-6 shadow-sm" aria-label="A3 em nuvem via VIDaaS"><h2 className="text-lg font-bold">Certillion · VIDaaS (A3 em nuvem)</h2><p className="mt-2 text-sm text-slate-600">Conecte sua conta VIDaaS e autorize a sessão uma vez. Depois, clique em Assinar em cada receita sem refazer a autorização para cada documento, enquanto a sessão estiver válida.</p><div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={working || !providers.some((item) => item.key === "a3" && item.configured)} onClick={connectCertificate} className="rounded-xl bg-[#17356e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{a3Session.connected ? "Reconectar VIDaaS" : "Conectar VIDaaS"}</button><span className={a3Session.connected ? "text-sm text-emerald-700" : "text-sm text-slate-500"} role="status">{a3Session.connected ? `VIDaaS conectado até ${formatDate(new Date(a3Session.expiresAt!).toISOString())}` : "VIDaaS ainda não conectado neste navegador"}</span></div></section>}
      <div className="grid gap-4 sm:grid-cols-3">{[["Pendentes", counts.pending, "text-amber-600"], ["Assinados", counts.signed, "text-emerald-600"], ["Cancelados", counts.cancelled, "text-slate-500"]].map(([label, value, color]) => <div key={String(label)} className="rounded-3xl border border-[#dde4ef] bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-4xl font-bold ${color}`}>{value}</p></div>)}</div>
      {(availableDocuments.length > 0 || prescriptionId) && <div className="rounded-3xl border border-[#cfd9ea] bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Solicitar assinatura da receita</h2><p className="mt-1 text-sm text-slate-500">Confira o documento, o provedor e o tipo de certificado antes de continuar.</p><div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto]"><label className="text-sm font-semibold">Documento<select value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal">{availableDocuments.map((item) => <option key={item.id} value={item.id}>{item.patientName} · {item.signer?.name ?? "Médico"} · {formatDate(item.createdAt)}</option>)}</select></label><label className="text-sm font-semibold">Provedor<select value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal">{providers.filter((item) => item.key !== "sandbox").map((item) => <option key={item.key} value={item.key}>{item.label}{item.configured ? "" : " — pendente"}</option>)}</select></label><label className="text-sm font-semibold">Certificado<select value={certificateType} onChange={(event) => setCertificateType(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal">{(selectedProvider?.certificateTypes ?? ["cloud"]).map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select></label><button type="button" disabled={working || !selectedDocumentId} onClick={requestSignature} className="self-end rounded-xl bg-[#17356e] px-6 py-3 font-semibold text-white disabled:opacity-50">{working ? "Preparando…" : "Solicitar assinatura"}</button></div>{selectedProvider && !selectedProvider.configured && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Integração pendente de configuração. O documento poderá ser preparado, mas não será marcado como assinado.</p>}</div>}
      <div className="rounded-3xl border border-[#dde4ef] bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-bold">Documentos</h2><p className="text-sm text-slate-500">Acompanhe autenticação, validação e histórico.</p></div><div className="flex gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Paciente, documento ou médico" className="min-w-64 rounded-xl border border-slate-200 px-4 py-2 text-sm"/><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm"><option value="all">Todos</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div>
        {loading ? <p className="p-8 text-center text-slate-500">Carregando…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Paciente</th><th className="px-5 py-4">Documento</th><th className="px-5 py-4">Signatário</th><th className="px-5 py-4">Provedor</th><th className="px-5 py-4">Solicitado</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Ações</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="px-5 py-4 font-semibold">{row.patient_name}</td><td className="px-5 py-4">{row.document_name}</td><td className="px-5 py-4">{row.signer?.name ?? "—"}{row.signer?.crm ? <small className="block text-slate-500">CRM {row.signer.crm}</small> : null}</td><td className="px-5 py-4">{row.provider === "a3" ? "Certillion · VIDaaS (A3)" : `${row.provider.toUpperCase()} · ${row.certificate_type.toUpperCase()}`}</td><td className="px-5 py-4">{formatDate(row.requested_at)}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[row.status] ?? statusColors.draft}`}>{statusLabels[row.status] ?? row.status}</span></td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button onClick={() => openDocument(row)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Visualizar</button>{role === "medico" && !["signed", "cancelled"].includes(row.status) && <button disabled={working} onClick={() => startSignature(row)} className="rounded-lg bg-[#17356e] px-3 py-2 text-xs font-semibold text-white">Assinar</button>}{!["signed", "cancelled"].includes(row.status) && <button disabled={working} onClick={() => cancelSignature(row)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Cancelar</button>}{row.status === "signed" && <Link href={`/validar-documento/${row.validation_code}`} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700">Validar</Link>}</div></td></tr>)}{visible.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-slate-500">Nenhum documento encontrado.</td></tr>}</tbody></table></div>}
      </div>
    </section>
  </main>;
}

export default function DigitalSignaturePage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f6f8fc] p-10 text-center text-[#17233b]">Carregando assinaturas…</main>}><DigitalSignatureContent /></Suspense>;
}
