"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DemoPatientRecord,
  DemoPrescription,
  readDemoPatients,
  readDemoPrescriptions,
  saveDemoPatient,
  subscribeDemoPatients,
  treatmentPhases,
} from "../medico/patient-store";

type PatientStatus =
  | "com-pedido"
  | "em-conversa"
  | "ativo"
  | "bacteriana"
  | "tentar-novamente"
  | "perdido"
  | "concluido"
  | "desistente";

type DeliveryMethod = "Motoboy" | "Retirada" | "Sedex" | "Aéreo";
type AcquisitionMethod = "Por frasco" | "Tratamento de 6 meses" | "Recorrente — ASAAS";
type PaymentMethod = "A definir" | "Dinheiro" | "PIX" | "Asaas" | "Cartão de crédito" | "Cartão de débito";

type Patient = {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  birthDate: string;
  doctor: string;
  treatment: string;
  startDate: string;
  totalMonths: number;
  lastReceivedDate: string;
  bottlesReceived: number;
  drops: number;
  phase: string;
  delivery: DeliveryMethod;
  status: PatientStatus;
  address?: string;
  billingName?: string;
  billingCpf?: string;
  acquisitionMethod?: AcquisitionMethod;
  paymentMethod?: PaymentMethod;
  paymentInstallments?: number;
  notes?: string;
  abandonmentReason?: string;
  registrationComplete?: boolean;
};

type NewPatientForm = {
  name: string;
  cpf: string;
  birthDate: string;
  phone: string;
  address: string;
  billingName: string;
  billingCpf: string;
  doctor: string;
  treatment: string;
  startDate: string;
  totalMonths: number;
  lastReceivedDate: string;
  bottlesReceived: number;
  drops: number;
  phase: string;
  delivery: DeliveryMethod;
  status: PatientStatus;
  acquisitionMethod: AcquisitionMethod;
  paymentMethod: PaymentMethod;
  paymentInstallments: number;
  notes: string;
  abandonmentReason: string;
};

type FilterMode = "todos" | "novo-pedido" | "aniversario" | "ativos" | "concluidos";

const columns: {
  id: PatientStatus;
  title: string;
  color: string;
  badge: string;
}[] = [
  {
    id: "com-pedido",
    title: "Paciente com pedido",
    color: "border-t-[#b91142]",
    badge: "bg-[#fff0f3] text-[#a3113a]",
  },
  {
    id: "em-conversa",
    title: "Paciente em conversa",
    color: "border-t-[#d69b35]",
    badge: "bg-[#fff7e8] text-[#996719]",
  },
  {
    id: "ativo",
    title: "Paciente ativo",
    color: "border-t-[#20876b]",
    badge: "bg-[#eaf8f3] text-[#187157]",
  },
  {
    id: "bacteriana",
    title: "Paciente bacteriana",
    color: "border-t-[#3988a1]",
    badge: "bg-[#eaf6f9] text-[#28728a]",
  },
  {
    id: "tentar-novamente",
    title: "Tentar novamente",
    color: "border-t-[#8072bd]",
    badge: "bg-[#f1eefb] text-[#66549d]",
  },
  {
    id: "perdido",
    title: "Paciente perdido",
    color: "border-t-[#8e8587]",
    badge: "bg-[#f1eff0] text-[#6e6567]",
  },
  {
    id: "concluido",
    title: "Paciente concluído",
    color: "border-t-[#4f83a6]",
    badge: "bg-[#edf5fa] text-[#426b87]",
  },
  {
    id: "desistente",
    title: "Paciente desistente",
    color: "border-t-[#c26458]",
    badge: "bg-[#fdf0ee] text-[#9b5047]",
  },
];

function dateDaysAgo(days: number) {
  const date = new Date();

  date.setDate(date.getDate() - days);

  return date.toISOString().slice(0, 10);
}

