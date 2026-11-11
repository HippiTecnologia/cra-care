"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoPatientRecord } from "../medico/patient-store";
import { formatCpfDisplay, normalizeCpf } from "../../lib/cpf";
import {
  loadSecretaryPatients,
  mergeSecretaryDuplicatePatients,
  type SecretaryContext,
} from "../../lib/supabase/secretary-records";

type DuplicateGroup = { cpf: string; patients: DemoPatientRecord[] };
type Selection = { primaryId: string; duplicateId: string };

function birthday(value?: string) {
  if (!value) return "Não informado";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Não informado" : date.toLocaleDateString("pt-BR");
}

export default function DuplicatePatientMergePanel() {
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [context, setContext] = useState<SecretaryContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCpf, setSavingCpf] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function refresh() {
    const workspace = await loadSecretaryPatients(undefined, { includeLaudo: true });
    setContext(workspace.context);
    setPatients(workspace.patients);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const workspace = await loadSecretaryPatients(undefined, { includeLaudo: true });
        if (!active) return;
        setContext(workspace.context);
        setPatients(workspace.patients);
      } catch (cause) {
        if (active) setFeedback({ kind: "error", text: cause instanceof Error ? cause.message : "Não foi possível consultar os cadastros." });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const duplicateGroups = useMemo(() => {
    const byCpf = new Map<string, DemoPatientRecord[]>();
    for (const patient of patients) {
      const cpf = normalizeCpf(patient.cpf);
      if (cpf.length !== 11) continue;
      const matches = byCpf.get(cpf) ?? [];
      matches.push(patient);
      byCpf.set(cpf, matches);
    }
    return [...byCpf.entries()]
      .filter(([, matches]) => matches.length > 1)
      .map(([cpf, matches]) => ({ cpf, patients: matches } satisfies DuplicateGroup))
      .sort((first, second) => first.patients[0].name.localeCompare(second.patients[0].name, "pt-BR"));
  }, [patients]);

  function groupSelection(group: DuplicateGroup): Selection {
    const saved = selection[group.cpf];
    const primaryId = group.patients.some((patient) => patient.id === saved?.primaryId)
      ? saved.primaryId
      : group.patients[0].id;
    const duplicateId = group.patients.some((patient) => patient.id === saved?.duplicateId && patient.id !== primaryId)
      ? saved.duplicateId
      : group.patients.find((patient) => patient.id !== primaryId)?.id ?? "";
    return { primaryId, duplicateId };
  }

  function updatePrimary(group: DuplicateGroup, primaryId: string) {
    const duplicateId = group.patients.find((patient) => patient.id !== primaryId)?.id ?? "";
    setSelection((current) => ({ ...current, [group.cpf]: { primaryId, duplicateId } }));
    setConfirmed((current) => ({ ...current, [group.cpf]: false }));
  }

  function updateDuplicate(group: DuplicateGroup, duplicateId: string) {
    setSelection((current) => ({ ...current, [group.cpf]: { ...groupSelection(group), duplicateId } }));
    setConfirmed((current) => ({ ...current, [group.cpf]: false }));
  }

  async function merge(group: DuplicateGroup) {
    if (!context || !confirmed[group.cpf]) return;
    const chosen = groupSelection(group);
    const primary = group.patients.find((patient) => patient.id === chosen.primaryId);
    const duplicate = group.patients.find((patient) => patient.id === chosen.duplicateId);
    if (!primary || !duplicate || primary.id === duplicate.id) return;

    setSavingCpf(group.cpf);
    setFeedback(null);
    try {
      await mergeSecretaryDuplicatePatients(context, primary.id, duplicate.id);
      setSelection((current) => { const next = { ...current }; delete next[group.cpf]; return next; });
      setConfirmed((current) => ({ ...current, [group.cpf]: false }));
      setFeedback({ kind: "success", text: `Cadastros unificados. ${primary.name} ficou como cadastro principal; o outro foi arquivado com o histórico preservado.` });
      try {
        await refresh();
      } catch {
        setFeedback({ kind: "success", text: `Cadastros unificados. ${primary.name} ficou como cadastro principal. Atualize a lista para ver o resultado.` });
      }
    } catch (cause) {
      setFeedback({ kind: "error", text: cause instanceof Error ? cause.message : "Não foi possível unificar estes cadastros." });
    } finally {
      setSavingCpf(null);
    }
  }

  return (
    <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[#a3113a]">Configurações e acessos</p>
          <h2 className="mt-2 text-xl font-bold">Cadastros duplicados</h2>
          <p className="mt-1 max-w-3xl text-sm text-[#817578]">Encontramos possíveis duplicidades pelo CPF, mesmo quando a pontuação é diferente. Escolha qual ficha deve permanecer e qual será incorporada.</p>
        </div>
        <button type="button" disabled={loading || savingCpf !== null} onClick={() => { setLoading(true); void refresh().catch((cause) => setFeedback({ kind: "error", text: cause instanceof Error ? cause.message : "Não foi possível atualizar a lista." })).finally(() => setLoading(false)); }} className="rounded-xl border border-[#e6dbd6] bg-white px-4 py-2.5 text-sm font-semibold text-[#a3113a] disabled:opacity-50">Atualizar lista</button>
      </div>

      {feedback && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${feedback.kind === "success" ? "bg-[#edf8f3] text-[#187157]" : "bg-[#fff1f3] text-[#a3113a]"}`}>{feedback.text}</p>}
      {loading ? <p className="mt-5 rounded-2xl bg-[#fbf7f5] p-5 text-sm text-[#817578]">Verificando CPFs...</p>
        : duplicateGroups.length === 0 ? <p className="mt-5 rounded-2xl bg-[#f3faf7] p-5 text-sm text-[#187157]">Nenhum cadastro ativo duplicado por CPF foi encontrado.</p>
          : <div className="mt-5 space-y-4">{duplicateGroups.map((group) => {
            const chosen = groupSelection(group);
            const primary = group.patients.find((patient) => patient.id === chosen.primaryId)!;
            const duplicate = group.patients.find((patient) => patient.id === chosen.duplicateId)!;
            const fieldClass = "mt-1.5 h-11 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm outline-none focus:border-[#b91142]";
            return (
              <article key={group.cpf} className="rounded-2xl border border-[#eee5e0] bg-[#fcfaf8] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-[#433438]">CPF {formatCpfDisplay(group.cpf)}</h3>
                  <span className="rounded-full bg-[#fff4e4] px-3 py-1 text-xs font-semibold text-[#966419]">{group.patients.length} cadastros</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-semibold text-[#66595d]">Cadastro que será mantido
                    <select value={chosen.primaryId} onChange={(event) => updatePrimary(group, event.target.value)} className={fieldClass}>{group.patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.doctor}</option>)}</select>
                  </label>
                  <label className="text-xs font-semibold text-[#66595d]">Cadastro a incorporar
                    <select value={chosen.duplicateId} onChange={(event) => updateDuplicate(group, event.target.value)} className={fieldClass}>{group.patients.filter((patient) => patient.id !== chosen.primaryId).map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.doctor}</option>)}</select>
                  </label>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[{ patient: primary, title: "Ficha principal" }, { patient: duplicate, title: "Dados que serão incorporados" }].map(({ patient, title }) => <div key={patient.id} className="rounded-xl bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#a3113a]">{title}</p>
                    <p className="mt-2 font-semibold text-[#433438]">{patient.name}</p>
                    <dl className="mt-2 space-y-1 text-xs text-[#66595d]">
                      <div><dt className="inline font-semibold">Nascimento: </dt><dd className="inline">{birthday(patient.birthDate)}</dd></div>
                      <div><dt className="inline font-semibold">Telefone: </dt><dd className="inline">{patient.phone || "Não informado"}</dd></div>
                      <div><dt className="inline font-semibold">E-mail: </dt><dd className="inline">{patient.email || "Não informado"}</dd></div>
                      <div><dt className="inline font-semibold">Tratamento: </dt><dd className="inline">{patient.treatment || "Não informado"}</dd></div>
                      <div><dt className="inline font-semibold">Médico: </dt><dd className="inline">{patient.doctor || "Não vinculado"}</dd></div>
                    </dl>
                  </div>)}
                </div>
                <label className="mt-4 flex items-start gap-2 rounded-xl border border-[#eee5e0] bg-white p-3 text-xs text-[#433438]"><input type="checkbox" checked={confirmed[group.cpf] ?? false} onChange={(event) => setConfirmed((current) => ({ ...current, [group.cpf]: event.target.checked }))} className="mt-0.5 accent-[#a3113a]" /><span>Confirmo que os dois cadastros pertencem à mesma pessoa. Os registros vinculados serão movidos para a ficha principal e a outra ficha ficará arquivada.</span></label>
                <button type="button" onClick={() => void merge(group)} disabled={!confirmed[group.cpf] || savingCpf !== null} className="mt-3 rounded-xl bg-[#a3113a] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{savingCpf === group.cpf ? "Unificando com segurança..." : "Unificar cadastros"}</button>
              </article>
            );
          })}</div>}
      <p className="mt-4 text-xs leading-5 text-[#817578]">A unificação mantém a ficha escolhida, transfere pedidos, pagamentos e históricos, e arquiva a duplicada. Se houver conflito entre dois acessos ou dois contratos, a operação será interrompida para evitar perda de dados.</p>
    </section>
  );
}
