"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DemoPatientRecord,
  DemoPrescription,
  DemoInvoice,
  readDemoInvoices,
  openDemoInvoicePdf,
  readDemoPrescriptions,
  readDemoStock,
  subscribeDemoPatients,
} from "../medico/patient-store";
import { buildBottleHistory } from "./bottle-history";
import { buildAutomaticPatientNotifications } from "./patient-notifications";
import {
  PatientAssessment,
  PatientBottle,
  PatientPortalState,
  PatientReminderSettings,
  createDefaultPortalState,
  getActivePortalPatient,
  normalizeCpf,
  readPortalState,
  savePortalState,
  subscribePortalState,
} from "./patient-portal-store";

type PatientSection = "inicio" | "frasco" | "alertas" | "calendario" | "receitas" | "notas" | "notas-fiscais" | "termo";

const navigation: { id: PatientSection; icon: string; label: string; short: string }[] = [
  { id: "inicio", icon: "⌂", label: "Página inicial", short: "Início" },
  { id: "frasco", icon: "◉", label: "Frasco", short: "Frasco" },
  { id: "alertas", icon: "◷", label: "Alertas", short: "Alertas" },
  { id: "calendario", icon: "▦", label: "Calendário geral", short: "Dias" },
  { id: "receitas", icon: "▤", label: "Receitas", short: "Receitas" },
  { id: "notas", icon: "☰", label: "Notas", short: "Notas" },
  { id: "notas-fiscais", icon: "▧", label: "Notas fiscais", short: "NFs" },
  { id: "termo", icon: "▤", label: "Termo", short: "Termo" },
];

const vaccineWhatsAppUrl = `https://wa.me/5541999999999?text=${encodeURIComponent(
  "Olá! Sou paciente do CRA Care e gostaria de falar com o setor de vacinas.",
)}`;

const weekdays = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda-feira" },
  { value: 2, short: "Ter", label: "Terça-feira" },
  { value: 3, short: "Qua", label: "Quarta-feira" },
  { value: 4, short: "Qui", label: "Quinta-feira" },
  { value: 5, short: "Sex", label: "Sexta-feira" },
  { value: 6, short: "Sáb", label: "Sábado" },
];

const assessmentOptions: {
  value: PatientAssessment["feeling"];
  emoji: string;
  label: string;
}[] = [
  { value: "muito-bem", emoji: "😊", label: "Muito bem" },
  { value: "bem", emoji: "🙂", label: "Bem" },
  { value: "sem-mudancas", emoji: "😐", label: "Não percebi mudanças" },
  { value: "desconfortos", emoji: "😕", label: "Tive alguns desconfortos" },
  { value: "nao-bem", emoji: "😟", label: "Não me senti bem" },
];

const symptomFrequencyOptions = [
  ["raramente", "Raramente (menos de 1 dia por semana)"], ["as-vezes", "Às vezes (1–3 dias por semana)"], ["frequentemente", "Frequentemente (4–6 dias por semana)"], ["quase-diariamente", "Quase diariamente"],
] as const;
const symptomSeverityOptions = [
  ["leves", "Leves (não afetam as atividades diárias)"], ["moderados", "Moderados (algumas limitações nas atividades diárias)"], ["severos", "Severos (limitações significativas nas atividades diárias)"], ["muito-severos", "Muito severos (incapacidade)"],
] as const;
const medicationFrequencyOptions = [["nunca", "Nunca"], ["1-2", "1–2 vezes"], ["3-5", "3–5 vezes"], ["todos-os-dias", "Todos os dias"]] as const;

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

function formatDate(value?: string, includeTime = false) {
  if (!value) return "Ainda não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(value.length <= 10 ? parseDate(value) : new Date(value));
}

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return replacements[character];
  });
}

function openPrintableDocument(title: string, sections: { heading: string; text: string }[]) {
  const popup = window.open("", "_blank", "width=900,height=720");

  if (!popup) return false;

  const content = sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.text).replace(/\n/g, "<br>")}</p></section>`,
    )
    .join("");

  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;color:#34292d;max-width:760px;margin:48px auto;padding:0 24px}header{border-bottom:2px solid #a3113a;padding-bottom:20px}h1{color:#a3113a;font-size:26px}h2{font-size:16px;color:#86203b;margin-top:28px}p{font-size:14px;line-height:1.8}footer{margin-top:48px;border-top:1px solid #eadfd9;padding-top:16px;color:#776b6e;font-size:12px}@media print{body{margin:20px auto}}</style></head><body><header><strong>CRA Care · Centro de Rinite e Alergia</strong><h1>${escapeHtml(title)}</h1></header>${content}<footer>Documento gerado pelo portal CRA Care · ${escapeHtml(formatDate(new Date().toISOString(), true))}</footer></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();

  return true;
}

function contractSections(patient: DemoPatientRecord, portal: PatientPortalState) {
  return [
    {
      heading: "Identificação do paciente",
      text: `Nome do paciente: ${patient.name}\nCPF: ${patient.cpf}\nData de nascimento: ${formatDate(patient.birthDate)}\nInício do tratamento: ${formatDate(patient.startDate)}\nTelefone: ${patient.phone ?? "Não informado"}\nE-mail: ${patient.email ?? "Não informado"}\nMédico solicitante: ${patient.doctor}`,
    },
    {
      heading: "Adesão ao tratamento",
      text: "Declaro que estou aderindo voluntariamente ao tratamento de Imunoterapia Alérgeno Específica (IAE), indicado para o tratamento de alergias. Fui informado(a) de que esse tratamento utiliza doses controladas e personalizadas de alérgenos com o objetivo de reduzir ou eliminar reações alérgicas e melhorar a qualidade de vida. Também fui informado(a) de que existem outras alternativas de tratamento, como o uso de medicamentos para controle dos sintomas.",
    },
    {
      heading: "Pontos importantes do tratamento",
      text: `1. O tratamento é planejado tecnicamente e de forma personalizada pelo médico responsável. A dose, a fase e a composição podem ser ajustadas ao longo do tratamento. É necessária consulta médica a cada 3 meses ou conforme orientação médica.\n\n2. A duração média do tratamento é de 3 anos, sendo necessários pelo menos 6 meses para avaliar sua eficácia. Os resultados variam de pessoa para pessoa e não há garantia de sucesso.\n\n3. É fundamental seguir corretamente as orientações médicas e as datas de administração da vacina.\n\nDeclaro que tive a oportunidade de esclarecer dúvidas sobre benefícios, riscos, efeitos colaterais, duração, custos e necessidade de acompanhamento médico.\n\nTratamento indicado: ${patient.treatment ?? "Imunoterapia Alérgeno Específica (IAE)"}.`,
    },
    {
      heading: "Orientações para o uso da vacina",
      text: "• A alimentação pode ser realizada normalmente antes da aplicação. Após escovar os dentes, aguarde 20 minutos.\n• Siga corretamente a quantidade de gotas por dia, conforme a tabela ou a orientação do médico ou da enfermagem.\n• Aplique a vacina em frente ao espelho, embaixo da língua.\n• Mantenha as gotas embaixo da língua, na região vestibular, por aproximadamente 2 minutos e depois engula.\n• É normal sentir leve formigamento ou dormência na língua.\n• Após a aplicação, permaneça em jejum por 45 minutos, sem ingerir alimentos, água ou outros líquidos.\n• A vacina pode ser aplicada pela manhã ou à noite.\n• Mantenha a vacina sempre refrigerada.\n• Em viagens, a vacina pode permanecer fora da geladeira por no máximo 4 dias e deve ser transportada com cuidado, em mala ou caixa de isopor climatizada.",
    },
    {
      heading: "Valores, pagamento e cancelamento",
      text: `Tratamento Imunoterápico (Alérgeno Específico) — orientação e planejamento técnico.\nValor: R$ 270,00.\nForma de pagamento: Recorrência.\nMétodo registrado no CRA Care: ${patient.acquisitionMethod ?? "Não informado"}${patient.paymentMethod ? ` · ${patient.paymentMethod}` : ""}.\nO paciente poderá cancelar o tratamento a qualquer momento, mediante pagamento de multa correspondente a 1 mensalidade.`,
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

function countScheduledDays(bottle: PatientBottle | undefined, reminders: PatientReminderSettings) {
  if (!bottle || reminders.weekdays.length === 0) return 0;

  const cursor = parseDate(bottle.startedAt);
  const last = bottle.finishedAt ? parseDate(bottle.finishedAt) : new Date();
  let count = 0;
  let guard = 0;

  while (cursor <= last && guard < 3660) {
    if (reminders.weekdays.includes(cursor.getDay())) count += 1;
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  return count;
}

function AssessmentQuestion<T extends string>({ title, options, value, onChange }: { title: string; options: readonly (readonly [T, string])[]; value: T | ""; onChange: (value: T) => void }) {
  return <fieldset className="mt-6"><legend className="text-sm font-bold leading-6 text-[#544449]">{title}</legend><div className="mt-3 space-y-2">{options.map(([optionValue, label]) => <button key={optionValue} type="button" onClick={() => onChange(optionValue)} className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${value === optionValue ? "border-[#b91142] bg-[#fff5f7] font-semibold text-[#a3113a]" : "border-[#eee6e2] text-[#544449]"}`}>{label}</button>)}</div></fieldset>;
}