function birthdayToday(year: number) {
  const today = new Date();

  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const initialPatients: Patient[] = [
  {
    id: "001",
    name: "Maria Fernanda Lima",
    cpf: "123.456.789-00",
    phone: "(41) 99999-1001",
    birthDate: birthdayToday(1994),
    doctor: "Dr. Flavio Mizoguchi",
    treatment: "Imunoterapia para rinite",
    startDate: "2025-02-10",
    totalMonths: 36,
    lastReceivedDate: dateDaysAgo(38),
    bottlesReceived: 8,
    drops: 6,
    phase: "FASE 1:10 - 500 UBE",
    delivery: "Motoboy",
    status: "com-pedido",
  },
  {
    id: "002",
    name: "João Pedro Martins",
    cpf: "234.567.890-11",
    phone: "(41) 99999-1002",
    birthDate: "1987-11-18",
    doctor: "Dra. Camila Rodrigues",
    treatment: "Imunobacteriana",
    startDate: "2025-09-14",
    totalMonths: 48,
    lastReceivedDate: dateDaysAgo(12),
    bottlesReceived: 4,
    drops: 5,
    phase: "FASE 1:100 - 100 UBE",
    delivery: "Retirada",
    status: "bacteriana",
  },
  {
    id: "003",
    name: "Ana Clara Ribeiro",
    cpf: "345.678.901-22",
    phone: "(41) 99999-1003",
    birthDate: "1998-04-21",
    doctor: "Dr. Flavio Mizoguchi",
    treatment: "Imunoterapia para rinite",
    startDate: "2025-05-03",
    totalMonths: 36,
    lastReceivedDate: dateDaysAgo(31),
    bottlesReceived: 6,
    drops: 6,
    phase: "FASE 1:1000 - 10 UBE",
    delivery: "Sedex",
    status: "ativo",
  },
  {
    id: "004",
    name: "Carlos Henrique Souza",
    cpf: "456.789.012-33",
    phone: "(41) 99999-1004",
    birthDate: "1979-08-02",
    doctor: "Dra. Camila Rodrigues",
    treatment: "Imunoterapia para rinite",
    startDate: "2026-01-11",
    totalMonths: 36,
    lastReceivedDate: dateDaysAgo(5),
    bottlesReceived: 1,
    drops: 4,
    phase: "FASE 1:10.000 - 1 UBE",
    delivery: "Aéreo",
    status: "em-conversa",
  },
  {
    id: "005",
    name: "Juliana Carvalho",
    cpf: "567.890.123-44",
    phone: "(41) 99999-1005",
    birthDate: "1991-12-09",
    doctor: "Dr. Flavio Mizoguchi",
    treatment: "Imunobacteriana",
    startDate: "2025-10-07",
    totalMonths: 60,
    lastReceivedDate: dateDaysAgo(44),
    bottlesReceived: 3,
    drops: 6,
    phase: "FASE 1:4 - 1250 UBE",
    delivery: "Motoboy",
    status: "bacteriana",
  },
  {
    id: "006",
    name: "Beatriz Oliveira",
    cpf: "678.901.234-55",
    phone: "(41) 99999-1006",
    birthDate: "1985-06-15",
    doctor: "Dra. Camila Rodrigues",
    treatment: "Imunoterapia para rinite",
    startDate: "2022-03-01",
    totalMonths: 36,
    lastReceivedDate: dateDaysAgo(80),
    bottlesReceived: 18,
    drops: 6,
    phase: "FASE 1:10 - 500 UBE",
    delivery: "Retirada",
    status: "concluido",
  },
];

const phaseOptions = treatmentPhases;

function createEmptyPatientForm(): NewPatientForm {
  const today = dateDaysAgo(0);

  return {
    name: "",
    cpf: "",
    birthDate: "",
    phone: "",
    address: "",
    billingName: "",
    billingCpf: "",
    doctor: initialPatients[0]?.doctor ?? "",
    treatment: "Imunoterapia para rinite",
    startDate: today,
    totalMonths: 36,
    lastReceivedDate: today,
    bottlesReceived: 0,
    drops: 6,
    phase: phaseOptions[0],
    delivery: "Retirada",
    status: "em-conversa",
    acquisitionMethod: "Por frasco",
    paymentMethod: "A definir",
    paymentInstallments: 1,
    notes: "",
    abandonmentReason: "",
  };
}

function formatCpfInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{4,5})(\d{4})$/, "$1-$2");
}

function patientFromMedicalRecord(record: DemoPatientRecord): Patient {
  const defaults = createEmptyPatientForm();

  return {
    id: record.id,
    name: record.name,
    cpf: record.cpf,
    birthDate: record.birthDate,
    doctor: record.doctor,
    phone: record.phone ?? "",
    address: record.address ?? "",
    billingName: record.billingName ?? "",
    billingCpf: record.billingCpf ?? "",
    treatment: record.treatment ?? defaults.treatment,
    startDate: record.startDate ?? defaults.startDate,
    totalMonths: record.totalMonths ?? defaults.totalMonths,
    lastReceivedDate: record.lastReceivedDate ?? defaults.lastReceivedDate,
    bottlesReceived: record.bottlesReceived ?? defaults.bottlesReceived,
    drops: record.drops ?? defaults.drops,
    phase: record.phase ?? defaults.phase,
    delivery: record.delivery ?? defaults.delivery,
    status: record.treatment?.toLowerCase().includes("bacteriana") &&
      (!record.status || ["ativo", "tentar-novamente", "em-conversa"].includes(record.status))
      ? "bacteriana"
      : record.status ?? "em-conversa",
    acquisitionMethod: record.acquisitionMethod ?? defaults.acquisitionMethod,
    paymentMethod: record.paymentMethod ?? defaults.paymentMethod,
    paymentInstallments: record.paymentInstallments ?? 1,
    notes: record.notes ?? "",
    abandonmentReason: record.abandonmentReason ?? "",
    registrationComplete: record.registrationStatus === "completed",
  };
}

function getDaysSince(date: string) {
  const reference = new Date(`${date}T12:00:00`);
  const today = new Date();

  const difference = today.getTime() - reference.getTime();

  return Math.max(0, Math.floor(difference / 86_400_000));
}

function getTreatmentProgress(patient: Patient) {
  const start = new Date(`${patient.startDate}T12:00:00`);
  const end = new Date(start);

  end.setMonth(end.getMonth() + patient.totalMonths);

  const total = end.getTime() - start.getTime();
  const elapsed = new Date().getTime() - start.getTime();

  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
}

function isBirthdayToday(date: string) {
  const birthday = new Date(`${date}T12:00:00`);
  const today = new Date();

  return (
    birthday.getDate() === today.getDate() &&
    birthday.getMonth() === today.getMonth()
  );
}

function requiresNewOrder(patient: Patient) {
  if (patient.status !== "ativo" || patient.treatment.toLowerCase().includes("bacteriana")) {
    return false;
  }

  return getDaysSince(patient.lastReceivedDate) >= 30;
}

