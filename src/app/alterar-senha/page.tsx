"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase/client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/");
    });
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setMessage("Crie uma senha com pelo menos 8 caracteres.");
    if (password !== confirmation) return setMessage("As senhas não conferem.");
    setSaving(true);
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error || !data.user) throw error;
      const { data: profile } = await supabase.from("profiles").update({ must_change_password: false }).eq("id", data.user.id).select("role").single();
      if (!profile) throw new Error("Perfil não encontrado.");
      const destination = profile.role === "admin" || profile.role === "super_admin" ? "/adm" : profile.role === "secretaria" ? "/secretaria" : profile.role === "laboratorio" ? "/laboratorio" : "/medico";
      if (profile.role === "admin" || profile.role === "super_admin") window.sessionStorage.setItem("cra-care-demo-admin-session", JSON.stringify({ signedInAt: new Date().toISOString() }));
      router.replace(destination);
    } catch {
      setMessage("Não foi possível alterar a senha. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#faf7f3] p-5 text-[#34292d]"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[#efe3de] bg-white p-7 shadow-xl sm:p-10"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#a3113a]">Primeiro acesso</p><h1 className="mt-3 text-3xl font-bold">Crie sua nova senha</h1><p className="mt-3 text-sm leading-6 text-[#817578]">Por segurança, altere a senha temporária antes de continuar.</p><label className="mt-7 block text-sm font-semibold">Nova senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-2 h-12 w-full rounded-xl border border-[#e7ddd8] px-4 outline-none focus:border-[#a3113a]" /></label><label className="mt-4 block text-sm font-semibold">Confirmar nova senha<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" className="mt-2 h-12 w-full rounded-xl border border-[#e7ddd8] px-4 outline-none focus:border-[#a3113a]" /></label>{message && <p className="mt-4 rounded-xl bg-[#fff4f4] p-3 text-sm text-[#a3113a]">{message}</p>}<button disabled={saving} className="mt-6 h-12 w-full rounded-xl bg-[#a3113a] text-sm font-bold text-white">{saving ? "Salvando…" : "Salvar e continuar"}</button></form></main>;
}
