import type { DemoPatientRecord } from "../medico/patient-store";
import type { PatientBottle } from "./patient-portal-store";

export type PatientNotification = {
  id: string;
  icon: string;
  title: string;
  text: string;
};

type Season = "outono" | "inverno" | "primavera" | "verao";

const seasonMessages: Record<Season, Omit<PatientNotification, "id">> = {
  outono: {
    icon: "🍂",
    title: "Chegou o outono!",
    text: `Nessa época, algumas pessoas podem perceber aumento de sintomas como nariz entupido, espirros, coriza, coceira no nariz e garganta irritada, principalmente com as mudanças de temperatura e o tempo mais seco.

Durante o tratamento, alguns cuidados podem ajudar a controlar esses desconfortos:
💧 Mantenha uma boa hidratação
🧹 Evite acúmulo de poeira e ácaros em casa
🌬️ Ventile os ambientes sempre que possível
🛏️ Mantenha roupas de cama sempre limpas e secas

Continue seguindo as orientações do seu médico e, caso perceba alguma mudança nos sintomas ou precise de orientação com o tratamento, pode falar com a gente. 😊`,
  },
  inverno: {
    icon: "❄️",
    title: "O inverno chegou!",
    text: `Com o frio e o ar mais seco, é comum algumas pessoas apresentarem mais congestão nasal, espirros, coriza, tosse, irritação na garganta e sensação de nariz ressecado.

Para ajudar a amenizar os sintomas durante o tratamento:
💧 Beba bastante água
🏠 Evite ambientes muito fechados e sem ventilação
🧹 Redobre os cuidados com poeira, mofo e ácaros
🚿 Banhos muito quentes podem ressecar ainda mais as vias respiratórias

Mantenha seu tratamento conforme a orientação médica e, caso esteja sentindo mais sintomas ou tenha alguma dúvida, estamos à disposição para ajudar. 😊`,
  },
  primavera: {
    icon: "🌸",
    title: "A primavera chegou!",
    text: `A presença de pólen no ar pode aumentar os sintomas de algumas alergias, como espirros frequentes, coriza, coceira no nariz e nos olhos e congestão nasal.

Alguns cuidados podem ajudar nessa época:
🪟 Evite deixar as janelas abertas por longos períodos em dias com muito vento
😎 Ao sair, óculos podem ajudar a reduzir o contato do pólen com os olhos
🚿 Ao chegar em casa, lave o rosto e, se possível, tome banho
🧹 Mantenha os ambientes limpos, evitando acúmulo de poeira

Continue seu tratamento direitinho e observe como seu organismo reage nessa época do ano. Se precisar de qualquer orientação, pode chamar a gente! 😊`,
  },
  verao: {
    icon: "☀️",
    title: "Chegou o verão!",
    text: `No calor, mudanças de temperatura, ar-condicionado, umidade e exposição à poeira ou mofo podem contribuir para sintomas como nariz entupido, coriza, espirros, coceira e irritação das vias respiratórias.

Para cuidar da sua respiração durante o tratamento:
💧 Mantenha-se bem hidratado
❄️ Evite mudanças muito bruscas de temperatura
🧹 Cuide da limpeza e manutenção do ar-condicionado
🏠 Fique atento a sinais de mofo em ambientes úmidos

O tratamento funciona melhor com regularidade e acompanhamento. Se notar alguma mudança nos sintomas ou precisar de ajuda, fale com a nossa equipe. Estamos à disposição! 😊`,
  },
};

function localDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function differenceInDays(later: Date, earlier: Date) {
  return Math.floor((localDay(later).getTime() - localDay(earlier).getTime()) / 86_400_000);
}

function seasonAt(date: Date): { season: Season; cycleYear: number } {
  const year = date.getFullYear();
  const monthDay = (date.getMonth() + 1) * 100 + date.getDate();

  if (monthDay >= 1221 || monthDay < 320) {
    return { season: "verao", cycleYear: monthDay < 320 ? year - 1 : year };
  }
  if (monthDay < 621) return { season: "outono", cycleYear: year };
  if (monthDay < 922) return { season: "inverno", cycleYear: year };
  return { season: "primavera", cycleYear: year };
}