export default function PatientPortalPage() {
  const [patient, setPatient] = useState<DemoPatientRecord | null>(null);
  const [portal, setPortal] = useState<PatientPortalState | null>(null);
  const [prescriptions, setPrescriptions] = useState<DemoPrescription[]>([]);
  const [invoices, setInvoices] = useState<DemoInvoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [section, setSection] = useState<PatientSection>("inicio");
  const [signatureName, setSignatureName] = useState("");
  const [signatureCpf, setSignatureCpf] = useState("");
  const [acceptedTerm, setAcceptedTerm] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [message, setMessage] = useState("");
  const [reminderDraft, setReminderDraft] = useState<PatientReminderSettings>({
    enabled: false,
    weekdays: [1, 3, 5],
    time: "09:00",
  });
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const current = new Date();
    return new Date(current.getFullYear(), current.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [finishDate, setFinishDate] = useState(() => dateKey(new Date()));
  const [showFinishForm, setShowFinishForm] = useState(false);
  const [assessmentSymptomFrequency, setAssessmentSymptomFrequency] = useState<NonNullable<PatientAssessment["symptomFrequency"]> | "">("");
  const [assessmentSymptomSeverity, setAssessmentSymptomSeverity] = useState<NonNullable<PatientAssessment["symptomSeverity"]> | "">("");
  const [assessmentMedicationFrequency, setAssessmentMedicationFrequency] = useState<NonNullable<PatientAssessment["medicationFrequency"]> | "">("");
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const synchronize = () => {
      const activePatient = getActivePortalPatient();

      if (!activePatient) {
        setPatient(null);
        setPortal(null);
        setLoaded(true);
        return;
      }

      const current = readPortalState(activePatient.id);
      setPatient(activePatient);
      setPortal(current);
      setReminderDraft(current.reminders);
      setPrescriptions(readDemoPrescriptions(activePatient.id));
      setInvoices(readDemoInvoices(activePatient.id));
      setLoaded(true);
    };

    queueMicrotask(synchronize);

    const unsubscribePortal = subscribePortalState(synchronize);
    const unsubscribePatients = subscribeDemoPatients(synchronize);

    return () => {
      unsubscribePortal();
      unsubscribePatients();
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setPermission("Notification" in window ? Notification.permission : "unsupported");
    });
  }, []);

  const safePortal = portal ?? createDefaultPortalState(patient?.id ?? "");
  const bottleHistory = patient
    ? buildBottleHistory(patient, safePortal, readDemoStock())
    : [];
  const currentBottle = safePortal.bottles.find((bottle) => bottle.status === "em-uso");
  const lastBottle = safePortal.bottles[0];
  const pendingAssessmentBottle = safePortal.bottles.find(
    (bottle) =>
      bottle.status === "finalizado" &&
      !safePortal.assessments.some((assessment) => assessment.bottleId === bottle.id),
  );
  const latestPrescription = prescriptions[0];
  const currentBottleRecords = safePortal.useRecords.filter(
    (record) => record.bottleId === currentBottle?.id,
  );
  const scheduledDays = countScheduledDays(currentBottle, safePortal.reminders);
  const regularity = scheduledDays
    ? Math.min(100, Math.round((currentBottleRecords.length / scheduledDays) * 100))
    : currentBottleRecords.length > 0
      ? 100
      : 0;
  const today = dateKey(new Date());
  const todayRecord = currentBottleRecords.find((record) => record.date === today);

  const chartDays = Array.from({ length: 7 }, (_, index) => {
      const current = new Date();
      current.setDate(current.getDate() - (6 - index));
      const key = dateKey(current);

      return {
        date: key,
        label: weekdays[current.getDay()].short,
        used: safePortal.useRecords.some((record) => record.date === key),
        scheduled: safePortal.reminders.weekdays.includes(current.getDay()),
      };
    });

  const patientNotes = useMemo(() => {
    const notes = prescriptions.flatMap((prescription) => {
      const entries = [
        {
          id: `${prescription.id}-posology`,
          title: "Orientação de uso",
          text: prescription.posology,
          date: prescription.createdAt,
          author: prescription.doctor,
        },
      ];

      if (prescription.notes.trim()) {
        entries.push({
          id: `${prescription.id}-notes`,
          title: "Observações médicas",
          text: prescription.notes,
          date: prescription.createdAt,
          author: prescription.doctor,
        });
      }

      return entries;
    });

    if (patient?.notes?.trim()) {
      notes.unshift({
        id: `patient-${patient.id}-notes`,
        title: "Orientações da equipe",
        text: patient.notes,
        date: patient.createdAt,
        author: "Secretaria CRA",
      });
    }

    return notes;
  }, [patient, prescriptions]);

  useEffect(() => {
    if (
      !patient ||
      !portal?.signedAt ||
      !portal.reminders.enabled ||
      !currentBottle ||
      permission !== "granted"
    ) {
      return;
    }

    const checkReminder = () => {
      const current = new Date();
      const time = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`;
      const notifiedKey = `cra-care-reminder-${patient.id}-${dateKey(current)}-${time}`;

      if (
        !portal.reminders.weekdays.includes(current.getDay()) ||
        portal.reminders.time !== time ||
        window.sessionStorage.getItem(notifiedKey)
      ) {
        return;
      }

      new Notification("CRA Care · Hora do seu tratamento", {
        body: `Olá, ${patient.name.split(" ")[0]}! Este é um lembrete gentil para registrar o uso do seu frasco.`,
      });
      window.sessionStorage.setItem(notifiedKey, "sent");
    };

    checkReminder();
    const interval = window.setInterval(checkReminder, 30_000);

    return () => window.clearInterval(interval);
  }, [currentBottle, patient, permission, portal]);

  function updatePortal(next: PatientPortalState) {
    savePortalState(next);
    setPortal(next);
  }

  function signTerm() {
    if (!patient || !portal) return;

    if (normalizeName(signatureName) !== normalizeName(patient.name)) {
      setSignatureError("Digite seu nome completo exatamente como consta no cadastro.");
      return;
    }

    if (normalizeCpf(signatureCpf) !== normalizeCpf(patient.cpf)) {
      setSignatureError("O CPF informado precisa ser igual ao CPF do cadastro.");
      return;
    }

    if (!acceptedTerm) {
      setSignatureError("Confirme a leitura e concordância para continuar.");
      return;
    }

    updatePortal({
      ...portal,
      signedAt: new Date().toISOString(),
      signedName: signatureName.trim(),
      signedCpf: patient.cpf,
    });
    setSignatureError("");
    setMessage("Termo assinado com sucesso. Seja bem-vindo ao seu acompanhamento!");
  }

  function startBottle() {
    if (!portal || currentBottle || pendingAssessmentBottle) return;

    const bottle: PatientBottle = {
      id: crypto.randomUUID(),
      number: portal.bottles.length + 1,
      receivedAt: bottleHistory.find(
        (item) => item.number === portal.bottles.length + 1,
      )?.receivedAt,
      startedAt: today,
      status: "em-uso",
    };

    updatePortal({ ...portal, bottles: [bottle, ...portal.bottles] });
    setShowFinishForm(false);
    setMessage(`Frasco ${bottle.number} iniciado! Agora você já pode registrar seus dias de uso.`);
    setSection("frasco");
  }

  function toggleUse(date: string) {
    if (!portal || !patient || !currentBottle) {
      setMessage("Inicie um frasco antes de registrar o uso do tratamento.");
      return;
    }

    if (date > today) {
      setMessage("Não é possível registrar o uso em uma data futura.");
      return;
    }

    const matchingBottle = portal.bottles.find((bottle) =>
      date >= bottle.startedAt && (!bottle.finishedAt || date <= bottle.finishedAt),
    ) ?? currentBottle;
    const existing = portal.useRecords.find((record) => record.date === date);
    const dayOverrides = { ...portal.dayOverrides };
    delete dayOverrides[date];

    if (existing) {
      updatePortal({
        ...safePortal,
        useRecords: portal.useRecords.filter((record) => record.id !== existing.id),
        dayOverrides,
      });
      setMessage(`Registro de ${formatDate(date)} removido.`);
      return;
    }

    updatePortal({
      ...portal,
      useRecords: [
        {
          id: crypto.randomUUID(),
          bottleId: matchingBottle.id,
          date,
          registeredAt: new Date().toISOString(),
          drops: latestPrescription?.drops ?? patient.drops ?? 6,
        },
        ...portal.useRecords,
      ],
      dayOverrides,
    });
    setMessage(`Uso registrado em ${formatDate(date)}. Você está cuidando de você!`);
  }

  function setCalendarDayStatus(date: string, status: "off" | "nao-registrado") {
    if (!portal || !currentBottle) {
      setMessage("Inicie um frasco antes de editar os dias do tratamento.");
      return;
    }

    if (date > today) {
      setMessage("Não é possível editar uma data futura.");
      return;
    }

    updatePortal({
      ...portal,
      useRecords: portal.useRecords.filter((record) => record.date !== date),
      dayOverrides: { ...portal.dayOverrides, [date]: status },
    });
    setMessage(`${formatDate(date)} marcado como ${status === "off" ? "dia OFF" : "não registrado"}.`);
  }

  function finishBottle() {
    if (!portal || !currentBottle) return;

    if (finishDate < currentBottle.startedAt || finishDate > today) {
      setMessage("Informe uma data de finalização válida para o frasco.");
      return;
    }

    updatePortal({
      ...portal,
      bottles: portal.bottles.map((bottle) =>
        bottle.id === currentBottle.id
          ? { ...bottle, finishedAt: finishDate, status: "finalizado" }
          : bottle,
      ),
    });
    setShowFinishForm(false);
    setAssessmentNotes("");
  }

  function saveAssessment() {
    if (!portal || !pendingAssessmentBottle || !assessmentSymptomFrequency || !assessmentSymptomSeverity || !assessmentMedicationFrequency) return;

    updatePortal({
      ...portal,
      assessments: [
        {
          id: crypto.randomUUID(),
          bottleId: pendingAssessmentBottle.id,
          bottleNumber: pendingAssessmentBottle.number,
          symptomFrequency: assessmentSymptomFrequency,
          symptomSeverity: assessmentSymptomSeverity,
          medicationFrequency: assessmentMedicationFrequency,
          notes: assessmentNotes.trim(),
          createdAt: new Date().toISOString(),
        },
        ...portal.assessments,
      ],
    });
    setAssessmentSymptomFrequency("");
    setAssessmentSymptomSeverity("");
    setAssessmentMedicationFrequency("");
    setAssessmentNotes("");
    setMessage("Autoavaliação registrada! Quando estiver pronto, adicione o próximo frasco.");
  }

  async function saveReminders() {
    if (!portal) return;

    if (reminderDraft.enabled && reminderDraft.weekdays.length === 0) {
      setMessage("Selecione pelo menos um dia da semana para os lembretes.");
      return;
    }

    if (reminderDraft.enabled && "Notification" in window && Notification.permission === "default") {
      const result = await Notification.requestPermission();
      setPermission(result);
    }

    updatePortal({ ...portal, reminders: reminderDraft });
    setMessage(
      reminderDraft.enabled
        ? "Lembretes salvos! Seus dias e horário de tratamento foram atualizados."
        : "Lembretes desativados. Você pode reativá-los quando quiser.",
    );
  }

  function downloadTerm() {
    if (!patient || !portal) return;

    if (!openPrintableDocument("Termo de adesão — Imunoterapia Alérgeno Específica (IAE)", contractSections(patient, portal))) {
      setMessage("Permita a abertura de janelas para visualizar e salvar o termo em PDF.");
    }
  }

  function downloadNotes() {
    if (!patient) return;

    const entries = patientNotes.length
      ? patientNotes.map((note) => ({
          heading: `${note.title} · ${formatDate(note.date)}`,
          text: `${note.text}\nResponsável: ${note.author}`,
        }))
      : [{ heading: "Observações", text: "Nenhuma nota registrada até o momento." }];

    if (
      !openPrintableDocument(`Notas do tratamento · ${patient.name}`, [
        { heading: "Paciente", text: `${patient.name}\nCPF: ${patient.cpf}` },
        ...entries,
      ])
    ) {
      setMessage("Permita a abertura de janelas para visualizar e salvar as notas em PDF.");
    }
  }

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf7f5] text-[#a3113a]">
        Preparando seu acompanhamento...
      </main>
    );
  }

  if (!patient || !portal) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf7f5] px-5">
        <div className="w-full max-w-md rounded-[32px] border border-[#eee5e0] bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-[#86203b]">Acesso do paciente</h1>
          <p className="mt-3 text-sm text-[#766b6e]">Entre com o CPF cadastrado pela clínica para continuar.</p>
          <Link href="/" className="mt-6 inline-flex rounded-2xl bg-[#a3113a] px-5 py-3 text-sm font-semibold text-white">
            Voltar ao login
          </Link>
        </div>
      </main>
    );
  }

  if (!portal.signedAt) {
    return (
      <main className="min-h-screen bg-[#faf7f5] px-4 py-7 text-[#34292d] sm:px-6 sm:py-12">
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[32px] border border-[#eee5e0] bg-white shadow-[0_25px_80px_rgba(127,13,45,0.10)]">
          <header className="bg-gradient-to-br from-[#bf1545] via-[#a3113a] to-[#740a28] px-6 py-7 text-white sm:px-10">
            <div className="flex items-center justify-between gap-4">
              <Image src="/logo-cra-branca.png" alt="CRA - Centro de Rinite e Alergia" width={160} height={108} priority className="h-auto w-28" />
              <Link href="/" className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20">Sair</Link>
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">Primeiro acesso · etapa obrigatória</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Termo de adesão — Imunoterapia Alérgeno Específica (IAE)</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">
              Olá, {patient.name.split(" ")[0]}! Antes de acessar seu acompanhamento, leia e assine o termo do seu tratamento.
            </p>
          </header>

          <div className="px-6 py-7 sm:px-10 sm:py-9">
            <div className="max-h-[340px] space-y-5 overflow-y-auto rounded-2xl border border-[#eee5e0] bg-[#fcfaf8] p-5 sm:p-6">
              {contractSections(patient, portal).slice(0, -1).map((item) => (
                <section key={item.heading}>
                  <h2 className="text-sm font-bold text-[#86203b]">{item.heading}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-[#65585c]">{item.text}</p>
                </section>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[#544449]">
                Nome completo
                <input value={signatureName} onChange={(event) => { setSignatureName(event.target.value); setSignatureError(""); }} placeholder="Digite seu nome completo" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 text-sm font-normal outline-none focus:border-[#b91142]" />
              </label>
              <label className="text-sm font-semibold text-[#544449]">
                CPF
                <input value={signatureCpf} onChange={(event) => { setSignatureCpf(event.target.value); setSignatureError(""); }} inputMode="numeric" placeholder="000.000.000-00" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 text-sm font-normal outline-none focus:border-[#b91142]" />
              </label>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 text-[#66595d]">
              <input type="checkbox" checked={acceptedTerm} onChange={(event) => { setAcceptedTerm(event.target.checked); setSignatureError(""); }} className="mt-1 h-4 w-4 accent-[#a3113a]" />
              Li o Termo de adesão à Imunoterapia Alérgeno Específica, compreendi as orientações apresentadas e concordo com seu conteúdo.
            </label>

            {signatureError && <p role="alert" className="mt-4 rounded-xl bg-[#fff1f3] px-4 py-3 text-sm text-[#a3113a]">{signatureError}</p>}

            <button type="button" onClick={signTerm} className="mt-6 w-full rounded-2xl bg-[#a3113a] px-5 py-4 text-sm font-bold text-white hover:bg-[#870e31]">
              Assinar termo e acessar meu tratamento
            </button>
            <p className="mt-4 text-center text-xs text-[#817578]">O termo permanecerá disponível no seu menu após a assinatura.</p>
          </div>
        </div>
      </main>
    );
  }

  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(calendarMonth);
  const firstWeekday = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const monthDayCount = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarDays = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: monthDayCount }, (_, index) => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1)),
  ];
  const selectedRecord = portal.useRecords.find((record) => record.date === selectedDate);
  const selectedDayOverride = portal.dayOverrides?.[selectedDate];
  const selectedWeekday = parseDate(selectedDate).getDay();
  const selectedScheduled = portal.reminders.weekdays.includes(selectedWeekday);
  const milestone = currentBottleRecords.length >= 30
    ? { emoji: "🌷", text: "Você chegou a uma nova etapa do seu tratamento. Para manter tudo certinho e evitar interrupções, pode ser um bom momento para solicitar o próximo frasco." }
    : currentBottleRecords.length >= 20
      ? { emoji: "💗", text: "Você já avançou bastante no seu tratamento! Quando puder, que tal verificar sua consulta de acompanhamento? Assim, sua equipe poderá continuar acompanhando sua evolução." }
      : null;
  const missedDays = currentBottle
    ? Array.from({ length: Math.max(0, Math.floor((parseDate(today).getTime() - parseDate(currentBottle.startedAt).getTime()) / 86_400_000)) }, (_, index) => {
        const day = parseDate(currentBottle.startedAt);
        day.setDate(day.getDate() + index);
        const key = dateKey(day);
        const scheduled = portal.reminders.weekdays.includes(day.getDay());
        const recorded = portal.useRecords.some((record) => record.date === key);
        const override = portal.dayOverrides?.[key];
        return scheduled && !recorded && override !== "off";
      }).filter(Boolean).length
    : 0;
  const automaticNotifications = buildAutomaticPatientNotifications(patient, currentBottle, new Date());
  const notifications = [
    ...automaticNotifications,
    ...(currentBottle && portal.reminders.enabled && portal.reminders.weekdays.includes(new Date().getDay()) && !todayRecord
      ? [{ id: `reminder-${today}-${portal.reminders.time}`, icon: "💊", title: "Uso programado para hoje", text: `Seu lembrete está configurado para ${portal.reminders.time}. Registre o uso quando realizar o tratamento.` }]
      : []),
    ...(missedDays > 0
      ? [{ id: `missed-${currentBottle?.id}-${missedDays}`, icon: "📅", title: `${missedDays} ${missedDays === 1 ? "dia precisa" : "dias precisam"} de atenção`, text: "Confira o calendário e atualize os dias que ficaram sem registro." }]
      : []),
    ...(pendingAssessmentBottle
      ? [{ id: `assessment-${pendingAssessmentBottle.id}`, icon: "📝", title: "Autoavaliação disponível", text: `Conte como você se sentiu durante o uso do frasco ${pendingAssessmentBottle.number}.` }]
      : []),
  ];
  const readNotificationIds = portal.readNotificationIds ?? [];
  const unreadCount = notifications.filter((notification) => !readNotificationIds.includes(notification.id)).length;

  function openNotifications() {
    const nextOpen = !showNotifications;
    setShowNotifications(nextOpen);

    if (nextOpen && unreadCount > 0) {
      updatePortal({
        ...safePortal,
        readNotificationIds: Array.from(new Set([...readNotificationIds, ...notifications.map((notification) => notification.id)])),
      });
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf7f5] pb-24 text-[#34292d] lg:pb-0">
      <div className="min-h-screen lg:grid lg:grid-cols-[285px_minmax(0,1fr)]">
        <aside className="hidden bg-gradient-to-b from-[#b31340] to-[#790b2a] px-7 py-8 text-white lg:block">
          <Image src="/logo-cra-branca.png" alt="CRA - Centro de Rinite e Alergia" width={170} height={115} priority className="h-auto w-36" />
          <p className="mt-4 text-sm text-white/70">Meu tratamento</p>
          <nav className="mt-9 space-y-2">
            {navigation.map((item) => (
              <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm ${section === item.id ? "bg-white/15 font-semibold" : "text-white/80 hover:bg-white/10"}`}>
                <span className="text-lg">{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>
          <div className="mt-12 rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-sm font-semibold">Seu cuidado, no seu ritmo</p>
            <p className="mt-2 text-xs leading-5 text-white/75">Acompanhe sua evolução e mantenha contato com sua equipe.</p>
          </div>
          <Link href="/" className="mt-8 inline-flex text-sm font-semibold text-white/85 hover:text-white">← Sair do portal</Link>
        </aside>

        <div className="min-w-0">
          <header className="relative z-30 bg-gradient-to-br from-[#bf1545] via-[#a3113a] to-[#790b2a] px-5 pb-12 pt-7 text-white sm:px-8 lg:px-10 lg:pb-12 lg:pt-9">
            <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/75">CRA Care · seu acompanhamento</p>
                <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Olá, {patient.name.split(" ")[0]} 💗</h1>
                <p className="mt-2 text-sm text-white/80">Um passo de cada vez. Estamos com você.</p>
              </div>
              <div className="relative flex flex-col items-end gap-3">
                <Image src="/logo-cra-branca.png" alt="CRA" width={118} height={80} priority className="h-auto w-20 sm:w-24" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={openNotifications} aria-label={`Notificações${unreadCount ? `, ${unreadCount} nova(s)` : ""}`} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-lg hover:bg-white/20">
                    🔔
                    {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ffd45c] px-1 text-[10px] font-bold text-[#7a1833]">{unreadCount}</span>}
                  </button>
                  <Link href="/" className="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/20">Sair</Link>
                </div>
                {showNotifications && (
                  <div className="absolute right-0 top-full z-[70] mt-3 w-[min(92vw,460px)] overflow-hidden rounded-2xl border border-[#eadfd9] bg-white text-[#34292d] shadow-[0_24px_70px_rgba(52,20,30,0.28)]">
                    <div className="flex items-center justify-between border-b border-[#eee5e0] px-4 py-3"><div><p className="text-sm font-bold text-[#86203b]">Notificações</p><p className="mt-0.5 text-[11px] text-[#817578]">Avisos do seu tratamento</p></div><button type="button" onClick={() => setShowNotifications(false)} aria-label="Fechar notificações" className="rounded-lg px-2 py-1 text-lg text-[#817578]">×</button></div>
                    <div className="max-h-[65vh] overflow-y-auto p-2">
                      {notifications.length === 0 ? <p className="px-4 py-8 text-center text-sm text-[#817578]">Tudo certo por aqui. Nenhum aviso no momento.</p> : notifications.map((notification) => { const unread = !readNotificationIds.includes(notification.id); return <article key={notification.id} className={`flex gap-3 rounded-xl px-3 py-3 hover:bg-[#fcf6f4] ${unread ? "bg-[#fff8fa]" : ""}`}><span className="text-xl">{notification.icon}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold text-[#433438]">{notification.title}</p>{unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#b31340]" aria-label="Não lida" />}</div><p className="mt-1 whitespace-pre-line text-xs leading-5 text-[#74676a]">{notification.text}</p></div></article>; })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <section className="relative z-10 mx-auto mt-0 max-w-5xl px-4 pb-8 pt-5 sm:px-6 lg:px-10">
            {message && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#cfe9df] bg-[#edf8f3] px-4 py-3 text-sm text-[#187157] shadow-sm">
                <span>{message}</span><button type="button" onClick={() => setMessage("")} aria-label="Fechar mensagem">×</button>
              </div>
            )}

            {section === "inicio" && (
              <div className="space-y-5">
                <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Seu tratamento</p><h2 className="mt-2 text-xl font-bold text-[#433438]">{patient.treatment ?? "Acompanhamento CRA"}</h2><p className="mt-2 text-sm text-[#817578]">{latestPrescription?.posology ?? "Siga a orientação da sua equipe médica."}</p></div>
                    <span className="self-start rounded-full bg-[#edf8f3] px-3 py-1.5 text-xs font-semibold text-[#187157]">{currentBottle ? `Frasco ${currentBottle.number} em uso` : "Pronto para começar"}</span>
                  </div>
                  {currentBottle && <button type="button" onClick={() => toggleUse(today)} className={`mt-5 w-full rounded-2xl px-4 py-3.5 text-sm font-semibold sm:w-auto ${todayRecord ? "bg-[#edf8f3] text-[#187157]" : "bg-[#a3113a] text-white"}`}>{todayRecord ? "✓ Uso de hoje registrado" : "Registrar uso de hoje"}</button>}
                  {!currentBottle && <button type="button" onClick={() => setSection("frasco")} className="mt-5 rounded-2xl bg-[#a3113a] px-4 py-3.5 text-sm font-semibold text-white">Acompanhar meu frasco</button>}
                </article>

                {milestone && <article className="rounded-[24px] border border-[#f2dce2] bg-[#fff5f7] px-5 py-5"><p className="text-lg">{milestone.emoji}</p><p className="mt-2 text-sm leading-7 text-[#754751]">{milestone.text}</p></article>}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    { label: "Frascos recebidos", value: String(patient.bottlesReceived ?? 0), detail: patient.lastReceivedDate ? `Última entrega: ${formatDate(patient.lastReceivedDate)}` : "Sem entrega registrada" },
                    { label: "Frascos iniciados", value: String(portal.bottles.length), detail: "Registrados no portal" },
                    { label: "Aguardando início", value: String(Math.max(0, (patient.bottlesReceived ?? 0) - portal.bottles.length)), detail: "Recebidos e ainda fechados" },
                    { label: "Frasco atual", value: currentBottle ? `#${currentBottle.number}` : "—" },
                    { label: "Uso correto", value: `${regularity}%`, detail: `${portal.useRecords.length} dia(s) registrado(s)` },
                  ].map((item) => <article key={item.label} className="rounded-[22px] border border-[#eee5e0] bg-white p-4 shadow-sm"><p className="text-xs text-[#817578]">{item.label}</p><p className="mt-3 text-2xl font-bold text-[#a3113a]">{item.value}</p>{item.detail && <p className="mt-2 text-[11px] leading-4 text-[#817578]">{item.detail}</p>}</article>)}
                </div>

                <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                  <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#433438]">Sua evolução</h2><p className="mt-1 text-xs text-[#817578]">Regularidade dos últimos sete dias</p></div><span className="rounded-full bg-[#fff1f3] px-3 py-1 text-xs font-semibold text-[#a3113a]">{regularity}%</span></div>
                  <div className="mt-6 flex h-36 items-end justify-between gap-2 sm:gap-4">
                    {chartDays.map((day) => <div key={day.date} className="flex flex-1 flex-col items-center gap-2"><div className={`w-full max-w-12 rounded-t-xl ${day.used ? "h-24 bg-gradient-to-t from-[#a3113a] to-[#e36c8b]" : day.scheduled ? "h-10 bg-[#f7dfe4]" : "h-5 bg-[#efe9e6]"}`} /><span className="text-[11px] text-[#817578]">{day.label}</span></div>)}
                  </div>
                  <p className="mt-5 text-xs text-[#817578]">Tempo total previsto de tratamento: <strong>{patient.totalMonths ? `${patient.totalMonths} meses` : "A definir pela equipe"}</strong>.</p>
                </article>

                <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                  <h2 className="text-lg font-bold text-[#433438]">Suas autoavaliações</h2>
                  {portal.assessments.length === 0 ? <p className="mt-3 text-sm text-[#817578]">Ao finalizar um frasco, você poderá contar como se sentiu durante o período.</p> : <div className="mt-4 space-y-3">{portal.assessments.slice(0, 3).map((assessment) => { const feeling = assessmentOptions.find((option) => option.value === assessment.feeling); return <div key={assessment.id} className="rounded-2xl bg-[#fbf5f2] p-4"><p className="text-sm font-semibold">{assessment.symptomSeverity ? `Sintomas ${assessment.symptomSeverity}` : `${feeling?.emoji ?? "📝"} ${feeling?.label ?? "Avaliação registrada"}`}</p><p className="mt-1 text-xs text-[#817578]">Frasco {assessment.bottleNumber} · {formatDate(assessment.createdAt)}</p>{assessment.notes && <p className="mt-2 text-xs text-[#66595d]">{assessment.notes}</p>}<p className={`mt-3 text-xs font-semibold ${assessment.response ? "text-[#187157]" : assessment.viewedAt ? "text-[#3c5da0]" : "text-[#966419]"}`}>{assessment.response ? `✓ Equipe respondeu: ${assessment.response}` : assessment.viewedAt ? "✓ Sua avaliação foi visualizada pela equipe" : "Aguardando visualização da equipe"}</p></div>; })}</div>}
                </article>
              </div>
            )}

            {section === "frasco" && (
              <div className="space-y-5">
                <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Acompanhamento do tratamento</p>
                  <h2 className="mt-2 text-2xl font-bold text-[#433438]">Meu frasco</h2>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[{ label: "Recebidos", value: patient.bottlesReceived ?? 0 }, { label: "Iniciados", value: portal.bottles.length }, { label: "Concluídos", value: portal.bottles.filter((bottle) => bottle.status === "finalizado").length }, { label: "Aguardando início", value: Math.max(0, (patient.bottlesReceived ?? 0) - portal.bottles.length) }].map((item) => <div key={item.label} className="rounded-2xl bg-[#fbf5f2] p-4"><p className="text-xs text-[#817578]">{item.label}</p><p className="mt-2 text-2xl font-bold text-[#a3113a]">{item.value}</p></div>)}</div>
                  {currentBottle ? <><div className="mt-6 rounded-[24px] bg-gradient-to-br from-[#fff3f5] to-[#faf5f1] p-5"><div className="flex items-center justify-between gap-3"><span className="text-3xl">💊</span><span className="rounded-full bg-[#eaf8f3] px-3 py-1 text-xs font-semibold text-[#187157]">Em uso</span></div><h3 className="mt-4 text-xl font-bold text-[#86203b]">Frasco {currentBottle.number}</h3><p className="mt-2 text-sm text-[#66595d]">Iniciado em {formatDate(currentBottle.startedAt)}</p><p className="mt-1 text-sm text-[#66595d]">Fase: {latestPrescription?.phase ?? patient.phase ?? "A definir"}</p><p className="mt-1 text-sm text-[#66595d]">{latestPrescription?.posology ?? `${patient.drops ?? 6} gotas, conforme orientação médica.`}</p></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#fbf5f2] p-4"><p className="text-xs text-[#817578]">Dias registrados</p><p className="mt-2 text-2xl font-bold text-[#a3113a]">{currentBottleRecords.length}</p></div><div className="rounded-2xl bg-[#fbf5f2] p-4"><p className="text-xs text-[#817578]">Regularidade</p><p className="mt-2 text-2xl font-bold text-[#a3113a]">{regularity}%</p></div></div><button type="button" onClick={() => toggleUse(today)} className={`mt-5 w-full rounded-2xl px-4 py-3.5 text-sm font-semibold ${todayRecord ? "bg-[#edf8f3] text-[#187157]" : "bg-[#a3113a] text-white"}`}>{todayRecord ? "✓ Uso de hoje registrado" : "Registrar uso de hoje"}</button><button type="button" onClick={() => setShowFinishForm(!showFinishForm)} className="mt-3 w-full rounded-2xl border border-[#eadfd9] px-4 py-3.5 text-sm font-semibold text-[#a3113a]">Finalizar frasco</button>{showFinishForm && <div className="mt-4 rounded-2xl border border-[#eee5e0] bg-[#fcfaf8] p-4"><label className="block text-sm font-semibold text-[#544449]">Data de finalização<input type="date" min={currentBottle.startedAt} max={today} value={finishDate} onChange={(event) => setFinishDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#e9dfda] bg-white px-3 text-sm font-normal" /></label><button type="button" onClick={finishBottle} className="mt-4 w-full rounded-xl bg-[#a3113a] px-4 py-3 text-sm font-semibold text-white">Confirmar finalização</button></div>}</> : <div className="mt-6 rounded-[24px] border border-dashed border-[#e8dcd6] bg-[#fcfaf8] px-5 py-10 text-center"><p className="text-3xl">💊</p><h3 className="mt-4 text-lg font-bold text-[#433438]">{lastBottle ? "Tudo pronto para a próxima etapa" : "Vamos começar o seu acompanhamento?"}</h3><p className="mt-2 text-sm leading-6 text-[#817578]">{lastBottle ? "Adicione o próximo frasco para continuar registrando seu tratamento." : "Inicie seu frasco e acompanhe seus dias de uso de um jeito simples."}</p><button type="button" onClick={startBottle} disabled={Boolean(pendingAssessmentBottle)} className="mt-5 rounded-2xl bg-[#a3113a] px-5 py-3 text-sm font-semibold text-white disabled:opacity-45">{lastBottle ? "Adicionar próximo frasco" : "Iniciar frasco"}</button></div>}
                </article>

                {bottleHistory.length > 0 && (
                  <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                    <h2 className="text-lg font-bold text-[#433438]">Histórico completo dos frascos</h2>
                    <p className="mt-1 text-xs text-[#817578]">Datas de entrega registradas individualmente a partir do estoque.</p>
                    <div className="mt-4 space-y-3">
                      {bottleHistory.slice().reverse().map((item) => {
                        const status = item.status === "finalizado" ? "Concluído" : item.status === "em-uso" ? "Em uso" : "Recebido · aguardando início";
                        return (
                          <div key={item.number} className="rounded-2xl bg-[#fbf5f2] p-4">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold">Frasco {item.number}</p>
                              <span className={`rounded-full px-2 py-1 text-[11px] ${status === "Concluído" ? "bg-[#edf8f3] text-[#187157]" : status === "Em uso" ? "bg-[#fff4e4] text-[#966419]" : "bg-[#eef3ff] text-[#3c5da0]"}`}>{status}</span>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs text-[#817578] sm:grid-cols-3">
                              <p><strong>Recebimento:</strong> {formatDate(item.receivedAt)}</p>
                              <p><strong>Início:</strong> {formatDate(item.startedAt)}</p>
                              <p><strong>Conclusão:</strong> {formatDate(item.finishedAt)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                )}
              </div>
            )}

            {section === "alertas" && (
              <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Lembretes do tratamento</p><h2 className="mt-2 text-2xl font-bold text-[#433438]">Meus alertas</h2><p className="mt-2 text-sm leading-6 text-[#817578]">Escolha os dias e o horário em que você deseja lembrar do seu cuidado.</p>
                <button type="button" onClick={() => setReminderDraft((current) => ({ ...current, enabled: !current.enabled }))} className="mt-6 flex w-full items-center justify-between rounded-2xl bg-[#fbf5f2] p-4 text-left"><div><p className="text-sm font-bold text-[#433438]">Ativar lembretes</p><p className="mt-1 text-xs text-[#817578]">Receba avisos nos horários configurados.</p></div><span className={`flex h-7 w-12 items-center rounded-full p-1 ${reminderDraft.enabled ? "justify-end bg-[#a3113a]" : "justify-start bg-[#d9cfcb]"}`}><span className="h-5 w-5 rounded-full bg-white" /></span></button>
                <h3 className="mt-7 text-sm font-bold text-[#433438]">Dias da semana</h3><div className="mt-3 flex flex-wrap gap-2">{weekdays.map((day) => { const selected = reminderDraft.weekdays.includes(day.value); return <button key={day.value} type="button" onClick={() => setReminderDraft((current) => ({ ...current, weekdays: selected ? current.weekdays.filter((item) => item !== day.value) : [...current.weekdays, day.value].sort((first, second) => first - second) }))} className={`rounded-xl px-3 py-3 text-xs font-semibold ${selected ? "bg-[#a3113a] text-white" : "bg-[#f5efec] text-[#65585c]"}`}>{day.short}</button>; })}</div>
                <label className="mt-7 block text-sm font-bold text-[#433438]">Horário do lembrete<input type="time" value={reminderDraft.time} onChange={(event) => setReminderDraft((current) => ({ ...current, time: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 font-normal outline-none focus:border-[#b91142] sm:max-w-48" /></label>
                <button type="button" onClick={() => void saveReminders()} className="mt-7 w-full rounded-2xl bg-[#a3113a] px-4 py-3.5 text-sm font-semibold text-white sm:w-auto sm:px-7">Salvar meus alertas</button>
                <div className="mt-6 rounded-2xl bg-[#fff7ea] p-4 text-xs leading-6 text-[#806238]"><strong>Notificações no protótipo:</strong> os avisos do navegador funcionam enquanto esta página estiver aberta e com permissão concedida. O envio em segundo plano será integrado posteriormente.{permission === "denied" && <p className="mt-2">As notificações foram bloqueadas no navegador. Você pode reativá-las nas permissões do site.</p>}{permission === "unsupported" && <p className="mt-2">Este navegador não oferece notificações para esta página.</p>}</div>
              </article>
            )}

            {section === "calendario" && (
              <div className="space-y-5">
                <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Histórico do tratamento</p><h2 className="mt-2 text-2xl font-bold text-[#433438]">Calendário geral</h2>
                  <div className="mt-6 flex items-center justify-between"><button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded-xl bg-[#f7f2ef] px-4 py-2 text-[#a3113a]">←</button><p className="text-sm font-bold capitalize text-[#433438]">{monthLabel}</p><button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded-xl bg-[#f7f2ef] px-4 py-2 text-[#a3113a]">→</button></div>
                  <div className="mt-5 grid grid-cols-7 gap-1 text-center sm:gap-2">{weekdays.map((day) => <span key={day.value} className="py-2 text-[11px] font-semibold text-[#817578]">{day.short.slice(0, 1)}</span>)}{calendarDays.map((day, index) => { if (!day) return <span key={`blank-${index}`} />; const key = dateKey(day); const record = portal.useRecords.find((item) => item.date === key); const override = portal.dayOverrides?.[key]; const scheduled = portal.reminders.weekdays.includes(day.getDay()); const withinTreatment = Boolean(currentBottle && key <= today); const missed = override === "nao-registrado" || (!record && override !== "off" && scheduled && withinTreatment && key < today); const selected = selectedDate === key; return <button key={key} type="button" onClick={() => setSelectedDate(key)} className={`flex aspect-square items-center justify-center rounded-xl text-xs font-semibold sm:text-sm ${selected ? "ring-2 ring-[#a3113a] ring-offset-2" : ""} ${record ? "bg-[#dff3e8] text-[#187157]" : override === "off" ? "bg-[#f0ebe8] text-[#716569]" : missed ? "bg-[#ffe6e8] text-[#a73a46]" : scheduled && withinTreatment ? "bg-[#fff2f3] text-[#a3113a]" : "bg-[#f8f5f2] text-[#716569]"}`}>{day.getDate()}</button>; })}</div>
                  <div className="mt-6 flex flex-wrap gap-4 text-xs text-[#66595d]"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#dff3e8]" />Uso realizado</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#f0ebe8]" />Dia OFF</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#ffe6e8]" />Não registrado</span></div>
                </article>
                <article className="rounded-[24px] border border-[#eee5e0] bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-[#433438]">Detalhes de {formatDate(selectedDate)}</h3>
                  {selectedRecord ? (
                    <><p className="mt-3 text-sm font-semibold text-[#187157]">✓ Uso realizado</p><p className="mt-2 text-xs text-[#66595d]">{selectedRecord.drops} gotas · Registrado em {formatDate(selectedRecord.registeredAt, true)}</p></>
                  ) : (
                    <p className="mt-3 text-sm text-[#66595d]">{selectedDayOverride === "off" ? "Dia OFF: uso dispensado nesta data." : selectedDayOverride === "nao-registrado" ? "Dia de uso não registrado." : selectedScheduled ? "Dia previsto para uso, ainda sem registro." : "Dia OFF: sem uso programado."}</p>
                  )}
                  {currentBottle && selectedDate <= today && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => toggleUse(selectedDate)} className="rounded-xl bg-[#a3113a] px-4 py-2.5 text-xs font-semibold text-white">{selectedRecord ? "Remover registro deste dia" : "Registrar uso neste dia"}</button>
                      <button type="button" onClick={() => setCalendarDayStatus(selectedDate, "off")} className="rounded-xl border border-[#e6dbd6] px-4 py-2.5 text-xs font-semibold text-[#66595d]">Marcar como dia OFF</button>
                      <button type="button" onClick={() => setCalendarDayStatus(selectedDate, "nao-registrado")} className="rounded-xl border border-[#f1cfd4] px-4 py-2.5 text-xs font-semibold text-[#a73a46]">Marcar como não registrado</button>
                    </div>
                  )}
                  {selectedDate > today && <p className="mt-4 text-xs text-[#817578]">Datas futuras poderão ser editadas quando chegarem.</p>}
                </article>
              </div>
            )}

            {section === "notas" && (
              <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Orientações da equipe</p><h2 className="mt-2 text-2xl font-bold text-[#433438]">Minhas notas</h2></div><button type="button" onClick={downloadNotes} className="self-start rounded-xl border border-[#eadfd9] px-4 py-3 text-xs font-semibold text-[#a3113a]">Baixar notas em PDF</button></div>
                {patientNotes.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[#e8dcd6] bg-[#fcfaf8] px-5 py-10 text-center"><p className="text-sm font-semibold text-[#53454a]">Nenhuma nota disponível por enquanto.</p><p className="mt-2 text-xs text-[#817578]">As orientações médicas aparecerão aqui quando forem registradas.</p></div> : <div className="mt-6 space-y-4">{patientNotes.map((note) => <article key={note.id} className="rounded-2xl border border-[#eee6e2] bg-[#fdfbf9] p-4"><p className="text-sm font-bold text-[#433438]">{note.title}</p><p className="mt-2 text-sm leading-7 text-[#65585c]">{note.text}</p><p className="mt-3 text-xs text-[#817578]">{note.author} · {formatDate(note.date)}</p></article>)}</div>}
              </article>
            )}

            {section === "receitas" && (
              <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Prescrições médicas</p><h2 className="mt-2 text-2xl font-bold text-[#433438]">Minhas receitas</h2><p className="mt-2 text-sm leading-6 text-[#817578]">Consulte as receitas emitidas pelo seu médico durante o tratamento.</p>
                <div className="mt-6 space-y-3">{prescriptions.length === 0 ? <p className="rounded-2xl border border-dashed border-[#e6dbd6] px-5 py-10 text-center text-sm text-[#817578]">Nenhuma receita disponível no momento.</p> : prescriptions.map((prescription, index) => <article key={prescription.id} className="rounded-2xl bg-[#fbf5f2] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-[#433438]">Receita {String(prescriptions.length - index).padStart(2, "0")}</p><p className="mt-1 text-xs text-[#817578]">{formatDate(prescription.createdAt)} · {prescription.doctor}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#a3113a]">{prescription.bottles} frasco(s)</span></div><p className="mt-3 text-sm text-[#66595d]">{prescription.treatment} · {prescription.phase}</p><p className="mt-2 text-xs text-[#817578]">{prescription.formulas.map((item) => `${item.name} ${item.percentage}%`).join(" · ")}</p></article>)}</div>
              </article>
            )}

            {section === "notas-fiscais" && (
              <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Meus documentos</p>
                <h2 className="mt-2 text-2xl font-bold text-[#433438]">Notas fiscais</h2>
                <p className="mt-2 text-sm leading-6 text-[#817578]">Consulte ou baixe as notas fiscais disponibilizadas pela secretaria.</p>
                <div className="mt-6 space-y-3">
                  {invoices.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[#e6dbd6] px-5 py-10 text-center text-sm text-[#817578]">Nenhuma nota fiscal disponível no momento.</p>
                  ) : invoices.map((invoice) => (
                    <div key={invoice.id} className="flex flex-col gap-4 rounded-2xl bg-[#fbf5f2] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-sm font-bold text-[#433438]">{invoice.fileName}</p><p className="mt-1 text-xs text-[#817578]">Disponibilizada em {formatDate(invoice.uploadedAt, true)}</p></div>
                      <div className="flex gap-2"><button type="button" onClick={() => void openDemoInvoicePdf(invoice)} className="rounded-xl border border-[#e6dbd6] px-4 py-2.5 text-xs font-semibold text-[#a3113a]">Abrir</button><a href={invoice.fileData} download={invoice.fileName} className="rounded-xl bg-[#a3113a] px-4 py-2.5 text-xs font-semibold text-white">Baixar PDF</a></div>
                    </div>
                  ))}
                </div>
              </article>
            )}

            {section === "termo" && (
              <article className="rounded-[28px] border border-[#eee5e0] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Documento do tratamento</p><h2 className="mt-2 text-2xl font-bold text-[#433438]">Termo de adesão — Imunoterapia Alérgeno Específica (IAE)</h2></div><span className="self-start rounded-full bg-[#edf8f3] px-3 py-1.5 text-xs font-semibold text-[#187157]">✓ Assinado</span></div>
                <div className="mt-5 rounded-2xl bg-[#edf8f3] p-4 text-sm text-[#187157]"><p className="font-semibold">Documento assinado por {portal.signedName}</p><p className="mt-2 text-xs">CPF {portal.signedCpf} · {formatDate(portal.signedAt, true)}</p></div>
                <div className="mt-6 space-y-5">{contractSections(patient, portal).map((item) => <section key={item.heading} className="rounded-2xl bg-[#fcfaf8] p-4"><h3 className="text-sm font-bold text-[#86203b]">{item.heading}</h3><p className="mt-2 whitespace-pre-line text-sm leading-7 text-[#65585c]">{item.text}</p></section>)}</div>
                <button type="button" onClick={downloadTerm} className="mt-6 w-full rounded-2xl bg-[#a3113a] px-4 py-3.5 text-sm font-semibold text-white sm:w-auto sm:px-6">Baixar termo em PDF</button>
              </article>
            )}
          </section>
        </div>
      </div>

      <a
        href={vaccineWhatsAppUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Falar com o setor de vacinas pelo WhatsApp"
        title="Falar com o setor de vacinas"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_rgba(37,211,102,0.38)] transition hover:scale-105 hover:bg-[#1fbd5a] lg:bottom-6 lg:right-6 lg:h-auto lg:w-auto lg:gap-2 lg:px-5 lg:py-3"
      >
        <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 fill-current">
          <path d="M16 3a12.7 12.7 0 0 0-11 19.1L3.3 28.5l6.5-1.7A12.7 12.7 0 1 0 16 3Zm0 23.2c-2 0-4-.6-5.7-1.6l-.4-.2-3.8 1 1-3.7-.3-.4A10.5 10.5 0 1 1 16 26.2Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.9-1-3.2-1.7-4.5-3.9-.3-.6.3-.6 1-1.8.1-.2.1-.4 0-.6l-1-2.4c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9s1.3 3.4 1.4 3.6c.2.2 2.5 3.8 6 5.3 2.2.9 3.1 1 4.2.8.7-.1 1.9-.8 2.2-1.5.3-.7.3-1.3.2-1.5-.2-.1-.4-.2-.7-.3Z" />
        </svg>
        <span className="hidden text-sm font-semibold lg:inline">Setor de vacinas</span>
      </a>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#eee5e0] bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(52,41,45,0.07)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg overflow-x-auto">{navigation.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`flex min-h-16 min-w-[68px] flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold ${section === item.id ? "text-[#a3113a]" : "text-[#8a7d80]"}`}><span className="text-lg leading-none">{item.icon}</span>{item.short}</button>)}</div>
      </nav>

      {pendingAssessmentBottle && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2c1b20]/55 p-3 sm:items-center sm:p-5">
          <section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[30px] bg-white p-6 shadow-2xl sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a3113a]">Autoavaliação · frasco {pendingAssessmentBottle.number}</p>
            <h2 className="mt-3 text-xl font-bold text-[#433438] sm:text-2xl">Avaliação dos sintomas durante este frasco</h2>
            <p className="mt-2 text-sm text-[#817578]">Sua resposta ajuda a equipe a acompanhar a sua evolução.</p>
            <AssessmentQuestion title="Com que frequência você apresenta sintomas de rinite alérgica durante a semana? *" options={symptomFrequencyOptions} value={assessmentSymptomFrequency} onChange={setAssessmentSymptomFrequency} />
            <AssessmentQuestion title="Quão severos são os sintomas de rinite alérgica? *" options={symptomSeverityOptions} value={assessmentSymptomSeverity} onChange={setAssessmentSymptomSeverity} />
            <AssessmentQuestion title="Quantas vezes por semana você usa medicamentos para controlar os sintomas? *" options={medicationFrequencyOptions} value={assessmentMedicationFrequency} onChange={setAssessmentMedicationFrequency} />
            <label className="mt-6 block text-sm font-semibold text-[#544449]">Gostaria de compartilhar sua experiência?<textarea value={assessmentNotes} onChange={(event) => setAssessmentNotes(event.target.value)} rows={3} placeholder="Escreva aqui, se quiser compartilhar algo com sua equipe." className="mt-2 w-full rounded-xl border border-[#e9dfda] px-3 py-3 text-sm font-normal outline-none focus:border-[#b91142]" /></label>
            <button type="button" onClick={saveAssessment} disabled={!assessmentSymptomFrequency || !assessmentSymptomSeverity || !assessmentMedicationFrequency} className="mt-5 w-full rounded-2xl bg-[#a3113a] px-4 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">Enviar avaliação para a equipe</button>
          </section>
        </div>
      )}
    </main>
  );
}