export default function SecretariaPage() {
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [prescriptions, setPrescriptions] = useState<DemoPrescription[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState("Todos os médicos");
  const [filter, setFilter] = useState<FilterMode>("todos");
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [newPatient, setNewPatient] = useState<NewPatientForm>(
    createEmptyPatientForm,
  );
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [draggedPatientId, setDraggedPatientId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<PatientStatus | null>(null);
  const [abandoningPatient, setAbandoningPatient] = useState<Patient | null>(null);
  const [abandonmentReason, setAbandonmentReason] = useState("");
  const [abandonmentError, setAbandonmentError] = useState("");

  useEffect(() => {
    const syncPatients = () => {
      const receivedPatients = readDemoPatients().map(patientFromMedicalRecord);
      const receivedIds = new Set(receivedPatients.map((patient) => patient.id));

      setPatients([
        ...receivedPatients,
        ...initialPatients.filter((patient) => !receivedIds.has(patient.id)),
      ]);
      setPrescriptions(readDemoPrescriptions());
    };

    queueMicrotask(syncPatients);

    return subscribeDemoPatients(syncPatients);
  }, []);

  const doctors = [
    "Todos os médicos",
    ...Array.from(new Set(patients.map((patient) => patient.doctor))),
  ];

  const summary = useMemo(() => {
    return {
      newOrders: patients.filter(requiresNewOrder).length,
      birthdays: patients.filter((patient) =>
        isBirthdayToday(patient.birthDate),
      ).length,
      active: patients.filter((patient) => patient.status === "ativo").length,
      concluded: patients.filter(
        (patient) => patient.status === "concluido",
      ).length,
    };
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const normalizedSearch = search
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.-]/g, "");

    return patients.filter((patient) => {
      const searchable = `${patient.name} ${patient.cpf}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.-]/g, "");

      const matchesSearch =
        !normalizedSearch || searchable.includes(normalizedSearch);

      const matchesDoctor =
        selectedDoctor === "Todos os médicos" ||
        patient.doctor === selectedDoctor;

      let matchesFilter = true;

      if (filter === "novo-pedido") {
        matchesFilter = requiresNewOrder(patient);
      }

      if (filter === "aniversario") {
        matchesFilter = isBirthdayToday(patient.birthDate);
      }

      if (filter === "ativos") {
        matchesFilter = patient.status === "ativo";
      }

      if (filter === "concluidos") {
        matchesFilter = patient.status === "concluido";
      }

      return matchesSearch && matchesDoctor && matchesFilter;
    });
  }, [patients, search, selectedDoctor, filter]);

  function updateNewPatient<Field extends keyof NewPatientForm>(
    field: Field,
    value: NewPatientForm[Field],
  ) {
    setNewPatient((current) => ({ ...current, [field]: value }));
    setFormError("");
  }

  function closePatientForm() {
    setShowPatientForm(false);
    setEditingPatientId(null);
    setFormError("");
  }

  function openPatientForm(patient: Patient) {
    setEditingPatientId(patient.id);
    setNewPatient({
      name: patient.name,
      cpf: patient.cpf,
      birthDate: patient.birthDate,
      phone: patient.phone,
      address: patient.address ?? "",
      billingName: patient.billingName ?? "",
      billingCpf: patient.billingCpf ?? "",
      doctor: patient.doctor,
      treatment: patient.treatment,
      startDate: patient.startDate,
      totalMonths: patient.totalMonths,
      lastReceivedDate: patient.lastReceivedDate,
      bottlesReceived: patient.bottlesReceived,
      drops: patient.drops,
      phase: patient.phase,
      delivery: patient.delivery,
      status: patient.status,
      acquisitionMethod: patient.acquisitionMethod ?? "Por frasco",
      paymentMethod: patient.paymentMethod ?? "A definir",
      paymentInstallments: patient.paymentInstallments ?? 1,
      notes: patient.notes ?? "",
      abandonmentReason: patient.abandonmentReason ?? "",
    });
    setFormError("");
    setSuccessMessage("");
    setShowPatientForm(true);
  }

  function saveNewPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingPatientId) {
      setFormError("Selecione um paciente cadastrado pelo médico.");
      return;
    }

    if (newPatient.status === "desistente" && !newPatient.abandonmentReason.trim()) {
      setFormError("Informe o motivo da desistência antes de salvar o paciente.");
      return;
    }

    const normalizedCpf = newPatient.cpf.replace(/\D/g, "");

    if (normalizedCpf.length !== 11) {
      setFormError("Informe um CPF com 11 números.");
      return;
    }

    if (
      patients.some(
        (patient) =>
          patient.id !== editingPatientId &&
          patient.cpf.replace(/\D/g, "") === normalizedCpf,
      )
    ) {
      setFormError("Já existe um paciente cadastrado com esse CPF.");
      return;
    }

    const billingCpf = newPatient.billingCpf || newPatient.cpf;

    if (billingCpf.replace(/\D/g, "").length !== 11) {
      setFormError("Informe um CPF válido para os dados da nota fiscal.");
      return;
    }

    const patient: Patient = {
      id: editingPatientId,
      name: newPatient.name.trim(),
      cpf: newPatient.cpf,
      phone: newPatient.phone,
      birthDate: newPatient.birthDate,
      doctor: newPatient.doctor,
      treatment: newPatient.treatment,
      startDate: newPatient.startDate,
      totalMonths: newPatient.totalMonths,
      lastReceivedDate: newPatient.lastReceivedDate,
      bottlesReceived: newPatient.bottlesReceived,
      drops: newPatient.drops,
      phase: newPatient.phase,
      delivery: newPatient.delivery,
      status: newPatient.status,
      address: newPatient.address.trim(),
      billingName: newPatient.billingName.trim() || newPatient.name.trim(),
      billingCpf,
      acquisitionMethod: newPatient.acquisitionMethod,
      paymentMethod: newPatient.paymentMethod,
      paymentInstallments: newPatient.paymentMethod === "Cartão de crédito" ? Math.max(1, newPatient.paymentInstallments) : undefined,
      notes: newPatient.notes.trim(),
      abandonmentReason: newPatient.status === "desistente" ? newPatient.abandonmentReason.trim() : undefined,
      registrationComplete: true,
    };

    const previousRecord = readDemoPatients().find(
      (record) => record.id === editingPatientId,
    );

    saveDemoPatient({
      ...patient,
      createdAt: previousRecord?.createdAt ?? new Date().toISOString(),
      registrationStatus: "completed",
    });

    setPatients((current) =>
      current.map((existing) =>
        existing.id === editingPatientId ? patient : existing,
      ),
    );
    setNewPatient(createEmptyPatientForm());
    setSearch("");
    setSelectedDoctor("Todos os médicos");
    setFilter("todos");
    setSuccessMessage(`${patient.name} teve o cadastro complementado com sucesso.`);
    closePatientForm();
  }

  function movePatient(patient: Patient, status: PatientStatus, reason?: string) {
    if (patient.status === status) return;

    if (status === "desistente" && !reason?.trim()) {
      setAbandoningPatient(patient);
      setAbandonmentReason(patient.abandonmentReason ?? "");
      setAbandonmentError("");
      return;
    }

    const previousRecord = readDemoPatients().find((record) => record.id === patient.id);
    const updatedPatient: Patient = {
      ...patient,
      status,
      abandonmentReason: status === "desistente" ? reason?.trim() : undefined,
    };

    saveDemoPatient({
      ...updatedPatient,
      createdAt: previousRecord?.createdAt ?? new Date().toISOString(),
      registrationStatus: patient.registrationComplete === false ? "pending-secretary" : "completed",
    });
    setSuccessMessage(`${patient.name} movido para ${columns.find((column) => column.id === status)?.title.toLowerCase()}.`);
    setAbandoningPatient(null);
    setAbandonmentReason("");
    setAbandonmentError("");
  }

  function confirmAbandonment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!abandonmentReason.trim()) {
      setAbandonmentError("Informe o motivo da desistência para continuar.");
      return;
    }

    if (abandoningPatient) movePatient(abandoningPatient, "desistente", abandonmentReason);
  }

  const summaryCards: {
    title: string;
    value: number;
    description: string;
    icon: string;
    mode: FilterMode;
  }[] = [
    {
      title: "Novo pedido",
      value: summary.newOrders,
      description: "Pacientes aguardando renovação",
      icon: "🔔",
      mode: "novo-pedido",
    },
    {
      title: "Aniversariantes",
      value: summary.birthdays,
      description: "Pacientes que fazem aniversário hoje",
      icon: "🎂",
      mode: "aniversario",
    },
    {
      title: "Pacientes ativos",
      value: summary.active,
      description: "Tratamentos em acompanhamento",
      icon: "👤",
      mode: "ativos",
    },
    {
      title: "Concluídos",
      value: summary.concluded,
      description: "Tratamentos finalizados",
      icon: "✓",
      mode: "concluidos",
    },
  ];

  return (
    <main className="min-h-screen bg-[#f8f5f2] text-[#34292d]">
      <div className="min-h-screen lg:grid lg:grid-cols-[285px_minmax(0,1fr)]">
        {/* Menu lateral */}

        <aside className="bg-gradient-to-b from-[#b31340] to-[#790b2a] px-7 py-8 text-white lg:min-h-screen">
          <div className="border-b border-white/15 pb-8">
            <Image
              src="/logo-cra-branca.png"
              alt="CRA - Centro de Rinite e Alergia"
              width={170}
              height={115}
              priority
              className="h-auto w-36"
            />

            <p className="mt-4 text-sm text-white/70">
              Painel da Secretaria
            </p>
          </div>

          <nav className="mt-8 space-y-2">
            <button className="w-full rounded-2xl bg-white/15 px-4 py-3 text-left text-sm font-semibold">
              Dashboard
            </button>

            <Link href="/secretaria#kanban-pacientes" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Kanban de pacientes
            </Link>

            <Link href="/secretaria/lotes" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Lotes
            </Link>

            <Link href="/secretaria/estoque" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Vacinas em estoque
            </Link>

            <button className="w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Notas fiscais
            </button>

            <button className="w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Contratos
            </button>

            <button className="w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Configurações
            </button>

            <Link href="/" className="block w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold text-white/85 hover:bg-white/10">
              Sair
            </Link>
          </nav>

          <div className="mt-12 rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-sm font-semibold">
              CRA Care
            </p>

            <p className="mt-1 text-xs text-white/70">
              Desenvolvido pela Hippi
            </p>
          </div>
        </aside>

        {/* Conteúdo principal */}

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c173c]">
                Gestão operacional
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#86203b] sm:text-4xl">
                Olá, Secretaria
              </h1>

              <p className="mt-2 text-sm text-[#776b6e]">
                Acompanhe pacientes, pedidos e tratamentos em um único lugar.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-[#eadfd9] bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#faedf0] text-sm font-bold text-[#a3113a]">
                S
              </div>

              <div>
                <p className="text-sm font-semibold">
                  Secretaria CRA
                </p>

                <p className="text-xs text-[#877b7e]">
                  Atendimento e operação
                </p>
              </div>
              <Link href="/" className="ml-2 rounded-xl border border-[#eadfd9] px-3 py-2 text-xs font-semibold text-[#a3113a] hover:bg-[#fff5f7]">
                Sair
              </Link>
            </div>
          </header>

          {/* Indicadores */}

          <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {summaryCards.map((card) => {
              const active = filter === card.mode;

              return (
                <button
                  key={card.title}
                  type="button"
                  onClick={() =>
                    setFilter(active ? "todos" : card.mode)
                  }
                  className={`rounded-3xl border bg-white p-5 text-left shadow-[0_12px_35px_rgba(80,30,45,0.05)] transition hover:-translate-y-0.5 ${
                    active
                      ? "border-[#b91142] ring-2 ring-[#b91142]/10"
                      : "border-[#efe6e1]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#74686b]">
                      {card.title}
                    </span>

                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fbf2f1] text-lg">
                      {card.icon}
                    </span>
                  </div>

                  <p className="mt-5 text-4xl font-bold text-[#a3113a]">
                    {card.value}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-[#827679]">
                    {card.description}
                  </p>
                </button>
              );
            })}
          </section>

          {/* Pesquisa e filtros */}

          <section id="kanban-pacientes" className="mt-8 scroll-mt-6 rounded-3xl border border-[#efe6e1] bg-white p-5 shadow-[0_12px_35px_rgba(80,30,45,0.04)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#433438]">
                  Kanban de pacientes
                </h2>

                <p className="mt-1 text-sm text-[#817578]">
                  Visualize o acompanhamento de todos os médicos.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome ou CPF"
                  className="h-12 w-full rounded-xl border border-[#e9dfda] px-4 text-sm outline-none focus:border-[#b91142] sm:w-64"
                />

                <select
                  value={selectedDoctor}
                  onChange={(event) =>
                    setSelectedDoctor(event.target.value)
                  }
                  className="h-12 rounded-xl border border-[#e9dfda] bg-white px-4 text-sm outline-none focus:border-[#b91142]"
                >
                  {doctors.map((doctor) => (
                    <option key={doctor} value={doctor}>
                      {doctor}
                    </option>
                  ))}
                </select>

                <span className="flex h-12 items-center rounded-xl bg-[#fff0f3] px-4 text-xs font-semibold text-[#a3113a]">
                  Cadastro inicial realizado pelo médico
                </span>
              </div>
            </div>

            {filter !== "todos" && (
              <button
                type="button"
                onClick={() => setFilter("todos")}
                className="mt-4 rounded-full bg-[#fff0f3] px-4 py-2 text-xs font-semibold text-[#a3113a]"
              >
                Limpar filtro selecionado ×
              </button>
            )}
          </section>

          {successMessage && (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[#cfe9df] bg-[#edf8f3] px-4 py-3 text-sm text-[#187157]">
              <span>{successMessage}</span>
              <button
                type="button"
                onClick={() => setSuccessMessage("")}
                className="font-bold"
                aria-label="Fechar mensagem"
              >
                ×
              </button>
            </div>
          )}

          {/* Colunas do Kanban */}

          <section className="mt-6 overflow-x-auto pb-6">
            <div className="flex min-w-max gap-4">
              {columns.map((column) => {
                const columnPatients = filteredPatients.filter(
                  (patient) => patient.status === column.id,
                );

                return (
                  <div
                    key={column.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverStatus(column.id);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverStatus(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const patientId = event.dataTransfer.getData("text/plain") || draggedPatientId;
                      const patient = patients.find((item) => item.id === patientId);
                      setDraggedPatientId(null);
                      setDragOverStatus(null);
                      if (patient) movePatient(patient, column.id);
                    }}
                    className={`w-[320px] shrink-0 rounded-3xl border border-[#ece4df] border-t-4 p-4 transition ${column.color} ${dragOverStatus === column.id ? "bg-[#fff1f4] ring-2 ring-[#b91142]/35" : "bg-[#f1edea]"}`}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-[#49393d]">
                        {column.title}
                      </h3>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${column.badge}`}
                      >
                        {columnPatients.length}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {columnPatients.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-[#dcd2cc] px-4 py-6 text-center text-xs text-[#8c8184]">
                          Nenhum paciente nesta coluna.
                        </div>
                      )}

                      {columnPatients.map((patient) => {
                        const progress =
                          getTreatmentProgress(patient);

                        const daysSinceLastBottle = getDaysSince(
                          patient.lastReceivedDate,
                        );

                        const showAlert = requiresNewOrder(patient);
                        const latestPrescription = prescriptions.find(
                          (prescription) => prescription.patientId === patient.id,
                        );

                        return (
                          <article
                            key={patient.id}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", patient.id);
                              event.dataTransfer.effectAllowed = "move";
                              setDraggedPatientId(patient.id);
                            }}
                            onDragEnd={() => {
                              setDraggedPatientId(null);
                              setDragOverStatus(null);
                            }}
                            className={`cursor-grab rounded-2xl border border-[#ece3df] bg-white p-4 shadow-sm active:cursor-grabbing ${draggedPatientId === patient.id ? "opacity-50" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-bold text-[#3e3034]">
                                  {patient.name}
                                </h4>

                                <p className="mt-1 text-xs text-[#85797c]">
                                  {patient.cpf}
                                </p>
                              </div>

                              {isBirthdayToday(
                                patient.birthDate,
                              ) && (
                                <span
                                  title="Aniversariante de hoje"
                                  className="text-lg"
                                >
                                  🎂
                                </span>
                              )}
                            </div>

                            <div className="mt-4 space-y-2 text-xs text-[#706467]">
                              {patient.registrationComplete === false && (
                                <div className="rounded-xl bg-[#fff5df] px-3 py-2 text-xs font-semibold text-[#98671a]">
                                  Cadastro iniciado pelo médico. Complete os dados.
                                </div>
                              )}
                              <p>
                                <span className="font-semibold">
                                  Médico:
                                </span>{" "}
                                {patient.doctor}
                              </p>

                              <p>
                                <span className="font-semibold">
                                  Tratamento:
                                </span>{" "}
                                {patient.treatment}
                              </p>

                              <p>
                                <span className="font-semibold">
                                  Fase:
                                </span>{" "}
                                {patient.phase}
                              </p>

                              <p>
                                <span className="font-semibold">
                                  Posologia:
                                </span>{" "}
                                {patient.drops} gotas
                              </p>

                              <p>
                                <span className="font-semibold">
                                  Último recebimento:
                                </span>{" "}
                                {formatDate(
                                  patient.lastReceivedDate,
                                )}
                              </p>

                              <p>
                                <span className="font-semibold">
                                  Frascos recebidos:
                                </span>{" "}
                                {patient.bottlesReceived}
                              </p>
                              {patient.status === "desistente" && patient.abandonmentReason && (
                                <p className="rounded-xl bg-[#fdf0ee] px-3 py-2 text-[#9b5047]">
                                  <span className="font-semibold">Motivo da desistência:</span>{" "}
                                  {patient.abandonmentReason}
                                </p>
                              )}
                            </div>

                            <div className="mt-4">
                              <div className="mb-2 flex justify-between text-xs">
                                <span className="text-[#776b6e]">
                                  Tratamento
                                </span>

                                <span className="font-bold text-[#a3113a]">
                                  {progress}%
                                </span>
                              </div>

                              <div className="h-2 overflow-hidden rounded-full bg-[#f0e8e5]">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#a3113a] to-[#dc4770]"
                                  style={{
                                    width: `${progress}%`,
                                  }}
                                />
                              </div>
                            </div>

                            {latestPrescription && (
                              <div className="mt-4 rounded-xl border border-[#f0dfe4] bg-[#fff7f8] px-3 py-3">
                                <p className="text-xs font-bold text-[#a3113a]">
                                  Última receita disponível
                                </p>
                                <p className="mt-1 text-xs text-[#74666a]">
                                  {formatDate(latestPrescription.createdAt.slice(0, 10))}
                                  {" · "}
                                  {latestPrescription.bottles} frasco(s)
                                </p>
                                <p className="mt-1 text-xs text-[#74666a]">
                                  {latestPrescription.drops} gotas
                                  {" · "}
                                  {latestPrescription.formulas.length} composição(ões)
                                </p>
                              </div>
                            )}

                            {showAlert && (
                              <div className="mt-4 rounded-xl bg-[#fff1ec] px-3 py-2 text-xs font-semibold text-[#ae4b35]">
                                🔔 Novo pedido necessário:{" "}
                                {daysSinceLastBottle} dias.
                              </div>
                            )}

                            <div className="mt-4 flex items-center justify-between">
                              <span className="rounded-full bg-[#f5f0ed] px-3 py-1 text-xs font-medium text-[#706467]">
                                {patient.delivery}
                              </span>

                              <button
                                type="button"
                                onClick={() => openPatientForm(patient)}
                                className="text-xs font-bold text-[#a3113a]"
                              >
                                {patient.registrationComplete === false
                                  ? "Completar cadastro →"
                                  : "Abrir paciente →"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <p className="mt-2 text-xs text-[#8a7d80]">
            Ambiente demonstrativo com pacientes fictícios. A conexão segura
            com o Supabase será implementada posteriormente.
          </p>
        </section>
      </div>

      {showPatientForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#29151b]/65 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-patient-title"
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#eee4e0] px-6 py-5 sm:px-8">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a3113a]">
                  Cadastro da secretaria
                </span>
                <h2
                  id="new-patient-title"
                  className="mt-1 text-2xl font-bold text-[#4a343a]"
                >
                  Completar cadastro do paciente
                </h2>
                <p className="mt-1 text-sm text-[#817578]">
                  Os dados básicos foram informados pelo médico responsável.
                </p>
              </div>
              <button
                type="button"
                onClick={closePatientForm}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f1ee] text-xl text-[#77696d]"
                aria-label="Fechar cadastro"
              >
                ×
              </button>
            </div>

            <form
              id="new-patient-form"
              onSubmit={saveNewPatient}
              className="space-y-8 overflow-y-auto px-6 py-6 sm:px-8"
            >
              <section>
                <h3 className="text-base font-bold text-[#a3113a]">
                  Dados do paciente
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-[#544449] sm:col-span-2">
                    Nome completo *
                    <input
                      required
                      readOnly
                      value={newPatient.name}
                      onChange={(event) => updateNewPatient("name", event.target.value)}
                      placeholder="Nome completo do paciente"
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-[#f7f4f2] px-4 text-[#786c70] outline-none"
                    />
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    CPF *
                    <input
                      required
                      readOnly
                      inputMode="numeric"
                      value={newPatient.cpf}
                      onChange={(event) =>
                        updateNewPatient("cpf", formatCpfInput(event.target.value))
                      }
                      placeholder="000.000.000-00"
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-[#f7f4f2] px-4 text-[#786c70] outline-none"
                    />
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Data de nascimento *
                    <input
                      required
                      readOnly
                      type="date"
                      value={newPatient.birthDate}
                      onChange={(event) =>
                        updateNewPatient("birthDate", event.target.value)
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-[#f7f4f2] px-4 text-[#786c70] outline-none"
                    />
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Telefone / WhatsApp *
                    <input
                      required
                      inputMode="tel"
                      value={newPatient.phone}
                      onChange={(event) =>
                        updateNewPatient("phone", formatPhoneInput(event.target.value))
                      }
                      placeholder="(41) 99999-9999"
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                    />
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Médico responsável *
                    <select
                      required
                      disabled
                      value={newPatient.doctor}
                      onChange={(event) => updateNewPatient("doctor", event.target.value)}
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-[#f7f4f2] px-4 text-[#786c70] outline-none"
                    >
                      {doctors.slice(1).map((doctor) => (
                        <option key={doctor} value={doctor}>
                          {doctor}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-[#544449] sm:col-span-2">
                    Endereço
                    <input
                      value={newPatient.address}
                      onChange={(event) => updateNewPatient("address", event.target.value)}
                      placeholder="Rua, número, bairro e cidade"
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                    />
                  </label>
                </div>
              </section>

              <section className="border-t border-[#f0e8e4] pt-6">
                <h3 className="text-base font-bold text-[#a3113a]">
                  Dados para nota fiscal
                </h3>
                <p className="mt-1 text-xs text-[#817578]">
                  Se ficar em branco, serão utilizados os dados do paciente.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-[#544449]">
                    Nome para nota fiscal
                    <input
                      value={newPatient.billingName}
                      onChange={(event) =>
                        updateNewPatient("billingName", event.target.value)
                      }
                      placeholder="Nome do responsável pela nota"
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                    />
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    CPF para nota fiscal
                    <input
                      inputMode="numeric"
                      value={newPatient.billingCpf}
                      onChange={(event) =>
                        updateNewPatient("billingCpf", formatCpfInput(event.target.value))
                      }
                      placeholder="000.000.000-00"
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                    />
                  </label>
                </div>
              </section>

              <section className="border-t border-[#f0e8e4] pt-6">
                <h3 className="text-base font-bold text-[#a3113a]">
                  Tratamento e acompanhamento
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-[#544449]">
                    Tipo de tratamento
                    <select
                      value={newPatient.treatment}
                      onChange={(event) =>
                        updateNewPatient("treatment", event.target.value)
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 outline-none focus:border-[#b91142]"
                    >
                      <option>Imunoterapia para rinite</option>
                      <option>Imunobacteriana</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Fase
                    <select
                      value={newPatient.phase}
                      onChange={(event) => updateNewPatient("phase", event.target.value)}
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 outline-none focus:border-[#b91142]"
                    >
                      {phaseOptions.map((phase) => (
                        <option key={phase} value={phase}>
                          {phase}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Início do tratamento *
                    <input
                      required
                      type="date"
                      value={newPatient.startDate}
                      onChange={(event) =>
                        updateNewPatient("startDate", event.target.value)
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                    />
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Duração do tratamento
                    <select
                      value={newPatient.totalMonths}
                      onChange={(event) =>
                        updateNewPatient("totalMonths", Number(event.target.value))
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 outline-none focus:border-[#b91142]"
                    >
                      <option value={36}>3 anos · 36 meses</option>
                      <option value={48}>4 anos · 48 meses</option>
                      <option value={60}>5 anos · 60 meses</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Quantidade de gotas
                    <input
                      min={1}
                      type="number"
                      value={newPatient.drops}
                      onChange={(event) =>
                        updateNewPatient("drops", Number(event.target.value))
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                    />
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Situação no Kanban
                    <select
                      value={newPatient.status}
                      onChange={(event) =>
                        updateNewPatient("status", event.target.value as PatientStatus)
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 outline-none focus:border-[#b91142]"
                    >
                      {columns.map((column) => (
                        <option key={column.id} value={column.id}>
                          {column.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {newPatient.status === "desistente" && (
                    <label className="text-sm font-medium text-[#544449] sm:col-span-2">
                      Motivo da desistência *
                      <textarea
                        rows={3}
                        value={newPatient.abandonmentReason}
                        onChange={(event) => updateNewPatient("abandonmentReason", event.target.value)}
                        placeholder="Descreva por que o paciente desistiu do tratamento"
                        className="mt-2 w-full rounded-xl border border-[#e9dfda] px-4 py-3 outline-none focus:border-[#b91142]"
                      />
                    </label>
                  )}
                </div>
              </section>

              <section className="border-t border-[#f0e8e4] pt-6">
                <h3 className="text-base font-bold text-[#a3113a]">
                  Aquisição, frascos e entrega
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-[#544449]">
                    Método de aquisição
                    <select
                      value={newPatient.acquisitionMethod}
                      onChange={(event) => {
                        const acquisitionMethod = event.target.value as AcquisitionMethod;
                        setNewPatient((current) => ({
                          ...current,
                          acquisitionMethod,
                          paymentMethod: acquisitionMethod === "Recorrente — ASAAS" ? "Asaas" : current.paymentMethod,
                        }));
                        setFormError("");
                      }}
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 outline-none focus:border-[#b91142]"
                    >
                      <option>Por frasco</option>
                      <option>Tratamento de 6 meses</option>
                      <option>Recorrente — ASAAS</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Forma de pagamento
                    <select
                      value={newPatient.paymentMethod}
                      onChange={(event) =>
                        updateNewPatient(
                          "paymentMethod",
                          event.target.value as PaymentMethod,
                        )
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 outline-none focus:border-[#b91142]"
                    >
                      <option>A definir</option>
                      <option>Dinheiro</option>
                      <option>PIX</option>
                      <option value="Asaas">ASAAS</option>
                      <option>Cartão de crédito</option>
                      <option>Cartão de débito</option>
                    </select>
                  </label>
                  {newPatient.paymentMethod === "Cartão de crédito" && (
                    <label className="text-sm font-medium text-[#544449]">
                      Número de parcelas *
                      <input
                        min={1}
                        max={36}
                        type="number"
                        value={newPatient.paymentInstallments}
                        onChange={(event) => updateNewPatient("paymentInstallments", Math.max(1, Number(event.target.value)))}
                        className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                      />
                    </label>
                  )}
                  <label className="text-sm font-medium text-[#544449]">
                    Último recebimento *
                    <input
                      required
                      type="date"
                      value={newPatient.lastReceivedDate}
                      onChange={(event) =>
                        updateNewPatient("lastReceivedDate", event.target.value)
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                    />
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Frascos recebidos
                    <input
                      min={0}
                      type="number"
                      value={newPatient.bottlesReceived}
                      onChange={(event) =>
                        updateNewPatient(
                          "bottlesReceived",
                          Number(event.target.value),
                        )
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]"
                    />
                  </label>
                  <label className="text-sm font-medium text-[#544449] sm:col-span-2">
                    Método de recebimento
                    <select
                      value={newPatient.delivery}
                      onChange={(event) =>
                        updateNewPatient("delivery", event.target.value as DeliveryMethod)
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] bg-white px-4 outline-none focus:border-[#b91142]"
                    >
                      <option>Motoboy</option>
                      <option>Retirada</option>
                      <option>Sedex</option>
                      <option>Aéreo</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="border-t border-[#f0e8e4] pt-6">
                <label className="text-sm font-bold text-[#a3113a]">
                  Observações da secretaria
                  <textarea
                    rows={3}
                    value={newPatient.notes}
                    onChange={(event) => updateNewPatient("notes", event.target.value)}
                    placeholder="Informações adicionais sobre o paciente ou o tratamento"
                    className="mt-3 w-full rounded-xl border border-[#e9dfda] px-4 py-3 font-normal text-[#544449] outline-none focus:border-[#b91142]"
                  />
                </label>
              </section>

              {formError && (
                <div className="rounded-xl border border-[#f3d5d8] bg-[#fff2f3] px-4 py-3 text-sm text-[#a3113a]">
                  {formError}
                </div>
              )}
            </form>

            <div className="flex flex-col-reverse gap-3 border-t border-[#eee4e0] px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
              <button
                type="button"
                onClick={closePatientForm}
                className="rounded-xl border border-[#e6dbd6] px-5 py-3 text-sm font-semibold text-[#74666a]"
              >
                Cancelar
              </button>
              <button
                form="new-patient-form"
                type="submit"
                className="rounded-xl bg-[#a3113a] px-6 py-3 text-sm font-semibold text-white"
              >
                Salvar dados complementares
              </button>
            </div>
          </div>
        </div>
      )}

      {abandoningPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#29151b]/65 p-4 backdrop-blur-sm">
          <form onSubmit={confirmAbandonment} className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a3113a]">Paciente desistente</p>
            <h2 className="mt-2 text-2xl font-bold text-[#433438]">Registrar motivo da desistência</h2>
            <p className="mt-2 text-sm text-[#817578]">Informe por que {abandoningPatient.name} desistiu do tratamento.</p>
            <textarea
              autoFocus
              rows={4}
              value={abandonmentReason}
              onChange={(event) => {
                setAbandonmentReason(event.target.value);
                setAbandonmentError("");
              }}
              placeholder="Ex.: dificuldade financeira, mudança de cidade ou decisão do paciente"
              className="mt-5 w-full rounded-xl border border-[#e9dfda] px-4 py-3 text-sm outline-none focus:border-[#b91142]"
            />
            {abandonmentError && <p className="mt-2 text-sm text-[#a3113a]">{abandonmentError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setAbandoningPatient(null)} className="rounded-xl border border-[#e6dbd6] px-4 py-3 text-sm font-semibold text-[#74666a]">Cancelar</button>
              <button type="submit" className="rounded-xl bg-[#a3113a] px-4 py-3 text-sm font-semibold text-white">Confirmar desistência</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
