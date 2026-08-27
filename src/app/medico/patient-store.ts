export type DemoPatientRecord = {
  id: string;
  name: string;
  cpf: string;
  birthDate: string;
  doctor: string;
  createdAt: string;
  registrationStatus: "pending-secretary" | "completed";
  phone?: string;
  email?: string;
  address?: string;
  zipCode?: string;
  street?: string;
  addressNumber?: string;
  addressComplement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  deliveryNotes?: string;
  billingName?: string;
  billingCpf?: string;
  treatment?: string;
  startDate?: string;
  totalMonths?: number;
  lastReceivedDate?: string;
  bottlesReceived?: number;
  drops?: number;
  phase?: string;
  delivery?: "Motoboy" | "Retirada" | "Sedex" | "Aéreo";
  status?:
    | "com-pedido"
    | "em-conversa"
    | "ativo"
    | "bacteriana"
    | "tentar-novamente"
    | "perdido"
    | "concluido"
    | "desistente";
  acquisitionMethod?: string;
  agreedCondition?: "À vista" | "Parcelado";
  methodSnapshotId?: string;
  methodSnapshotVersion?: number;
  discountAmount?: number;
  paymentMethod?: string;
  paymentInstallments?: number;
  contractValue?: number;
  paymentDueDate?: string;
  paymentStatus?: "A definir" | "Pendente" | "Em dia" | "Vencido" | "Cancelado";
  asaasReference?: string;
  financialNotes?: string;
  payments?: PatientPaymentRecord[];
  notes?: string;
  abandonmentReason?: string;
};

export type PatientPaymentRecord = {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  installments?: number;
  installmentNumber?: number;
  dueAt?: string;
  asaasReference?: string;
  notes?: string;
};

export type DemoInvoice = {
  id: string;
  patientId: string;
  patientName: string;
  patientCpf: string;
  fileName: string;
  fileData: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
};

export type PrescriptionFormula = {
  id: string;
  name: string;
  percentage: number;
};

export type DemoPrescription = {
  id: string;
  patientId: string;
  doctor: string;
  doctorCrm: string;
  createdAt: string;
  treatment: string;
  phase: string;
  bottles: number;
  drops: number;
  frequency: string;
  posology: string;
  formulas: PrescriptionFormula[];
  notes: string;
  signatureStatus: "pending" | "signed";
};

export type DemoBatchStatus =
  | "rascunho"
  | "enviado"
  | "em-producao"
  | "pronto"
  | "conferido";

export type DemoBatchItem = {
  prescriptionId: string;
  orderType?: "pedido-paciente" | "pronta-entrega";
  patientId: string;
  patientName: string;
  patientCpf: string;
  doctor: string;
  treatment: string;
  phase: string;
  bottles: number;
  formulas: PrescriptionFormula[];
  acquisitionMethod?: DemoPatientRecord["acquisitionMethod"];
  paymentMethod?: DemoPatientRecord["paymentMethod"];
  billingBottleNumber?: number;
  paymentRequired?: boolean;
  paymentConfirmedAt?: string;
  asaasConfirmedAt?: string;
  preparedBy?: string;
  doctorCrm?: string;
  prescriptionStatus?: "aguardando-aprovacao" | "aprovada";
};

export type DemoBatch = {
  id: string;
  code: string;
  name?: string;
  createdAt: string;
  sentAt?: string;
  productionStartedAt?: string;
  productionFinishedAt?: string;
  productionResponsible?: string;
  productionNotes?: string;
  preparedPrescriptionIds?: string[];
  checkedPrescriptionIds?: string[];
  checkedAt?: string;
  checkedBy?: string;
  conferenceNotes?: string;
  orderType?: "pedido-paciente" | "pronta-entrega";
  status: DemoBatchStatus;
  laboratory: string;
  notes: string;
  items: DemoBatchItem[];
};

export type DemoStockStatus = "disponivel" | "reservado" | "entregue";

export type DemoStockItem = {
  id: string;
  batchId: string;
  batchCode: string;
  prescriptionId: string;
  origin?: "pedido-paciente" | "pronta-entrega";
  patientId: string;
  patientName: string;
  patientCpf: string;
  patientPhone?: string;
  doctor: string;
  treatment: string;
  phase: string;
  bottles: number;
  formulas: PrescriptionFormula[];
  delivery?: DemoPatientRecord["delivery"];
  laboratory: string;
  receivedAt: string;
  checkedBy: string;
  status: DemoStockStatus;
  reservedAt?: string;
  deliveredAt?: string;
  assignedAt?: string;
  paymentConfirmedAt?: string;
  asaasConfirmedAt?: string;
};

