import type {
  DemoPatientRecord,
  DemoStockItem,
} from "../medico/patient-store";
import type { PatientPortalState } from "./patient-portal-store";

export type BottleHistoryEntry = {
  number: number;
  receivedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  status: "recebido" | "em-uso" | "finalizado";
};

export function buildBottleHistory(
  patient: DemoPatientRecord,
  portal: PatientPortalState,
  stock: DemoStockItem[],
): BottleHistoryEntry[] {
  const total = Math.max(patient.bottlesReceived ?? 0, portal.bottles.length);
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

    return {
      number,
      receivedAt: bottle?.receivedAt ?? receiptDates[index],
      startedAt: bottle?.startedAt,
      finishedAt: bottle?.finishedAt,
      status: bottle?.status ?? "recebido",
    };
  });
}
