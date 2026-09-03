export type PatientBottle = {
  id: string;
  number: number;
  receivedAt?: string;
  startedAt: string;
  finishedAt?: string;
  status: "recebido" | "em-uso" | "finalizado";
};

export type PatientUseRecord = {
  id: string;
  bottleId: string;
  date: string;
  registeredAt: string;
  drops: number;
};

export type PatientAssessment = {
  id: string;
  bottleId: string;
  bottleNumber: number;
  feeling?: "muito-bem" | "bem" | "sem-mudancas" | "desconfortos" | "nao-bem";
  symptomFrequency?: "raramente" | "as-vezes" | "frequentemente" | "quase-diariamente";
  symptomSeverity?: "leves" | "moderados" | "severos" | "muito-severos";
  medicationFrequency?: "nunca" | "1-2" | "3-5" | "todos-os-dias";
  notes: string;
  createdAt: string;
  viewedAt?: string;
  viewedBy?: string;
  response?: string;
  respondedAt?: string;
  respondedBy?: string;
};

export type PatientReminderSettings = {
  enabled: boolean;
  weekdays: number[];
  time: string;
};

export type PatientPortalState = {
  patientId: string;
  signedAt?: string;
  signedName?: string;
  signedCpf?: string;
  bottles: PatientBottle[];
  useRecords: PatientUseRecord[];
  dayOverrides?: Record<string, "off" | "nao-registrado">;
  assessments: PatientAssessment[];
  reminders: PatientReminderSettings;
  readNotificationIds?: string[];
  /** Correções administrativas no histórico, sempre acompanhadas do motivo. */
  bottleHistoryAdjustments?: Record<number, {
    receivedAt?: string;
    startedAt?: string;
    finishedAt?: string;
    status?: "recebido" | "em-uso" | "finalizado";
    reason: string;
    updatedAt: string;
    updatedBy: string;
  }>;
};

export function normalizeCpf(value: string) {
  return value.replace(/\D/g, "");
}

export function createDefaultPortalState(patientId: string): PatientPortalState {
  return {
    patientId,
    bottles: [],
    useRecords: [],
    dayOverrides: {},
    assessments: [],
    readNotificationIds: [],
    bottleHistoryAdjustments: {},
    reminders: {
      enabled: false,
      weekdays: [1, 3, 5],
      time: "09:00",
    },
  };
}