export type PatientBillingRequirement = {
  acquisitionMethod: NonNullable<DemoPatientRecord["acquisitionMethod"]>;
  paymentMethod: NonNullable<DemoPatientRecord["paymentMethod"]>;
  nextBottleNumber: number;
  paymentRequired: boolean;
  asaasRequired: boolean;
  explanation: string;
};

export const demoDoctor = {
  name: "Dr. Flavio Mizoguchi",
  crm: "24603",
  specialty: "Otorrinolaringologia",
};

export const treatmentPhases = [
  "FASE 1:10 - 500 UBE",
  "FASE 1:10.000 - 1 UBE",
  "FASE 1:100 - 100 UBE",
  "FASE 1:1000 - 10 UBE",
  "FASE 1:4 - 1250 UBE",
];

export const availableFormulas = [
  "D. pteronyssinus",
  "D. farinae",
  "Blomia tropicalis",
  "Gramíneas",
  "Pólens de gramíneas",
  "Epitélio de gato",
  "Epitélio de cão",
  "Mix de gramíneas",
  "Lolium perene",
  "Lolium multiflorum",
  "Poa pratensis",
  "Paspalum",
];

export const demoMedicalPatients: DemoPatientRecord[] = [
  {
    id: "001",
    name: "Maria Fernanda Lima",
    cpf: "123.456.789-00",
    birthDate: "1994-04-19",
    doctor: demoDoctor.name,
    createdAt: "2025-02-10T12:00:00",
    registrationStatus: "completed",
    phone: "(41) 99999-1001",
    email: "maria.fernanda@exemplo.com",
    zipCode: "80240-140",
    street: "Rua Goiás",
    addressNumber: "60",
    addressComplement: "Apto. 12",
    neighborhood: "Água Verde",
    city: "Curitiba",
    state: "PR",
    deliveryNotes: "Entregar em horário comercial. Confirmar pelo WhatsApp antes da saída.",
    treatment: "Imunoterapia para rinite",
    startDate: "2025-02-10",
    totalMonths: 36,
    lastReceivedDate: "2026-07-18",
    bottlesReceived: 8,
    drops: 6,
    phase: "FASE 1:10 - 500 UBE",
    delivery: "Motoboy",
    status: "com-pedido",
    acquisitionMethod: "Por frasco",
    paymentMethod: "Asaas",
  },
  {
    id: "003",
    name: "Ana Clara Ribeiro",
    cpf: "345.678.901-22",
    birthDate: "1998-04-21",
    doctor: demoDoctor.name,
    createdAt: "2025-05-03T12:00:00",
    registrationStatus: "completed",
    phone: "(41) 99999-1003",
    email: "ana.ribeiro@exemplo.com",
    zipCode: "80010-000",
    street: "Rua XV de Novembro",
    addressNumber: "850",
    addressComplement: "Casa 2",
    neighborhood: "Centro",
    city: "Curitiba",
    state: "PR",
    deliveryNotes: "Recepção autorizada a receber.",
    treatment: "Imunoterapia para rinite",
    startDate: "2025-05-03",
    totalMonths: 36,
    lastReceivedDate: "2026-07-25",
    bottlesReceived: 6,
    drops: 6,
    phase: "FASE 1:1000 - 10 UBE",
    delivery: "Sedex",
    status: "ativo",
    acquisitionMethod: "Tratamento de 6 meses",
    paymentMethod: "A definir",
  },
  {
    id: "005",
    name: "Juliana Carvalho",
    cpf: "567.890.123-44",
    birthDate: "1991-12-09",
    doctor: demoDoctor.name,
    createdAt: "2025-10-07T12:00:00",
    registrationStatus: "completed",
    phone: "(41) 99999-1005",
    email: "juliana.carvalho@exemplo.com",
    zipCode: "83005-420",
    street: "Rua Joinville",
    addressNumber: "325",
    neighborhood: "São Pedro",
    city: "São José dos Pinhais",
    state: "PR",
    deliveryNotes: "Ligar ao chegar.",
    treatment: "Imunobacteriana",
    startDate: "2025-10-07",
    totalMonths: 60,
    lastReceivedDate: "2026-07-12",
    bottlesReceived: 3,
    drops: 6,
    phase: "FASE 1:4 - 1250 UBE",
    delivery: "Motoboy",
    status: "tentar-novamente",
    acquisitionMethod: "Tratamento de 6 meses",
    paymentMethod: "Asaas",
  },
];

