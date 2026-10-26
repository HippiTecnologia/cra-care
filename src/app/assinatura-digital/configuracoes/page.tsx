"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";

type Rule = { document_type: string; label: string; signature_required: boolean; active: boolean; allowed_providers: string[] };

export default function SignatureConfigurationPage() {
  const [configured, setConfigured] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function authFetch(url: string, init?: RequestInit) {
    const { data } = await getSupabaseClient().auth.getSession();
    if (!data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
    return fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${data.session.access_token}` } });
  }

  useEffect(() => {
    async function load() {
      const [configResponse, rulesResponse] = await Promise.all([authFetch("/api/signatures/config"), authFetch("/api/signatures/rules")]);
      const [config, ruleData] = await Promise.all([configResponse.json(), rulesResponse.json()]);
      if (!configResponse.ok || !rulesResponse.ok) throw new Error(config.error ?? ruleData.error ?? "Não foi possível carregar as configurações.");
      setConfigured(Boolean(config.providers?.find((provider: { key: string; configured: boolean }) => provider.key === "a3")?.configured));
      setRules(ruleData.rules ?? []);
    }
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar as configurações."));
  }, []);

  async function testConnection() {
    setWorking(true); setError(""); setMessage("");
    try {
      const response = await authFetch("/api/signatures/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "a3" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Não foi possível conectar à Certillion.");
      setMessage(payload.message); setConfigured(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha no teste de conexão."); }
    finally { setWorking(false); }
  }

  async function saveRule(rule: Rule) {
    setWorking(true); setError(""); setMessage("");
    try {
      const response = await authFetch("/api/signatures/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentType: rule.document_type, label: rule.label, signatureRequired: rule.signature_required, active: rule.active, allowedProviders: ["a3"] }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar a regra.");
      setMessage("Regra de documento atualizada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a regra."); }
    finally { setWorking(false); }
  }

  return <main className="min-h-screen bg-[#f6f8fc] px-5 py-8 text-[#17233b] sm:px-10"><div className="mx-auto max-w-5xl">
    <div className="flex items-center justify-between gap-4"><h1 className="text-3xl font-bold">Assinatura Digital · Certillion</h1><Link href="/assinatura-digital" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Voltar</Link></div>
    {error && <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {message && <div role="status" className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Certillion · VIDaaS (A3 em nuvem)</h2><p className="mt-2 text-sm text-slate-600">{configured ? "Integração configurada. Teste a comunicação com a API Certillion abaixo." : "A integração aguarda configuração no servidor."}</p><p className="mt-3 text-sm text-slate-600">Cada médico conecta sua conta VIDaaS pelo botão Conectar VIDaaS na tela de assinaturas. Não é necessário instalar o aplicativo Certillion nem conectar token ou cartão físico para essa modalidade.</p><div className="mt-5 flex flex-wrap items-center gap-4"><button type="button" disabled={working} onClick={testConnection} className="rounded-xl bg-[#17356e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{working ? "Verificando…" : "Testar conexão Certillion"}</button></div></section>
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Documentos que exigem assinatura</h2><div className="mt-5 space-y-3">{rules.map((rule, index) => <div key={rule.document_type} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 p-4"><p className="font-semibold">{rule.label}</p><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.signature_required} onChange={(event) => setRules((current) => current.map((item, i) => i === index ? { ...item, signature_required: event.target.checked } : item))}/>Assinatura obrigatória</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.active} onChange={(event) => setRules((current) => current.map((item, i) => i === index ? { ...item, active: event.target.checked } : item))}/>Ativo</label><button type="button" disabled={working} onClick={() => saveRule(rule)} className="rounded-lg border border-[#17356e] px-3 py-2 text-xs font-semibold disabled:opacity-50">Salvar regra</button></div></div>)}</div></section>
  </div></main>;
}
