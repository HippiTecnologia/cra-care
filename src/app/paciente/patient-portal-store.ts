import {
  DemoPatientRecord,
  demoMedicalPatients,
  readDemoPatients,
} from "../medico/patient-store";

export type PatientBottle = {
  id: string;
  number: number;
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
  feeling: "muito-bem" | "bem" | "sem-mudancas" | "desconfortos" | "nao-bem";
  notes: string;
  createdAt: string;
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
};

const ACTIVE_PATIENT_KEY = "cra-care-demo-active-patient";
const PORTAL_KEY_PREFIX = "cra-care-demo-patient-portal-";
const PORTAL_UPDATE_EVENT = "cra-care-demo-patient-portal-updated";

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
    assessments: [],
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

    return stored
      ? (JSON.parse(stored) as PatientPortalState)
      : createDefaultPortalState(patientId);
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