const initialPrescriptions: DemoPrescription[] = [
  {
    id: "rx-demo-001",
    patientId: "001",
    doctor: demoDoctor.name,
    doctorCrm: demoDoctor.crm,
    createdAt: "2026-07-20T14:30:00",
    treatment: "Imunoterapia para rinite",
    phase: "FASE 1:10 - 500 UBE",
    bottles: 1,
    drops: 6,
    frequency: "3 vezes por semana",
    posology: "Aplicar 6 gotas, 3 vezes por semana.",
    formulas: [
      { id: "formula-demo-001", name: "D. pteronyssinus", percentage: 60 },
      { id: "formula-demo-002", name: "D. farinae", percentage: 40 },
    ],
    notes: "Manter acompanhamento conforme orientação médica.",
    signatureStatus: "pending",
  },
  {
    id: "rx-demo-003",
    patientId: "003",
    doctor: demoDoctor.name,
    doctorCrm: demoDoctor.crm,
    createdAt: "2026-07-25T10:00:00",
    treatment: "Imunoterapia para rinite",
    phase: "FASE 1:1000 - 10 UBE",
    bottles: 1,
    drops: 6,
    frequency: "3 vezes por semana",
    posology: "Aplicar 6 gotas, 3 vezes por semana.",
    formulas: [{ id: "formula-demo-003", name: "Blomia tropicalis", percentage: 100 }],
    notes: "",
    signatureStatus: "pending",
  },
];

const STORAGE_KEY = "cra-care-demo-patients";
const PRESCRIPTIONS_KEY = "cra-care-demo-prescriptions";
const BATCHES_KEY = "cra-care-demo-batches";
const STOCK_KEY = "cra-care-demo-stock";
const INVOICES_KEY = "cra-care-demo-invoices";
const UPDATE_EVENT = "cra-care-demo-patients-updated";

export function readDemoPatients(): DemoPatientRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);

    return stored ? (JSON.parse(stored) as DemoPatientRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveDemoPatient(patient: DemoPatientRecord) {
  const current = readDemoPatients();
  const existingIndex = current.findIndex((item) => item.id === patient.id);

  if (existingIndex >= 0) {
    current[existingIndex] = patient;
  } else {
    current.unshift(patient);
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  window.dispatchEvent(new Event(UPDATE_EVENT));

  return current;
}

export function readDemoInvoices(patientId?: string): DemoInvoice[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.sessionStorage.getItem(INVOICES_KEY);
    const invoices = stored ? (JSON.parse(stored) as DemoInvoice[]) : [];

    return invoices
      .filter((invoice) => !patientId || invoice.patientId === patientId)
      .sort((first, second) => new Date(second.uploadedAt).getTime() - new Date(first.uploadedAt).getTime());
  } catch {
    return [];
  }
}

export function saveDemoInvoice(invoice: DemoInvoice) {
  const current = readDemoInvoices();
  window.sessionStorage.setItem(INVOICES_KEY, JSON.stringify([invoice, ...current]));
  window.dispatchEvent(new Event(UPDATE_EVENT));
  return readDemoInvoices();
}

export function removeDemoInvoice(invoiceId: string) {
  const current = readDemoInvoices().filter((invoice) => invoice.id !== invoiceId);
  window.sessionStorage.setItem(INVOICES_KEY, JSON.stringify(current));
  window.dispatchEvent(new Event(UPDATE_EVENT));
  return current;
}

export function openDemoInvoicePdf(invoice: DemoInvoice) {
  if (typeof window === "undefined") return false;

  try {
    const encoded = invoice.fileData.split(",")[1];
    if (!encoded) return false;

    const binary = window.atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const viewer = window.open(url, "_blank");
    if (!viewer) {
      URL.revokeObjectURL(url);
      return false;
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return true;
  } catch {
    return false;
  }
}

export function findDemoPatient(id: string) {
  return (
    readDemoPatients().find((patient) => patient.id === id) ??
    demoMedicalPatients.find((patient) => patient.id === id)
  );
}

export function readDemoPrescriptions(patientId?: string): DemoPrescription[] {
  let saved: DemoPrescription[] = [];

  if (typeof window !== "undefined") {
    try {
      const stored = window.sessionStorage.getItem(PRESCRIPTIONS_KEY);
      saved = stored ? (JSON.parse(stored) as DemoPrescription[]) : [];
    } catch {
      saved = [];
    }
  }

  return [...saved, ...initialPrescriptions]
    .filter((prescription) => !patientId || prescription.patientId === patientId)
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
}

export function saveDemoPrescription(prescription: DemoPrescription) {
  const saved = readDemoPrescriptions().filter(
    (item) => !initialPrescriptions.some((initial) => initial.id === item.id),
  );

  window.sessionStorage.setItem(
    PRESCRIPTIONS_KEY,
    JSON.stringify([prescription, ...saved]),
  );

  window.dispatchEvent(new Event(UPDATE_EVENT));

  return readDemoPrescriptions(prescription.patientId);
}

export function readDemoBatches(): DemoBatch[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.sessionStorage.getItem(BATCHES_KEY);
    const batches = stored ? (JSON.parse(stored) as DemoBatch[]) : [];

    return batches.sort(
      (first, second) =>
        new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
  } catch {
    return [];
  }
}

export function saveDemoBatch(batch: DemoBatch) {
  const current = readDemoBatches();
  const existingIndex = current.findIndex((item) => item.id === batch.id);

  if (existingIndex >= 0) {
    current[existingIndex] = batch;
  } else {
    current.unshift(batch);
  }

  window.sessionStorage.setItem(BATCHES_KEY, JSON.stringify(current));
  window.dispatchEvent(new Event(UPDATE_EVENT));

  return readDemoBatches();
}

export function readDemoStock(): DemoStockItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.sessionStorage.getItem(STOCK_KEY);
    const stock = stored ? (JSON.parse(stored) as DemoStockItem[]) : [];

    return stock.sort(
      (first, second) =>
        new Date(second.receivedAt).getTime() - new Date(first.receivedAt).getTime(),
    );
  } catch {
    return [];
  }
}

