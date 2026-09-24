"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";

type ClinicSnapshot = {
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  users: number;
  patients: number;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

export default function PlatformControlCenter() {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState("");
  const [clinic, setClinic] = useState<ClinicSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPlatform() {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, clinic_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || profile.role !== "super_admin" || !profile.clinic_id) {
        router.replace("/");
        return;
      }

      const [clinicResult, usersResult, patientsResult] = await Promise.all([
        supabase.from("clinics").select("name, slug, active, created_at").eq("id", profile.clinic_id).maybeSingle(),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("clinic_id", profile.clinic_id),
        supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", profile.clinic_id),
      ]);

      if (!active) return;
      setOwnerName(profile.full_name);
      if (clinicResult.data) {
        setClinic({
          name: String(clinicResult.data.name ?? "Clínica"),
          slug: String(clinicResult.data.slug ?? ""),
          active: Boolean(clinicResult.data.active),
          createdAt: String(clinicResult.data.created_at ?? new Date().toISOString()),
          users: usersResult.count ?? 0,
          patients: patientsResult.count ?? 0,
        });
      }
      setLoading(false);
    }

    void loadPlatform();
    return () => { active = false; };
  }, [router]);

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    router.replace("/");
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#070b1c] text-sm font-semibold text-cyan-100">Validando acesso protegido…</main>;
  }

  return (
    <main className="min-h-screen bg-[#070b1c] text-[#eef2ff]">
      <div className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Acesso exclusivo do proprietário</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Central da Plataforma</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Área reservada para administrar as clínicas e a evolução do Hippi Care.</p>
          </div>
          <button type="button" onClick={() => void signOut()} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10">Sair com segurança</button>
        </header>

        <section className="mt-7 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-cyan-200">Sessão proprietária</p>
          <p className="mt-2 text-xl font-bold">{ownerName}</p>
          <p className="mt-2 text-sm leading-6 text-cyan-50/75">Este endereço não aparece nos menus da clínica. Apenas o perfil proprietário consegue visualizar os dados desta central.</p>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[.14em] text-cyan-300">Clínicas da plataforma</p><h2 className="mt-2 text-2xl font-bold">Visão geral</h2></div>
            <span className="rounded-full bg-violet-400/15 px-3 py-2 text-xs font-bold text-violet-200">1 clínica conectada</span>
          </div>

          <article className="mt-5 rounded-3xl border border-violet-300/15 bg-[#101735] p-5 shadow-[0_20px_45px_rgba(0,0,0,.18)] sm:p-7">
            {clinic ? <>
              <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-2xl font-bold">{clinic.name}</h3><p className="mt-1 text-sm text-slate-400">Identificação: {clinic.slug} · cadastrada em {formatDate(clinic.createdAt)}</p></div><span className={`rounded-full px-3 py-2 text-xs font-bold ${clinic.active ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"}`}>{clinic.active ? "Acesso ativo" : "Acesso suspenso"}</span></div>
              <div className="mt-6 grid gap-4 sm:grid-cols-3"><Metric label="Clínicas" value="1" detail="CRA Care" /><Metric label="Usuários da equipe" value={String(clinic.users)} detail="acessos cadastrados" /><Metric label="Pacientes" value={String(clinic.patients)} detail="base atual da clínica" /></div>
              <div className="mt-7 flex flex-wrap gap-3"><Link href="/adm" className="rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3 text-sm font-bold text-[#071025]">Abrir administração do CRA Care</Link><span className="rounded-xl border border-white/10 px-5 py-3 text-sm text-slate-400">Novos controles de plano, cobrança e personalização entram com o Hippi Care.</span></div>
            </> : <p className="text-sm text-slate-400">Não foi possível carregar a clínica vinculada a este acesso.</p>}
          </article>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <Step number="1" title="Base protegida" text="O painel já está separado e exige o perfil super administrador." />
          <Step number="2" title="CRA Care" text="A primeira clínica real permanece isolada e funcionando normalmente." />
          <Step number="3" title="Próxima evolução" text="O Hippi Care acrescentará planos, novas clínicas, módulos e avisos centralizados." />
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl bg-white/[.045] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-cyan-300">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <article className="rounded-3xl border border-violet-300/15 bg-[#101735] p-5"><span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-500 text-sm font-bold text-[#071025]">{number}</span><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></article>;
}
