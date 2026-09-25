"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";

export default function SignOutPage() {
  useEffect(() => {
    let active = true;
    async function signOut() {
      // Remove a sessão local antes de voltar ao acesso. Mesmo sem conexão,
      // o escopo local evita que a página inicial restaure o usuário anterior.
      await getSupabaseClient().auth.signOut({ scope: "local" });
      if (active) window.location.replace("/");
    }
    void signOut();
    return () => { active = false; };
  }, []);

  return <main className="grid min-h-screen place-items-center bg-[#faf7f3] p-6 text-center text-[#34292d]"><div><p className="text-sm font-semibold text-[#a3113a]">Encerrando acesso…</p><p className="mt-2 text-sm text-[#817578]">Você será direcionado à tela de login.</p></div></main>;
}
