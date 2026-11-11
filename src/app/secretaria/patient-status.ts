import type { DemoPatientRecord } from "../medico/patient-store";

export type SecretaryPatientStatus = NonNullable<DemoPatientRecord["status"]>;

export const secretaryDashboardStatusOptions: Array<[SecretaryPatientStatus, string]> = [
  ["com-pedido", "Com pedido"],
  ["em-conversa", "Em conversa"],
  ["ativo", "Ativos"],
  ["bacteriana", "Bacteriana"],
  ["perdido", "Tratamento não contratado"],
  ["desistente", "Desistentes"],
  ["em-alta", "Pacientes com alta"],
  ["concluido", "Concluídos"],
];

export const secretaryPatientStatusLabels: Record<SecretaryPatientStatus, string> = {
  "com-pedido": "Paciente com pedido",
  "em-conversa": "Paciente em conversa",
  ativo: "Paciente ativo",
  bacteriana: "Paciente bacteriana",
  "tentar-novamente": "Tentar novamente",
  perdido: "Tratamento não contratado",
  "em-alta": "Pacientes com alta",
  concluido: "Paciente concluído",
  desistente: "Paciente desistente",
  laudo: "Laudo",
};

export function isBirthdayToday(date: string, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (!match) return false;
  return Number(match[2]) === today.getMonth() + 1 && Number(match[3]) === today.getDate();
}
