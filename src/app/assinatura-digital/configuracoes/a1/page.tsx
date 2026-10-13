"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../../../../lib/supabase/client";

type Doctor = { id: string; full_name: string; crm?: string | null };
type Certificate = { doctor_user_id: string; certificate_serial: string; certificate_subject: string };

export default function A1ConfigurationPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function authFetch(url: string, init?: RequestInit) {
    const { data } = await getSupabaseClient().auth.getSession();
    if (!data.session?.access_token) throw new Error("Sua sessão expirou.");
    return fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${data.session.access_token}` } });
  }

  async function load() {
    const response = await authFetch("/api/signatures/a1/certificates");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar os médicos.");
    setDoctors(payload.doctors ?? []); setCertificates(payload.certificates ?? []); setDoctorId((current) => current || payload.doctors?.[0]?.id || "");
  }

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Erro ao carregar.")); }, []);

  async function linkCertificate() {
    setError(""); setMessage("");
    try {
      if (!doctorId || !token.trim()) throw new Error("Selecione o médico e informe o código exibido no Hippi.");
      const local = await fetch("http://127.0.0.1:43127/certificate", { headers: { "X-Hippi-Connector-Token": token.trim() } });
      const localPayload = await local.json();
      if (!local.ok || !localPayload.certificateDerBase64) throw new Error(localPayload.error ?? "Não foi possível obter o certificado do Hippi.");
      const response = await authFetch("/api/signatures/a1/certificates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doctorUserId: doctorId, certificateDerBase64: localPayload.certificateDerBase64 }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível vincular o certificado.");
      setMessage("Certificado A1 vinculado com sucesso."); setToken(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível vincular o certificado."); }
  }

  return <main className="min-h-screen bg-[#f6f8fc] px-5 py-8 text-[#17233b] sm:px-10"><div className="mx-auto max-w-4xl"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Configurações</p><h1 className="mt-1 text-3xl font-bold">Certificado A1</h1><p className="mt-2 text-sm text-slate-500">Vincule o certificado do Hippi ao perfil do médico.</p></div><Link href="/assinatura-digital/configuracoes" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Voltar</Link></div>{error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}{message && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}<section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Vincular certificado</h2><p className="mt-1 text-sm text-slate-500">Deixe o Hippi aberto e use o código da sessão atual. O código não é salvo.</p><div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]"><label className="text-sm font-semibold">Médico<select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal">{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}{doctor.crm ? ` · CRM ${doctor.crm}` : ""}</option>)}</select></label><label className="text-sm font-semibold">Código do Hippi<input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Cole o código de pareamento" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal"/></label><button onClick={linkCertificate} className="self-end rounded-xl bg-[#17356e] px-5 py-3 text-sm font-semibold text-white">Vincular</button></div></section><section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Certificados vinculados</h2>{certificates.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nenhum certificado vinculado.</p> : <div className="mt-4 space-y-2">{certificates.map((certificate) => <div key={`${certificate.doctor_user_id}-${certificate.certificate_serial}`} className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Série {certificate.certificate_serial} · {certificate.certificate_subject}</div>)}</div>}</section></div></main>;
}
