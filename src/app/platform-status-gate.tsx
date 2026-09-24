"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabase/client";

type PlatformStatus = {
  clinicName: string;
  active: boolean;
  alert: { id: string; title: string; message: string; createdAt: string } | null;
};

export default function PlatformStatusGate() {
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkStatus() {
      try {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session) { if (mounted) { setStatus(null); setShowAlert(false); } return; }
        const response = await fetch("/api/platform/status", { headers: { authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        if (!response.ok) return;
        const next = await response.json() as PlatformStatus;
        if (!mounted) return;
        setStatus(next);
        setShowAlert(Boolean(next.alert && window.localStorage.getItem(`cra-care-platform-alert-${next.alert.id}`) !== "read"));
      } catch { /* A checagem será repetida na próxima atualização. */ }
    }
    void checkStatus();
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange(() => { window.setTimeout(() => void checkStatus(), 0); });
    const interval = window.setInterval(() => void checkStatus(), 30000);
    return () => { mounted = false; subscription.unsubscribe(); window.clearInterval(interval); };
  }, []);

  if (status && !status.active) return <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0b1424] p-5 text-white"><section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#17283b] p-8 text-center shadow-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#82dfdb]">CRA Care</p><h1 className="mt-5 text-3xl font-bold">Acesso temporariamente suspenso</h1><p className="mt-4 text-sm leading-6 text-[#bbccd8]">O acesso de {status.clinicName} está pausado. Entre em contato com o responsável pela plataforma.</p><button className="mt-7 rounded-xl bg-[#80e8d6] px-5 py-3 text-sm font-bold text-[#102333]" onClick={() => void getSupabaseClient().auth.signOut()}>Sair</button></section></div>;

  if (status?.alert && showAlert) return <div className="fixed inset-0 z-[900] flex items-center justify-center bg-[#1b1622]/65 p-5"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-[#35292e] shadow-2xl"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#a3113a]">Comunicado da plataforma</p><h2 className="mt-4 text-2xl font-bold">{status.alert.title}</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#685c60]">{status.alert.message}</p><button className="mt-7 w-full rounded-xl bg-[#a3113a] px-5 py-3 text-sm font-bold text-white" onClick={() => { window.localStorage.setItem(`cra-care-platform-alert-${status.alert?.id}`, "read"); setShowAlert(false); }}>Entendi</button></section></div>;

  return null;
}
