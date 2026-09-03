export type AdminTreatmentMethod = {
  id: string;
  name: string;
  category: "Método" | "Recorrente" | "Plano de 6 meses" | "Por frasco";
  value: number;
  cashValue?: number;
  paymentMethod: string;
  maxInstallments: number;
  billingPeriodMonths: number;
  discountType: "percentual" | "valor";
  discountValue: number;
  active: boolean;
  version: number;
  updatedAt: string;
};

export type AdminFixedCost = {
  id: string;
  description: string;
  category: string;
  amount: number;
  updatedAt: string;
  active: boolean;
};

export type AdminDoctor = {
  id: string;
  name: string;
  crm?: string;
  commissionRate: number;
  commissionPerBottle?: number;
  active: boolean;
  updatedAt: string;
};

export type AdminSaleSnapshot = {
  id: string;
  patientId: string;
  patientName: string;
  patientCpf: string;
  doctor: string;
  treatment: string;
  contractedAt: string;
  methodId: string;
  methodName: string;
  methodVersion: number;
  listValue: number;
  discountAmount: number;
  contractedValue: number;
  condition: "À vista" | "Parcelado";
  installments: number;
  paymentMethod: string;
  firstPaymentDueAt?: string;
  commissionRateSnapshot: number;
  bottleCount?: number;
  commissionPerBottleSnapshot?: number;
  status: "ativa" | "concluida" | "cancelada";
};

export type AdminCommissionRecord = {
  id: string;
  installmentId: string;
  saleId: string;
  patientId: string;
  patientName: string;
  doctor: string;
  paymentId?: string;
  receivedAt: string;
  accountingAt: string;
  receivedValue: number;
  commissionRate: number;
  bottleCount?: number;
  commissionPerBottle?: number;
  commissionValue: number;
  paidAt: string;
};

export type AdminAuditEntry = {
  id: string;
  entity: "método" | "custo" | "médico" | "venda" | "comissão";
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
  createdBy: string;
};

export const COMMISSION_PER_BOTTLE = 68;

export function treatmentMethodTotal(methodRecord: AdminTreatmentMethod) {
  return methodRecord.category === "Recorrente"
    ? methodRecord.value * methodRecord.billingPeriodMonths
    : methodRecord.value;
}
