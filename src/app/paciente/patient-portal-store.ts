import {
  DemoPatientRecord,
  demoMedicalPatients,
  readDemoPatients,
} from "../medico/patient-store";

export type PatientBottle = {
  id: string;
  number: number;
  receivedAt?: string;
  startedAt: string;
  finishedAt?: string;
  status: "em-uso" | "finalizado";
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

const ACTIVE_PATIENT_KEY = "cra-care-demo-active-patient";
const PORTAL_KEY_PREFIX = "cra-care-demo-patient-portal-";
const PORTAL_UPDATE_EVENT = "cra-care-demo-patient-portal-updated";

const demoAssessments: PatientAssessment[] = [
  {
    id: "assessment-demo-pending",
    bottleId: "bottle-demo-2",
    bottleNumber: 2,
    symptomFrequency: "as-vezes",
    symptomSeverity: "moderados",
    medicationFrequency: "1-2",
    notes: "Senti melhora na respiração, mas ainda tenho espirros nos dias mais frios.",
    createdAt: "2026-08-27T08:30:00",
  },
  {
    id: "assessment-demo-answered",
    bottleId: "bottle-demo-1",
    bottleNumber: 1,
    symptomFrequency: "frequentemente",
    symptomSeverity: "moderados",
    medicationFrequency: "3-5",
    notes: "Nas primeiras semanas ainda precisei usar antialérgico.",
    createdAt: "2026-07-24T16:00:00",
    viewedAt: "2026-07-25T09:10:00",
    viewedBy: "Secretaria CRA",
    response: "Relato recebido. A equipe continuará acompanhando sua evolução e avisará o médico responsável.",
    respondedAt: "2026-07-25T09:15:00",
    respondedBy: "Secretaria CRA",
  },
];

export function normalizeCpf(value: string) {
  return value.replace(/\D/g, "");
}

export function findPatientByCpf(cpf: string): DemoPatientRecord | undefined {
  const normalized = normalizeCpf(cpf);

  return [...readDemoPatients(), ...demoMedicalPatients].find(
    (patient) => normalizeCpf(patient.cpf) === normalized,
  );
}

export function setActivePortalPatient(patientId: string) {
  window.sessionStorage.setItem(ACTIVE_PATIENT_KEY, patientId);
}

export function getActivePortalPatient(): DemoPatientRecord | undefined {
  if (typeof window === "undefined") return undefined;

  const patientId = window.sessionStorage.getItem(ACTIVE_PATIENT_KEY);
  const allPatients = [...readDemoPatients(), ...demoMedicalPatients];

  return patientId
    ? allPatients.find((patient) => patient.id === patientId)
    : demoMedicalPatients[0];
}

export function createDefaultPortalState(patientId: string): PatientPortalState {
  return {
    patientId,
    bottles: [],
    useRecords: [],
    dayOverrides: {},
    assessments: patientId === "001" ? demoAssessments.map((assessment) => ({ ...assessment })) : [],
    readNotificationIds: [],
    bottleHistoryAdjustments: {},
    reminders: {
      enabled: false,
      weekdays: [1, 3, 5],
      time: "09:00",
    },
  };
}

export function readPortalState(patientId: string): PatientPortalState {
  if (typeof window === "undefined") {
    return createDefaultPortalState(patientId);
  }

  try {
    const stored = window.sessionStorage.getItem(`${PORTAL_KEY_PREFIX}${patientId}`);
    const parsed = stored ? (JSON.parse(stored) as PatientPortalState) : undefined;

    if (parsed && patientId === "001" && parsed.assessments.length === 0) {
      return { ...parsed, assessments: demoAssessments.map((assessment) => ({ ...assessment })) };
    }

    return parsed ?? createDefaultPortalState(patientId);
  } catch {
    return createDefaultPortalState(patientId);
  }
}

export function savePortalState(state: PatientPortalState) {
  window.sessionStorage.setItem(
    `${PORTAL_KEY_PREFIX}${state.patientId}`,
    JSON.stringify(state),
  );
  window.dispatchEvent(new Event(PORTAL_UPDATE_EVENT));

  return state;
}

export function subscribePortalState(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener(PORTAL_UPDATE_EVENT, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(PORTAL_UPDATE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
