import type { DemoBatch, DemoPatientRecord, DemoStockItem } from "../medico/patient-store";

export type BottleBillingState = {
  contractedBottles: number;
  additionalPaidBottles: number;
  coveredBottles: number;
  committedBottles: number;
  deliveredBottles: number;
  pendingBottles: number;
};

function indicationKey(treatment: string) {
  return /bacteriana|imunobacteriana/i.test(treatment) ? "bacteriana" : "rinite";
}

function stockBatchItemKey(item: Pick<DemoStockItem, "batchId" | "patientId" | "prescriptionId">) {
  return `${item.batchId}:${item.patientId}:${item.prescriptionId}`;
}

function batchItemKey(batchId: string, item: Pick<DemoBatch["items"][number], "patientId" | "prescriptionId">) {
  return `${batchId}:${item.patientId}:${item.prescriptionId}`;
}

function positiveInteger(value?: number) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value ?? 0 : 0;
}

export function getBottleBillingState(
  patient: Pick<DemoPatientRecord, "id" | "treatmentPayments" | "payments">,
  treatment: string,
  stockItems: DemoStockItem[],
  batches: DemoBatch[],
): BottleBillingState {
  const track = indicationKey(treatment);
  const treatmentName = track === "bacteriana" ? "Imunobacteriana" : "Rinite";
  const contractedBottles = positiveInteger(
    patient.treatmentPayments?.find((payment) => payment.treatment === treatmentName)?.bottlesIncluded,
  );
  const additionalPaymentBottles = (patient.payments ?? []).reduce((total, payment) => {
    if (payment.treatment !== treatmentName) return total;
    return total + positiveInteger(payment.additionalBottles);
  }, 0);

  const patientStock = stockItems.filter((item) => item.patientId === patient.id && indicationKey(item.treatment) === track);
  const stockKeys = new Set(patientStock.map(stockBatchItemKey));
  const stockAdditionalByKey = new Map<string, number>();
  for (const item of patientStock) {
    if (!item.batchId || !item.prescriptionId || !positiveInteger(item.additionalPaidBottles)) continue;
    if (!item.paymentConfirmedAt && !item.asaasConfirmedAt) continue;
    const key = stockBatchItemKey(item);
    stockAdditionalByKey.set(key, Math.max(stockAdditionalByKey.get(key) ?? 0, positiveInteger(item.additionalPaidBottles)));
  }

  let pendingBatchBottles = 0;
  let legacyBatchAdditionalBottles = 0;
  for (const batch of batches) {
    for (const item of batch.items) {
      if (item.patientId !== patient.id || indicationKey(item.treatment) !== track) continue;
      const key = batchItemKey(batch.id, item);
      if (!stockKeys.has(key)) pendingBatchBottles += Math.max(0, Math.trunc(item.bottles));

      const paidExtra = positiveInteger(item.additionalPaidBottles);
      if (!paidExtra || (!item.paymentConfirmedAt && !item.asaasConfirmedAt)) continue;
      if (!stockAdditionalByKey.has(key)) legacyBatchAdditionalBottles += paidExtra;
    }
  }

  const stockBottles = patientStock.reduce((total, item) => total + Math.max(0, Math.trunc(item.bottles)), 0);
  const deliveredBottles = patientStock.reduce((total, item) => {
    const manuallyEntered = item.batchCode === "ADICIONADO MANUALMENTE";
    return total + (manuallyEntered || item.status === "entregue" ? Math.max(0, Math.trunc(item.bottles)) : 0);
  }, 0);
  const stockAdditionalBottles = Array.from(stockAdditionalByKey.values()).reduce((total, value) => total + value, 0);
  const additionalPaidBottles = additionalPaymentBottles + stockAdditionalBottles + legacyBatchAdditionalBottles;
  const committedBottles = stockBottles + pendingBatchBottles;
  const coveredBottles = contractedBottles + additionalPaidBottles;

  return {
    contractedBottles,
    additionalPaidBottles,
    coveredBottles,
    committedBottles,
    deliveredBottles,
    pendingBottles: Math.max(0, committedBottles - deliveredBottles),
  };
}

export function bottlesBeyondCoverage(state: BottleBillingState, additionalBottles: number) {
  const before = Math.max(0, state.committedBottles - state.coveredBottles);
  const after = Math.max(0, state.committedBottles + Math.max(0, Math.trunc(additionalBottles)) - state.coveredBottles);
  return after - before;
}
