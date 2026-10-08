/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";

type Provider = { key: string; label: string; configured: boolean };
type Config = { provider: string; environment: string; enabled: boolean; api_base_url?: string; authorization_url?: string; client_id_env_key?: string; client_secret_env_key?: string; webhook_secret_env_key?: string };
type Rule = { document_type: string; label: string; signature_required: boolean; active: boolean; allowed_providers: string[] };

export default function SignatureConfigurationPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [selected, setSelected] = useState("vidaas");
  const [draft, setDraft] = useState<Config>({ provider: "vidaas", environment: "sandbox", enabled: false });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function authFetch(url: string, init?: RequestInit) {
    const { data } = await getSupabaseClient().auth.getSession();
    if (!data.session?.access_token) throw new Error("Sua sessão expirou.");
    return fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${data.session.access_token}` } });
  }

  async function load() {
    const [configResponse, rulesResponse] = await Promise.all([authFetch("/api/signatures/config"), authFetch("/api/signatures/rules")]);
    const [payload, rulePayload] = await Promise.all([configResponse.json(), rulesResponse.json()]);
    if (!configResponse.ok) throw new Error(payload.error ?? "Não foi possível carregar as configurações.");
    if (!rulesResponse.ok) throw new Error(rulePayload.error ?? "Não foi possível carregar as regras.");
    setProviders(payload.providers ?? []); setConfigs(payload.configs ?? []); setRules(rulePayload.rules ?? []);
  }

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Erro ao carregar.")); }, []);
  useEffect(() => {
    const current = configs.find((item) => item.provider === selected);
    setDraft(current ?? { provider: selected, environment: "sandbox", enabled: false });
  }, [configs, selected]);

  async function save() {
    setError(""); setMessage("");
    try {
      const response = await authFetch("/api/signatures/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: draft.provider, environment: draft.environment, enabled: draft.enabled, apiBaseUrl: draft.api_base_url, authorizationUrl: draft.authorization_url, clientIdEnvKey: draft.client_id_env_key, clientSecretEnvKey: draft.client_secret_env_key, webhookSecretEnvKey: draft.webhook_secret_env_key }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar.");
      setMessage("Configuração salva. Nenhum segredo foi armazenado no banco."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
  }

  async function testConnection() {
    setError(""); setMessage("");
    try {
      const response = await authFetch("/api/signatures/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: selected }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Não foi possível conectar ao provedor.");
      setMessage(`✓ ${payload.message}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível testar a conexão."); }
  }

  async function saveRule(rule: Rule) {
    setError(""); setMessage("");
    try {
      const response = await authFetch("/api/signatures/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentType: rule.document_type, label: rule.label, signatureRequired: rule.signature_required, active: rule.active, allowedProviders: rule.allowed_providers }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar a regra.");
      setMessage("Regra de documento atualizada."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a regra."); }
  }

  const field = (label: string, key: keyof Config, placeholder: string) => <label className="text-sm font-semibold text-slate-700">{label}<input value={String(draft[key] ?? "")} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500"/></label>;

  return <main className="min-h-screen bg-[#f6f8fc] px-5 py-8 text-[#17233b] sm:px-10"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Configurações</p><h1 className="mt-1 text-3xl font-bold">Assinatura Digital</h1><p className="mt-2 text-sm text-slate-500">Provedores, ambiente e referências dos secrets seguros.</p></div><Link href="/assinatura-digital" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Voltar</Link></div>{error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}{message && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}<section className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr]"><aside className="space-y-2 rounded-3xl border border-slate-200 bg-white p-4">{providers.filter((item) => item.key !== "sandbox").map((item) => <button key={item.key} onClick={() => setSelected(item.key)} className={`w-full rounded-xl px-4 py-3 text-left text-sm ${selected === item.key ? "bg-[#17356e] text-white" : "hover:bg-slate-50"}`}><span className="font-semibold">{item.label}</span><small className={`mt-1 block ${selected === item.key ? "text-white/70" : item.configured ? "text-emerald-600" : "text-amber-600"}`}>{item.configured ? "Variáveis encontradas" : "Pendente de configuração"}</small></button>)}</aside><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold">Ambiente<select value={draft.environment} onChange={(event) => setDraft((current) => ({ ...current, environment: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal"><option value="sandbox">Sandbox</option><option value="production">Produção</option></select></label><label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}/> Integração habilitada</label>{field("URL da API", "api_base_url", "Fornecida pelo provedor")}{field("URL de autenticação", "authorization_url", "Fornecida pelo provedor")}{field("Variável do Client ID", "client_id_env_key", "Ex.: VIDAAS_CLIENT_ID")}{field("Variável do Client Secret", "client_secret_env_key", "Ex.: VIDAAS_CLIENT_SECRET")}{field("Variável do segredo do webhook", "webhook_secret_env_key", "Ex.: SIGNATURE_VIDAAS_WEBHOOK_SECRET")}</div><div className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800"><strong>Segurança:</strong> esta tela armazena somente os nomes das variáveis. Client Secret, PIN, senha, PFX e chave privada permanecem fora do banco, no ambiente seguro do servidor.</div><div className="mt-6 flex gap-3"><button onClick={save} className="rounded-xl bg-[#17356e] px-5 py-3 text-sm font-semibold text-white">Salvar configuração</button><button onClick={testConnection} className="rounded-xl border border-[#17356e] px-5 py-3 text-sm font-semibold text-[#17356e]">Testar conexão</button></div></div></section><section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Documentos que exigem assinatura</h2><p className="mt-1 text-sm text-slate-500">Ative ou desative a exigência por tipo de documento.</p><div className="mt-5 space-y-3">{rules.map((rule, index) => <div key={rule.document_type} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 p-4"><div><p className="font-semibold">{rule.label}</p><p className="text-xs text-slate-500">{rule.document_type}</p></div><div className="flex items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.signature_required} onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, signature_required: event.target.checked } : item))}/> Assinatura obrigatória</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.active} onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, active: event.target.checked } : item))}/> Ativo</label><button onClick={() => saveRule(rule)} className="rounded-lg border border-[#17356e] px-3 py-2 text-xs font-semibold text-[#17356e]">Salvar regra</button></div></div>)}</div></section></div></main>;
}
