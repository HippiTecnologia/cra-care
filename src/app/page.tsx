"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { findPatientByCpf, setActivePortalPatient } from "./paciente/patient-portal-store";

type UserRole = "Paciente" | "Médico" | "Secretaria" | "Laboratório" | "Administrador";

const roles: UserRole[] = [
  "Paciente",
  "Médico",
  "Secretaria",
  "Laboratório",
  "Administrador",
];

const adminDemoCredentials = {
  email: "adm@cracare.com",
  password: "CraCare@2026",
};

export default function Home() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole>("Paciente");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  

  const isPatient = selectedRole === "Paciente";

  function handleLogin(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!identifier.trim() || !password.trim()) {
    setMessage("Preencha os dados de acesso para continuar.");
    return;
  }

  if (selectedRole === "Secretaria") {
    router.push("/secretaria");
    return;
  }

  if (selectedRole === "Médico") {
    router.push("/medico");
    return;
  }

  if (selectedRole === "Laboratório") {
    router.push("/laboratorio");
    return;
  }

  if (selectedRole === "Administrador") {
    if (
      identifier.trim().toLowerCase() !== adminDemoCredentials.email ||
      password !== adminDemoCredentials.password
    ) {
      setMessage("Acesso ADM inválido. Utilize as credenciais administrativas fornecidas pela Hippi.");
      return;
    }
    window.sessionStorage.setItem(
      "cra-care-demo-admin-session",
      JSON.stringify({ email: adminDemoCredentials.email, signedInAt: new Date().toISOString() }),
    );
    router.push("/adm");
    return;
  }

  if (selectedRole === "Paciente") {
    const patient = findPatientByCpf(identifier);

    if (!patient) {
      setMessage("CPF não encontrado. Solicite seu cadastro à equipe da clínica.");
      return;
    }

    setActivePortalPatient(patient.id);
    router.push("/paciente");
    return;
  }

}

  function selectRole(role: UserRole) {
    setSelectedRole(role);
    setIdentifier("");
    setPassword("");
    setMessage("");
  }

  return (
    <main className="min-h-screen bg-[#faf7f3] text-[#302529]">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        {/* Apresentação institucional */}

        <section className="relative flex min-h-[430px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#bf1545] via-[#a3113a] to-[#740a28] px-8 py-10 text-white sm:px-12 lg:min-h-screen lg:px-20 lg:py-14">
          <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-white/10 blur-2xl" />

          <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

          <header className="relative z-10 flex items-center gap-6">
  <Image
    src="/logo-cra-branca.png"
    alt="CRA - Centro de Rinite e Alergia"
    width={180}
    height={122}
    priority
    className="h-auto w-36 object-contain sm:w-44"
  />

  <div className="border-l border-white/25 pl-6">
    <p className="text-xl font-bold tracking-tight">
      CRA Care
    </p>

    <p className="text-sm text-white/70">
      Uma solução Hippi Care
    </p>
  </div>
</header>

          <div className="relative z-10 my-16 max-w-xl">
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium">
              Gestão clínica conectada
            </span>

            <h1 className="mt-8 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Cuidar de pessoas pode ser mais simples.
            </h1>

            <p className="mt-6 max-w-lg text-base leading-8 text-white/80 sm:text-lg">
              Conecte pacientes, médicos, secretaria e laboratório em uma
              única plataforma de acompanhamento e gestão de tratamentos.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm">
                Acompanhamento clínico
              </span>

              <span className="rounded-full bg-white/10 px-4 py-2 text-sm">
                Receitas digitais
              </span>

              <span className="rounded-full bg-white/10 px-4 py-2 text-sm">
                Gestão de tratamentos
              </span>
            </div>
          </div>

          <footer className="relative z-10 text-sm text-white/65">
            CRA Care · Uma solução Hippi Care · Desenvolvido por Gustavo Sabino Rodrigues
          </footer>
        </section>

        {/* Área de acesso */}

        <section className="flex items-center justify-center px-5 py-12 sm:px-10 lg:px-16">
          <div className="w-full max-w-[540px] rounded-[32px] border border-[#efe3de] bg-white p-7 shadow-[0_25px_80px_rgba(127,13,45,0.10)] sm:p-10">
            <div className="mb-8">
              <span className="inline-flex rounded-full bg-[#fbeef1] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#a3113a]">
                Acesso à plataforma
              </span>

              <h2 className="mt-5 text-3xl font-bold tracking-tight text-[#8e1033] sm:text-4xl">
                Bem-vindo
              </h2>

              <p className="mt-3 text-sm leading-6 text-[#766b6e] sm:text-base">
                Selecione seu perfil e informe seus dados para entrar.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f8f2ef] p-2 sm:grid-cols-3">
              {roles.map((role) => {
                const active = selectedRole === role;

                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => selectRole(role)}
                    className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${
                      active
                        ? "bg-white text-[#a3113a] shadow-sm"
                        : "text-[#766b6e] hover:bg-white/60"
                    }`}
                  >
                    {role}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="identifier"
                  className="mb-2 block text-sm font-semibold text-[#45373b]"
                >
                  {isPatient ? "CPF" : "E-mail ou identificação"}
                </label>

                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={
                    isPatient
                      ? "000.000.000-00"
                      : "Digite seu acesso profissional"
                  }
                  autoComplete="username"
                  className="h-14 w-full rounded-2xl border border-[#e9ded9] bg-white px-4 text-sm outline-none transition placeholder:text-[#aaa0a2] focus:border-[#b91142] focus:ring-4 focus:ring-[#b91142]/10"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-[#45373b]"
                  >
                    Senha
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setMessage(
                        "A recuperação de senha será configurada com o Supabase.",
                      )
                    }
                    className="text-xs font-semibold text-[#a3113a] hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    className="h-14 w-full rounded-2xl border border-[#e9ded9] bg-white px-4 pr-24 text-sm outline-none transition placeholder:text-[#aaa0a2] focus:border-[#b91142] focus:ring-4 focus:ring-[#b91142]/10"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-[#a3113a]"
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 text-sm text-[#766b6e]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#d9c8c3] accent-[#a3113a]"
                />

                Manter conectado neste dispositivo
              </label>

              <button
                type="submit"
                className="h-14 w-full rounded-2xl bg-gradient-to-r from-[#b91142] to-[#d32657] text-sm font-bold text-white shadow-[0_15px_35px_rgba(185,17,66,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(185,17,66,0.30)]"
              >
                Entrar no CRA Care
              </button>

              {message && (
                <div className="rounded-2xl border border-[#f3dce2] bg-[#fff5f7] px-4 py-3 text-sm leading-6 text-[#8e1033]">
                  {message}
                </div>
              )}
            </form>

            <div className="mt-8 border-t border-[#efe8e5] pt-6 text-center">
              <p className="text-sm leading-6 text-[#766b6e]">
                Primeiro acesso? Solicite suas credenciais à secretaria da
                clínica.
              </p>

              <p className="mt-3 text-xs text-[#a09698]">
                Protótipo visual · Integração com Supabase pendente
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
