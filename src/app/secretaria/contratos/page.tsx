"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DemoPatientRecord,
  demoMedicalPatients,
  readDemoPatients,
  subscribeDemoPatients,
} from "../../medico/patient-store";
import {
  PatientPortalState,
  readPortalState,
  subscribePortalState,
} from "../../paciente/patient-portal-store";

type ContractFilter = "todos" | "assinados" | "pendentes";
type ContractSection = { heading: string; text: string };

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-/\s]/g, "");

function formatDate(value?: string, includeTime = false) {
  if (!value) return "Não informado";
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: includeTime && value.includes("T") ? "short" : undefined,
  }).format(parsed);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;",
  })[character] ?? character);
}

function contractSections(patient: DemoPatientRecord, portal: PatientPortalState): ContractSection[] {
  return [
    {
      heading: "Identificação do paciente",
      text: `Nome do paciente: ${patient.name}\nCPF: ${patient.cpf}\nData de nascimento: ${formatDate(patient.birthDate)}\nInício do tratamento: ${formatDate(patient.startDate)}\nTelefone: ${patient.phone || "Não informado"}\nE-mail: ${patient.email || "Não informado"}\nMédico solicitante: ${patient.doctor}`,
    },
    {
      heading: "Adesão ao tratamento",
      text: "Declaro que estou aderindo voluntariamente ao tratamento de Imunoterapia Alérgeno Específica (IAE), indicado para o tratamento de alergias. Fui informado(a) de que esse tratamento utiliza doses controladas e personalizadas de alérgenos com o objetivo de reduzir ou eliminar reações alérgicas e melhorar a qualidade de vida. Também fui informado(a) de que existem outras alternativas de tratamento, como o uso de medicamentos para controle dos sintomas.",
    },
    {
      heading: "Pontos importantes do tratamento",
      text: `1. O tratamento é planejado tecnicamente e de forma personalizada pelo médico responsável. A dose, a fase e a composição podem ser ajustadas ao longo do tratamento. É necessária consulta médica a cada 3 meses ou conforme orientação médica.\n\n2. A duração média do tratamento é de 3 anos, sendo necessários pelo menos 6 meses para avaliar sua eficácia. Os resultados variam de pessoa para pessoa e não há garantia de sucesso.\n\n3. É fundamental seguir corretamente as orientações médicas e as datas de administração da vacina.\n\nDeclaro que tive a oportunidade de esclarecer dúvidas sobre benefícios, riscos, efeitos colaterais, duração, custos e necessidade de acompanhamento médico.\n\nTratamento indicado: ${patient.treatment || "Imunoterapia Alérgeno Específica (IAE)"}.`,
    },
    {
      heading: "Orientações para o uso da vacina",
      text: "• A alimentação pode ser realizada normalmente antes da aplicação. Após escovar os dentes, aguarde 20 minutos.\n• Siga corretamente a quantidade de gotas por dia, conforme a tabela ou a orientação do médico ou da enfermagem.\n• Aplique a vacina em frente ao espelho, embaixo da língua.\n• Mantenha as gotas embaixo da língua, na região vestibular, por aproximadamente 2 minutos e depois engula.\n• É normal sentir leve formigamento ou dormência na língua.\n• Após a aplicação, permaneça em jejum por 45 minutos, sem ingerir alimentos, água ou outros líquidos.\n• A vacina pode ser aplicada pela manhã ou à noite.\n• Mantenha a vacina sempre refrigerada.\n• Em viagens, a vacina pode permanecer fora da geladeira por no máximo 4 dias e deve ser transportada com cuidado, em mala ou caixa de isopor climatizada.",
    },
    {
      heading: "Valores, pagamento e cancelamento",
      text: `Tratamento Imunoterápico (Alérgeno Específico) — orientação e planejamento técnico.\nValor registrado: ${patient.contractValue ? patient.contractValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Não informado"}.\nMétodo de aquisição: ${patient.acquisitionMethod || "Não informado"}.\nForma de pagamento: ${patient.paymentMethod || "Não informada"}${patient.paymentInstallments ? ` em ${patient.paymentInstallments} parcela(s)` : ""}.\nO paciente poderá cancelar o tratamento a qualquer momento, mediante as condições acordadas com a equipe responsável.`,
    },
    {
      heading: "Possíveis efeitos adversos e crises de rinite",
      text: "Os efeitos adversos são raros, mas podem ocorrer reações alérgicas, coceira, inchaço, vermelhidão, sintomas respiratórios ou piora inicial dos sintomas. Em caso de intercorrência, entre em contato com a equipe do CRA e com o médico responsável.\n\nMudanças de clima, odores fortes, ar-condicionado, perfumes e outros fatores não alérgicos também podem desencadear crises e não são controlados pela imunoterapia. Nesses casos, poderão ser utilizados medicamentos conforme orientação médica.",
    },
    {
      heading: "Validade e renovação",
      text: "Este termo é válido enquanto o paciente estiver realizando a Imunoterapia Alérgeno Específica. Em caso de reajuste de valores, um novo contrato será apresentado com aviso prévio. Após a formalização do novo documento, o termo anterior perderá a validade.",
    },
    {
      heading: "Entrega",
      text: "A entrega pode ser realizada por motoboy em Curitiba e Região Metropolitana. Para outras localidades, poderá ser utilizada entrega por Sedex ou Gollog quando o prazo for de até 5 dias úteis.\n\nA entrega em Curitiba está incluída. Para a Região Metropolitana de Curitiba, a taxa é de R$ 30,00. Para as demais localidades, o valor será informado mediante cotação. O paciente também poderá optar pela retirada na clínica.",
    },
    {
      heading: "Assinaturas",
      text: portal.signedAt
        ? `Curitiba, ${formatDate(portal.signedAt)}.\n\nMédico solicitante: ${patient.doctor}\nCentro de Rinite e Alergia — IPO\n\nPaciente: ${portal.signedName}\nCPF: ${portal.signedCpf}\nAssinado eletronicamente em: ${formatDate(portal.signedAt, true)}`
        : `Médico solicitante: ${patient.doctor}\nCentro de Rinite e Alergia — IPO\n\nAguardando assinatura eletrônica do paciente.`,
    },
  ];
}

