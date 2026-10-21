import type {
  BottleVolumeMl,
  DemoPatientRecord,
  DemoPrescription,
  DemoStockItem,
  PrescriptionFormula,
} from "../medico/patient-store";
import type { PatientPortalState } from "./patient-portal-store";

export type BottleHistoryEntry = {
  number: number;
  prescriptionId?: string;
  treatment?: string;
  phase?: string;
  bottleVolumeMl?: BottleVolumeMl;
  formulas?: PrescriptionFormula[];
  receivedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  status: "recebido" | "em-uso" | "finalizado";
};

export function buildBottleHistory(
  patient: DemoPatientRecord,
  portal: PatientPortalState,
  stock: DemoStockItem[],
  prescriptions: DemoPrescription[] = [],
): BottleHistoryEntry[] {
  const deletedBottleNumbers = new Set(portal.deletedBottleNumbers ?? []);
  const highestBottleNumber = Math.max(0, ...portal.bottles.map((item) => item.number), ...deletedBottleNumbers);
  const total = Math.max(patient.bottlesReceived ?? 0, portal.bottles.length, highestBottleNumber);
  const deliveredDates = stock
    .filter(
      (item) =>
        item.patientId === patient.id &&
        item.status === "entregue" &&
        Boolean(item.deliveredAt),
    )
    .sort(
      (first, second) =>
        new Date(first.deliveredAt ?? 0).getTime() -
        new Date(second.deliveredAt ?? 0).getTime(),
    )
    .flatMap((item) =>
      Array.from({ length: Math.max(0, item.bottles) }, () => item.deliveredAt),
    )
    .slice(-total);

  const receiptDates: Array<string | undefined> = Array.from(
    { length: total },
    () => undefined,
  );
  const prescriptionsById = new Map(prescriptions.map((item) => [item.id, item]));
  const deliveryOffset = Math.max(0, total - deliveredDates.length);
  deliveredDates.forEach((date, index) => {
    receiptDates[deliveryOffset + index] = date;
  });

  if (
    total > 0 &&
    !receiptDates.some(Boolean) &&
    patient.lastReceivedDate
  ) {
    receiptDates[total - 1] = patient.lastReceivedDate;
  }

  return Array.from({ length: total }, (_, index) => {
    const number = index + 1;
    const bottle = portal.bottles.find((item) => item.number === number);
    const adjustment = portal.bottleHistoryAdjustments?.[number];
    const stockItem = stock.find((item) => item.patientId === patient.id && item.bottleNumber === number);
    const prescription = bottle?.prescriptionId
      ? prescriptionsById.get(bottle.prescriptionId)
      : undefined;

    return {
      number,
      prescriptionId: bottle?.prescriptionId,
      treatment: bottle?.treatment ?? prescription?.treatment ?? stockItem?.treatment,
      phase: adjustment?.phase ?? stockItem?.phase ?? prescription?.phase,
      bottleVolumeMl: (adjustment?.bottleVolumeMl as BottleVolumeMl | undefined) ?? stockItem?.bottleVolumeMl ?? prescription?.bottleVolumeMl,
      formulas: adjustment?.formulas ?? stockItem?.formulas ?? prescription?.formulas,
      receivedAt: adjustment?.receivedAt ?? bottle?.receivedAt ?? receiptDates[index],
      startedAt: adjustment?.startedAt ?? bottle?.startedAt,
      finishedAt: adjustment?.finishedAt ?? bottle?.finishedAt,
      status: adjustment?.status ?? bottle?.status ?? "recebido",
    };
  }).filter((item) => !deletedBottleNumbers.has(item.number));
}