function birthdayNotification(patient: DemoPatientRecord, today: Date): PatientNotification | undefined {
  const birthDate = parseLocalDate(patient.birthDate);
  if (birthDate.getMonth() !== today.getMonth() || birthDate.getDate() !== today.getDate()) return undefined;

  const firstName = patient.name.trim().split(/\s+/)[0] || patient.name;
  return {
    id: `birthday-${patient.id}-${today.getFullYear()}`,
    icon: "🎉",
    title: `Feliz aniversário, ${firstName}! 🎂`,
    text: `Hoje é dia de celebrar mais um ano da sua vida e desejar que esse novo ciclo seja repleto de saúde, boas experiências, conquistas e muitos momentos especiais! ✨

Que o próximo ano venha com novos motivos para sorrir, novos sonhos e muitas coisas boas para comemorar. 😊

É uma alegria poder acompanhar você e fazer parte, de alguma forma, da sua jornada de cuidados com a saúde.

🎈 Feliz aniversário e um excelente novo ciclo!

Com carinho,
Equipe Centro de Rinite e Alergia`,
  };
}

function consultationNotification(patient: DemoPatientRecord, today: Date): PatientNotification | undefined {
  if (!patient.startDate) return undefined;
  const elapsedDays = differenceInDays(today, parseLocalDate(patient.startDate));
  if (elapsedDays < 75) return undefined;

  const completedCycles = Math.floor(elapsedDays / 90);
  const daysInCycle = elapsedDays % 90;
  const dueCycle = daysInCycle >= 75 ? completedCycles + 1 : completedCycles;
  const insideReminderWindow = daysInCycle >= 75 || (completedCycles > 0 && daysInCycle <= 14);
  if (!insideReminderWindow) return undefined;

  const firstName = patient.name.trim().split(/\s+/)[0] || patient.name;
  return {
    id: `consultation-${patient.id}-${dueCycle}`,
    icon: "🩺",
    title: "Lembrete de acompanhamento médico",
    text: `Olá, ${firstName}! 💙

Passando para lembrar que está chegando o momento de agendar sua próxima consulta com seu médico. 🩺✨

O acompanhamento é importante para avaliarmos sua evolução, acompanhar os sintomas e, se necessário, ajustar o seu tratamento. 🌿

📅 Não deixe para a última hora! Entre em contato conosco para verificarmos os horários disponíveis e agendarmos sua consulta.

Será um prazer continuar acompanhando você! 💙`,
  };
}

function halfwayBottleNotification(patient: DemoPatientRecord, bottle: PatientBottle | undefined, today: Date): PatientNotification | undefined {
  if (!bottle || differenceInDays(today, parseLocalDate(bottle.startedAt)) < 14) return undefined;

  const firstName = patient.name.trim().split(/\s+/)[0] || patient.name;
  return {
    id: `half-bottle-${bottle.id}`,
    icon: "🔔",
    title: "Lembrete do seu tratamento",
    text: `Olá, ${firstName}! 🌿

Identificamos que você está se aproximando da metade do seu frasco. 💧

✨ Para manter seu tratamento sem interrupções, já é hora de solicitar o pedido do próximo frasco.

📲 Entre em contato com nossa equipe para realizar seu pedido.`,
  };
}

export function buildAutomaticPatientNotifications(
  patient: DemoPatientRecord,
  currentBottle?: PatientBottle,
  today = new Date(),
): PatientNotification[] {
  const birthday = birthdayNotification(patient, today);
  const consultation = consultationNotification(patient, today);
  const halfwayBottle = halfwayBottleNotification(patient, currentBottle, today);
  const { season, cycleYear } = seasonAt(today);
  const seasonal = { id: `season-${season}-${cycleYear}`, ...seasonMessages[season] };

  return [birthday, consultation, halfwayBottle, seasonal].filter(
    (notification): notification is PatientNotification => Boolean(notification),
  );
}
