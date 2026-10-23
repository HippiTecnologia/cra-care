import type { DemoBatch, DemoPrescription, DemoStockItem } from "../medico/patient-store";
import type { BottleHistoryEntry } from "../paciente/bottle-history";

type PatientReminderIdentity = {
  status?: string;
  treatment?: string;
  lastReceivedDate?: string;
};

const terminalPatientStatuses = new Set(["perdido", "em-alta", "concluido", "desistente"]);

export function isEligibleForNextOrderReminder(status?: string) {
  return status === "ativo" || status === "bacteriana";
}

export function nextOrderIntervalDays(treatment: string | undefined, volumeMl?: number) {
  if (/bacteriana|imunobacteriana/i.test(treatment ?? "")) return 60;
  return volumeMl === 8 ? 30 : 60;
}

function trackForTreatment(treatment?: string) {
  if (!treatment?.trim()) return "rinite";
  return /bacteriana|imunobacteriana/i.test(treatment) ? "imunobacteriana" : "rinite";
}

function parseLocalDate(value?: string) {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  const parsed = new Date(`${datePart}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Uses each treatment's newest bottle. The timer starts at receipt, not at the
 * first use recorded in the portal. A finished newest bottle is due immediately.
 */
export type NextOrderReminder = {
  treatment: "rinite" | "imunobacteriana";
  date: Date;
};

export function getNextOrderReminders(
  patient: PatientReminderIdentity,
  bottles: BottleHistoryEntry[],
  prescriptions: DemoPrescription[],
  now = new Date(),
) {
  if (!isEligibleForNextOrderReminder(patient.status) || terminalPatientStatuses.has(patient.status ?? "")) return [] as NextOrderReminder[];

  const prescriptionsById = new Map(prescriptions.map((item) => [item.id, item]));
  const bottlesByTrack = new Map<string, BottleHistoryEntry[]>();

  for (const bottle of bottles) {
    const inferredTreatment = bottle.treatment
      ?? (bottle.prescriptionId ? prescriptionsById.get(bottle.prescriptionId)?.treatment : undefined)
      ?? patient.treatment;
    const track = trackForTreatment(inferredTreatment);
    bottlesByTrack.set(track, [...(bottlesByTrack.get(track) ?? []), bottle]);
  }

  if (!bottlesByTrack.size && patient.lastReceivedDate) {
    const inferredTreatment = patient.treatment ?? prescriptions.at(-1)?.treatment;
    const latestPrescription = prescriptions
      .filter((item) => trackForTreatment(item.treatment) === trackForTreatment(inferredTreatment))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0];
    bottlesByTrack.set(trackForTreatment(inferredTreatment), [{
      number: 0,
      treatment: inferredTreatment,
      bottleVolumeMl: latestPrescription?.bottleVolumeMl,
      receivedAt: patient.lastReceivedDate,
      status: "recebido",
    }]);
  }

  const reminders: NextOrderReminder[] = [];
  for (const [track, trackBottles] of bottlesByTrack) {
    const latestBottle = trackBottles.slice().sort((first, second) => second.number - first.number)[0];
    if (!latestBottle) continue;
    if (latestBottle.status === "finalizado") {
      reminders.push({ treatment: track as NextOrderReminder["treatment"], date: parseLocalDate(latestBottle.finishedAt) ?? now });
      continue;
    }
    const receivedAt = parseLocalDate(latestBottle.receivedAt)
      ?? parseLocalDate(latestBottle.startedAt);
    if (!receivedAt) continue;
    reminders.push({
      treatment: track as NextOrderReminder["treatment"],
      date: addDays(receivedAt, nextOrderIntervalDays(latestBottle.treatment, latestBottle.bottleVolumeMl)),
    });
  }

  return reminders;
}

export function getNextOrderDate(reminders: NextOrderReminder[]) {
  return reminders.length
    ? new Date(Math.min(...reminders.map((reminder) => reminder.date.getTime())))
    : null;
}

export function hasNextOrderDue(date: Date | null, now = new Date()) {
  if (!date) return false;
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return dueDay <= currentDay;
}

export function hasNextOrderInProgress(
  patientId: string,
  treatment: NextOrderReminder["treatment"],
  stock: DemoStockItem[],
  batches: DemoBatch[],
) {
  const matchesTreatment = (value: string) => /bacteriana|imunobacteriana/i.test(value) === (treatment === "imunobacteriana");
  return stock.some((item) => item.patientId === patientId && item.status !== "entregue" && matchesTreatment(item.treatment))
    || batches.some((batch) => batch.status !== "conferido" && batch.items.some((item) =>
      item.patientId === patientId && matchesTreatment(item.treatment),
    ));
}