export function saveDemoStockItem(item: DemoStockItem) {
  const current = readDemoStock();
  const existingIndex = current.findIndex((saved) => saved.id === item.id);

  if (existingIndex >= 0) {
    current[existingIndex] = item;
  } else {
    current.unshift(item);
  }

  window.sessionStorage.setItem(STOCK_KEY, JSON.stringify(current));
  window.dispatchEvent(new Event(UPDATE_EVENT));

  return readDemoStock();
}

export function getPatientBillingRequirement(
  patient: DemoPatientRecord,
  requestedBottles = 1,
): PatientBillingRequirement {
  const acquisitionMethod = patient.acquisitionMethod ?? "Por frasco";
  const paymentMethod = patient.paymentMethod ?? "A definir";
  const pendingBatchBottles = readDemoBatches().reduce(
    (total, batch) =>
      total +
      batch.items
        .filter((item) => item.patientId === patient.id)
        .reduce((count, item) => count + item.bottles, 0),
    0,
  );
  const assignedReadyBottles = readDemoStock()
    .filter(
      (item) =>
        item.origin === "pronta-entrega" && item.patientId === patient.id,
    )
    .reduce((total, item) => total + item.bottles, 0);
  const nextBottleNumber =
    (patient.bottlesReceived ?? 0) + pendingBatchBottles + assignedReadyBottles + 1;
  const bottleNumbers = Array.from(
    { length: Math.max(1, Math.trunc(requestedBottles)) },
    (_, index) => nextBottleNumber + index,
  );
  const renewalBottle = bottleNumbers.find(
    (number) => number > 3 && (number - 1) % 3 === 0,
  );
  const recurringAsaas = acquisitionMethod === "Recorrente — ASAAS";
  const paymentRequired =
    !recurringAsaas && (acquisitionMethod === "Por frasco" || Boolean(renewalBottle));
  const asaasRequired = recurringAsaas || (paymentRequired && paymentMethod === "Asaas");

  return {
    acquisitionMethod,
    paymentMethod,
    nextBottleNumber,
    paymentRequired,
    asaasRequired,
    explanation:
      recurringAsaas
        ? "Pagamento recorrente: confirme no ASAAS se a cobrança está em dia."
        : acquisitionMethod === "Por frasco"
        ? "Cada novo frasco precisa de pagamento confirmado."
        : paymentRequired
          ? `Novo pagamento necessário: o pedido inclui o ${renewalBottle}º frasco.`
          : `Frasco ${nextBottleNumber} incluído no pagamento do tratamento de 6 meses.`,
  };
}