export default function ContractsPage() {
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [portals, setPortals] = useState<Record<string, PatientPortalState>>({});
  const [filter, setFilter] = useState<ContractFilter>("todos");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const synchronize = () => {
      const saved = readDemoPatients();
      const savedIds = new Set(saved.map((item) => item.id));
      const active = [...saved, ...demoMedicalPatients.filter((item) => !savedIds.has(item.id))]
        .filter((item) => item.status === "ativo");
      setPatients(active);
      setPortals(Object.fromEntries(active.map((item) => [item.id, readPortalState(item.id)])));
    };
    queueMicrotask(synchronize);
    const unsubscribePatients = subscribeDemoPatients(synchronize);
    const unsubscribePortal = subscribePortalState(synchronize);
    return () => { unsubscribePatients(); unsubscribePortal(); };
  }, []);

  const totals = useMemo(() => ({
    signed: patients.filter((patient) => Boolean(portals[patient.id]?.signedAt)).length,
    pending: patients.filter((patient) => !portals[patient.id]?.signedAt).length,
  }), [patients, portals]);

  const visible = useMemo(() => patients.filter((patient) => {
    const signed = Boolean(portals[patient.id]?.signedAt);
    const matchesFilter = filter === "todos" || (filter === "assinados" ? signed : !signed);
    const term = normalize(search);
    return matchesFilter && (!term || normalize(`${patient.name}${patient.cpf}`).includes(term));
  }), [filter, patients, portals, search]);

  function openContract(patient: DemoPatientRecord) {
    const portal = portals[patient.id] ?? readPortalState(patient.id);
    const popup = window.open("", "_blank", "width=900,height=760");
    if (!popup) {
      setMessage("Permita a abertura de janelas para visualizar o contrato.");
      return;
    }
    const sections = contractSections(patient, portal).map((section) => `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.text).replace(/\n/g, "<br>")}</p></section>`).join("");
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de adesão · ${escapeHtml(patient.name)}</title><style>*{box-sizing:border-box}body{font:14px Arial,sans-serif;max-width:820px;margin:32px auto;padding:0 28px;color:#3f3236;line-height:1.65}header{background:#a3113a;color:white;padding:28px;border-radius:18px}header img{width:110px;height:auto}h1{font-size:25px;margin:18px 0 4px}header p{margin:0;color:#ffe7ed}section{margin-top:22px;padding:20px;background:#faf7f5;border:1px solid #eee3de;border-radius:14px;break-inside:avoid}h2{margin:0 0 10px;color:#86203b;font-size:16px}section p{margin:0;white-space:normal}.status{margin-top:22px;padding:14px;border-radius:12px;background:${portal.signedAt ? "#edf8f3" : "#fff4e4"};color:${portal.signedAt ? "#187157" : "#966419"};font-weight:bold}.actions{display:flex;gap:12px;margin:24px 0}.actions button{border:0;border-radius:10px;background:#a3113a;color:white;padding:12px 18px;font-weight:bold;cursor:pointer}@media print{body{margin:0 auto}.actions{display:none}header{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><header><img src="/logo-cra-branca.png" alt="CRA"><h1>Termo de adesão — Imunoterapia Alérgeno Específica (IAE)</h1><p>Documento completo e personalizado do paciente</p></header><div class="status">Status: ${portal.signedAt ? `Assinado eletronicamente em ${escapeHtml(formatDate(portal.signedAt, true))}` : "Pendente de assinatura"}</div>${sections}<div class="actions"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div></body></html>`);
    popup.document.close();
    popup.focus();
  }

  return (
    <main className="min-h-screen bg-[#f8f5f2] p-5 text-[#34292d] sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a3113a]">Secretaria</p><h1 className="mt-2 text-3xl font-bold">Contratos dos pacientes ativos</h1><p className="mt-2 text-sm text-[#817578]">Somente pacientes ativos precisam do termo obrigatório.</p></div><Link href="/secretaria" className="rounded-xl border border-[#e6dbd6] bg-white px-4 py-3 text-sm font-semibold text-[#a3113a]">← Voltar</Link></header>
        {message && <div className="mt-5 rounded-2xl bg-[#fff4e4] px-4 py-3 text-sm font-semibold text-[#966419]">{message}</div>}
        <section className="mt-7 grid gap-4 sm:grid-cols-3"><Metric label="Contratos dos ativos" value={patients.length} color="text-[#a3113a]" /><Metric label="Assinados" value={totals.signed} color="text-[#187157]" /><Metric label="Pendentes" value={totals.pending} color="text-[#966419]" /></section>
        <section className="mt-5 rounded-3xl border border-[#eee5e0] bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou CPF" className="h-12 flex-1 rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /><select value={filter} onChange={(event) => setFilter(event.target.value as ContractFilter)} className="h-12 rounded-xl border border-[#e9dfda] px-4"><option value="todos">Todos</option><option value="assinados">Assinados</option><option value="pendentes">Pendentes</option></select></div>
          <div className="mt-6 space-y-3">{visible.map((patient) => { const portal = portals[patient.id]; return <article key={patient.id} className="flex flex-col gap-4 rounded-2xl bg-[#fbf7f5] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">{patient.name}</h2><p className="mt-1 text-xs text-[#817578]">CPF {patient.cpf} · {patient.doctor}</p><p className="mt-1 text-xs text-[#817578]">Início: {formatDate(patient.startDate)} · {patient.acquisitionMethod ?? "Método não definido"}</p></div><div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-2 text-xs font-semibold ${portal?.signedAt ? "bg-[#edf8f3] text-[#187157]" : "bg-[#fff4e4] text-[#966419]"}`}>{portal?.signedAt ? `Assinado em ${formatDate(portal.signedAt)}` : "Pendente de assinatura"}</span><button type="button" onClick={() => openContract(patient)} className="rounded-xl bg-[#a3113a] px-4 py-3 text-xs font-semibold text-white">Visualizar documento completo</button></div></article>; })}{visible.length === 0 && <p className="py-12 text-center text-sm text-[#817578]">Nenhum contrato encontrado.</p>}</div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="rounded-2xl border border-[#eee5e0] bg-white p-5"><p className="text-xs text-[#817578]">{label}</p><p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p></div>;
}