export function assignReadyStockToPatient(
  item: DemoStockItem,
  patient: DemoPatientRecord,
  paymentConfirmed: boolean,
  asaasConfirmed: boolean,
) {
  const stored = readDemoStock().find((saved) => saved.id === item.id);

  if (!stored || stored.origin !== "pronta-entrega" || stored.patientId) {
    throw new Error("Este frasco não está mais disponível como pronta entrega.");
  }

  if (patient.registrationStatus !== "completed") {
    throw new Error("Complete o cadastro do paciente antes de vincular o frasco.");
  }

  const prescription = readDemoPrescriptions(patient.id)[0];

  if (!prescription) {
    throw new Error("O paciente precisa de uma receita médica antes da vinculação.");
  }

  const billing = getPatientBillingRequirement(patient);

  if (billing.paymentRequired && !paymentConfirmed) {
    throw new Error("Confirme o pagamento antes de vincular o frasco ao paciente.");
  }

  if (billing.asaasRequired && !asaasConfirmed) {
    throw new Error("Confirme no ASAAS se o pagamento está em dia.");
  }

  const now = new Date().toISOString();
  const assigned: DemoStockItem = {
    ...stored,
    id: stored.bottles > 1 ? `${stored.id}-assigned-${crypto.randomUUID()}` : stored.id,
    prescriptionId: prescription.id,
    patientId: patient.id,
    patientName: patient.name,
    patientCpf: patient.cpf,
    patientPhone: patient.phone,
    doctor: prescription.doctor,
    treatment: prescription.treatment,
    bottles: 1,
    delivery: patient.delivery,
    status: "disponivel",
    assignedAt: now,
    paymentConfirmedAt: billing.paymentRequired ? now : undefined,
    asaasConfirmedAt: billing.asaasRequired ? now : undefined,
  };

  if (stored.bottles > 1) {
    const stock = readDemoStock().map((saved) =>
      saved.id === stored.id ? { ...saved, bottles: saved.bottles - 1 } : saved,
    );
    window.sessionStorage.setItem(STOCK_KEY, JSON.stringify([assigned, ...stock]));
    window.dispatchEvent(new Event(UPDATE_EVENT));
  } else {
    saveDemoStockItem(assigned);
  }

  return assigned;
}

export function confirmDemoBatch(
  batch: DemoBatch,
  checkedBy: string,
  conferenceNotes: string,
) {
  const batches = readDemoBatches();
  const existingIndex = batches.findIndex((saved) => saved.id === batch.id);
  const currentBatch = batches[existingIndex];

  if (!currentBatch || currentBatch.status !== "pronto") {
    throw new Error("Este lote já foi conferido ou ainda não está pronto.");
  }

  const checkedIds = new Set(currentBatch.checkedPrescriptionIds ?? []);

  if (
    currentBatch.items.length === 0 ||
    currentBatch.items.some((item) => !checkedIds.has(item.prescriptionId))
  ) {
    throw new Error("Confira todos os itens antes de liberar o lote para estoque.");
  }

  if (!checkedBy.trim()) {
    throw new Error("Informe o responsável pela conferência do lote.");
  }

  const receivedAt = new Date().toISOString();
  const stock = readDemoStock();
  const existingPrescriptionIds = new Set(
    stock.map((item) => item.prescriptionId),
  );

  if (
    currentBatch.items.some((item) =>
      existingPrescriptionIds.has(item.prescriptionId),
    )
  ) {
    throw new Error("Uma ou mais receitas deste lote já estão registradas no estoque.");
  }

  const newItems: DemoStockItem[] = currentBatch.items.map((item) => {
    const patient = findDemoPatient(item.patientId);

    return {
      id: `stock-${currentBatch.id}-${item.prescriptionId}`,
      batchId: currentBatch.id,
      batchCode: currentBatch.code,
      prescriptionId: item.prescriptionId,
      origin: item.orderType ?? currentBatch.orderType ?? "pedido-paciente",
      patientId: item.patientId,
      patientName: item.patientName,
      patientCpf: item.patientCpf,
      patientPhone: patient?.phone,
      doctor: item.doctor,
      treatment: item.treatment,
      phase: item.phase,
      bottles: item.bottles,
      formulas: item.formulas,
      delivery: patient?.delivery,
      laboratory: currentBatch.laboratory,
      receivedAt,
      checkedBy: checkedBy.trim(),
      status: "disponivel",
      paymentConfirmedAt: item.paymentConfirmedAt,
      asaasConfirmedAt: item.asaasConfirmedAt,
    };
  });

  batches[existingIndex] = {
    ...currentBatch,
    status: "conferido",
    checkedAt: receivedAt,
    checkedBy: checkedBy.trim(),
    conferenceNotes: conferenceNotes.trim(),
  };

  window.sessionStorage.setItem(STOCK_KEY, JSON.stringify([...newItems, ...stock]));
  window.sessionStorage.setItem(BATCHES_KEY, JSON.stringify(batches));
  window.dispatchEvent(new Event(UPDATE_EVENT));

  return newItems;
}

export function subscribeDemoPatients(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener(UPDATE_EVENT, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(UPDATE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
