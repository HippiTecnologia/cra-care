"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  treatmentPhases,
} from "../medico/patient-store";
import type { DemoPatientRecord, PatientPaymentRecord } from "../medico/patient-store";
import { createDefaultPortalState, type PatientPortalState } from "../paciente/patient-portal-store";
import { patientUsername } from "../../lib/auth/credentials";
import {
  createSecretaryPatientAccess,
  loadSecretaryPatients,
  loadSecretaryPortals,
  saveSecretaryPatient,
  updateSecretaryPatientStatus,
  type SecretaryContext,
} from "../../lib/supabase/secretary-records";

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
type AcquisitionMethod = string;
type PaymentMethod = string;

type Patient = {
  id: string;
  username?: string;
  createdAt: string;
  name: string;
  cpf: string;
  phone: string;
  email?: string;
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
  acquisitionMethod?: AcquisitionMethod;
  paymentMethod?: PaymentMethod;
  paymentInstallments?: number;
  payments?: PatientPaymentRecord[];
  notes?: string;
  abandonmentReason?: string;
  registrationComplete?: boolean;
};

type NewPatientForm = {
  name: string;
  cpf: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  zipCode: string;
  street: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  deliveryNotes: string;
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
  payments: PatientPaymentRecord[];
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

const phaseOptions = treatmentPhases;

function createEmptyPatientForm(): NewPatientForm {
  const today = dateDaysAgo(0);

  return {
    name: "",
    cpf: "",
    birthDate: "",
    phone: "",
    email: "",
    address: "",
    zipCode: "",
    street: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "",
    state: "",
    deliveryNotes: "",
    billingName: "",
    billingCpf: "",
    doctor: "",
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
    payments: [],
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
    username: record.username,
    createdAt: record.createdAt,
    name: record.name,
    cpf: record.cpf,
    birthDate: record.birthDate,
    doctor: record.doctor,
    phone: record.phone ?? "",
    email: record.email ?? "",
    address: record.address ?? "",
    zipCode: record.zipCode ?? "",
    street: record.street ?? record.address ?? "",
    addressNumber: record.addressNumber ?? "",
    addressComplement: record.addressComplement ?? "",
    neighborhood: record.neighborhood ?? "",
    city: record.city ?? "",
    state: record.state ?? "",
    deliveryNotes: record.deliveryNotes ?? "",
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
    payments: record.payments ?? [],
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

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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
  const router = useRouter();
  const cardWasDragged = useRef(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [context, setContext] = useState<SecretaryContext | null>(null);
  const [portals, setPortals] = useState<Record<string, PatientPortalState>>({});
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
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => dateDaysAgo(0));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [savingPatient, setSavingPatient] = useState(false);
  const [kanbanMenuOpen, setKanbanMenuOpen] = useState(false);
  const [kanbanStatusFilter, setKanbanStatusFilter] = useState<PatientStatus | "todos">("todos");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const workspace = await loadSecretaryPatients();
        const loadedPortals = await loadSecretaryPortals(workspace.patients.map((patient) => patient.id));
        if (!active) return;
        setContext(workspace.context);
        setPatients(workspace.patients.map(patientFromMedicalRecord));
        setPortals(loadedPortals);
      } catch {
        if (active) setSuccessMessage("Não foi possível carregar a operação real da Secretaria.");
      }
    })();
    return () => { active = false; };
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

  const pendingAssessments = patients.reduce(
    (total, patient) => total + (portals[patient.id]?.assessments ?? []).filter((assessment) => !assessment.response).length,
    0,
  );

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

      const matchesKanbanStatus = kanbanStatusFilter === "todos" || patient.status === kanbanStatusFilter;
      return matchesSearch && matchesDoctor && matchesFilter && matchesKanbanStatus;
    });
  }, [filter, kanbanStatusFilter, patients, search, selectedDoctor]);

  function openKanbanFilter(status: PatientStatus | "todos") {
    setKanbanStatusFilter(status);
    setFilter("todos");
    setKanbanMenuOpen(false);
    window.setTimeout(() => document.getElementById("kanban-pacientes")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

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

  function openPatient(patient: Patient) {
    setEditingPatientId(patient.id);
    setNewPatient({
      name: patient.name,
      cpf: patient.cpf,
      birthDate: patient.birthDate,
      phone: patient.phone,
      email: patient.email ?? "",
      address: patient.address ?? "",
      zipCode: patient.zipCode ?? "",
      street: patient.street ?? "",
      addressNumber: patient.addressNumber ?? "",
      addressComplement: patient.addressComplement ?? "",
      neighborhood: patient.neighborhood ?? "",
      city: patient.city ?? "",
      state: patient.state ?? "",
      deliveryNotes: patient.deliveryNotes ?? "",
      billingName: patient.billingName ?? patient.name,
      billingCpf: patient.billingCpf ?? patient.cpf,
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
      payments: patient.payments ?? [],
      notes: patient.notes ?? "",
      abandonmentReason: patient.abandonmentReason ?? "",
    });
    setPaymentAmount("");
    setPaymentNotes("");
    setFormError("");
    setShowPatientForm(true);
  }

  function addPayment() {
    const amount = Number(paymentAmount.replace(",", "."));

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Informe um valor de pagamento maior que zero.");
      return;
    }

    if (!paymentDate) {
      setFormError("Informe a data do pagamento.");
      return;
    }

    if (newPatient.paymentMethod === "A definir") {
      setFormError("Selecione a forma de pagamento antes de registrar o valor pago.");
      return;
    }

    const payment: PatientPaymentRecord = {
      id: crypto.randomUUID(),
      amount,
      paidAt: paymentDate,
      method: newPatient.paymentMethod,
      installments:
        newPatient.paymentMethod === "Cartão de crédito"
          ? newPatient.paymentInstallments
          : undefined,
      notes: paymentNotes.trim() || undefined,
    };

    setNewPatient((current) => ({
      ...current,
      payments: [payment, ...current.payments],
    }));
    setPaymentAmount("");
    setPaymentNotes("");
    setFormError("");
  }

  async function saveNewPatient(event: FormEvent<HTMLFormElement>) {
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

    if (!context) {
      setFormError("Não foi possível identificar a sessão da Secretaria.");
      return;
    }
    const previous = patients.find((item) => item.id === editingPatientId);
    const patient: Patient = {
      id: editingPatientId,
      username: previous?.username,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      name: newPatient.name.trim(),
      cpf: newPatient.cpf,
      phone: newPatient.phone,
      email: newPatient.email.trim(),
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
      zipCode: newPatient.zipCode.trim(),
      street: newPatient.street.trim(),
      addressNumber: newPatient.addressNumber.trim(),
      addressComplement: newPatient.addressComplement.trim(),
      neighborhood: newPatient.neighborhood.trim(),
      city: newPatient.city.trim(),
      state: newPatient.state.trim().toUpperCase(),
      deliveryNotes: newPatient.deliveryNotes.trim(),
      billingName: newPatient.billingName.trim() || newPatient.name.trim(),
      billingCpf,
      acquisitionMethod: newPatient.acquisitionMethod,
      paymentMethod: newPatient.paymentMethod,
      paymentInstallments: newPatient.paymentMethod === "Cartão de crédito" ? Math.max(1, newPatient.paymentInstallments) : undefined,
      payments: newPatient.payments,
      notes: newPatient.notes.trim(),
      abandonmentReason: newPatient.status === "desistente" ? newPatient.abandonmentReason.trim() : undefined,
      registrationComplete: true,
    };

    setSavingPatient(true);
    setFormError("");
    try {
      const record: DemoPatientRecord = {
        ...patient,
        username: patient.username ?? patientUsername(patient.name),
        registrationStatus: "completed",
      };
      await saveSecretaryPatient(context, record);
      let accessMessage = "";
      if (!patient.username) {
        const access = await createSecretaryPatientAccess(record);
        patient.username = access.username;
        accessMessage = ` Usuário: ${access.username}. Senha inicial: ${access.initialPassword}.`;
      }
      setPatients((current) => current.map((existing) => existing.id === editingPatientId ? patient : existing));
      setNewPatient(createEmptyPatientForm());
      setSearch("");
      setSelectedDoctor("Todos os médicos");
      setFilter("todos");
      setSuccessMessage(`${patient.name} teve o cadastro complementado e salvo no Supabase.${accessMessage}`);
      closePatientForm();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível salvar o cadastro.");
    } finally {
      setSavingPatient(false);
    }
  }

  async function movePatient(patient: Patient, status: PatientStatus, reason?: string) {
    if (patient.status === status) return;

    if (status === "desistente" && !reason?.trim()) {
      setAbandoningPatient(patient);
      setAbandonmentReason(patient.abandonmentReason ?? "");
      setAbandonmentError("");
      return;
    }

    const updatedPatient: Patient = {
      ...patient,
      status,
      abandonmentReason: status === "desistente" ? reason?.trim() : undefined,
    };

    if (!context) return;
    try {
      await updateSecretaryPatientStatus(context, {
        ...updatedPatient,
        registrationStatus: patient.registrationComplete === false ? "pending-secretary" : "completed",
      });
      setPatients((current) => current.map((item) => item.id === updatedPatient.id ? updatedPatient : item));
      setSuccessMessage(`${patient.name} movido para ${columns.find((column) => column.id === status)?.title.toLowerCase()}.`);
      setAbandoningPatient(null);
      setAbandonmentReason("");
      setAbandonmentError("");
    } catch {
      setSuccessMessage("Não foi possível atualizar o status do paciente.");
    }
  }

  function confirmAbandonment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!abandonmentReason.trim()) {
      setAbandonmentError("Informe o motivo da desistência para continuar.");
      return;
    }

    if (abandoningPatient) void movePatient(abandoningPatient, "desistente", abandonmentReason);
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

            <button type="button" onClick={() => setKanbanMenuOpen((open) => !open)} className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10"><span>Kanban de pacientes</span><span>{kanbanMenuOpen ? "⌃" : "⌄"}</span></button>
            {kanbanMenuOpen && <div className="ml-3 space-y-1 border-l border-white/20 pl-3">{([
              ["todos", "Visão geral"], ["com-pedido", "Com pedido"], ["em-conversa", "Em conversa"], ["ativo", "Ativos"], ["bacteriana", "Bacteriana"], ["perdido", "Perdidos"], ["desistente", "Desistentes"], ["concluido", "Concluídos"],
            ] as [PatientStatus | "todos", string][]).map(([status, label]) => <button key={status} type="button" onClick={() => openKanbanFilter(status)} className={`block w-full rounded-xl px-3 py-2 text-left text-xs ${kanbanStatusFilter === status ? "bg-white/15 font-semibold text-white" : "text-white/70 hover:bg-white/10"}`}>{label}</button>)}</div>}

            <Link href="/secretaria/lotes" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Lotes
            </Link>

            <Link href="/secretaria/cadastros" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">Cadastros</Link>

            <Link href="/secretaria/avaliacoes" className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              <span>Avaliações</span>
              {pendingAssessments > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#a3113a]">{pendingAssessments}</span>}
            </Link>

            <Link href="/secretaria/notificacoes" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Notificações aos pacientes
            </Link>

            <Link href="/secretaria/estoque" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Vacinas em estoque
            </Link>

            <Link href="/secretaria/notas-fiscais" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">
              Notas fiscais
            </Link>

            <Link href="/secretaria/contratos" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">Contratos</Link>

            <Link href="/secretaria/configuracoes" className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10">Configurações</Link>

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

            {(filter !== "todos" || kanbanStatusFilter !== "todos") && (
              <button
                type="button"
                onClick={() => { setFilter("todos"); setKanbanStatusFilter("todos"); }}
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
                      if (patient) void movePatient(patient, column.id);
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
                        const portal = portals[patient.id] ?? createDefaultPortalState(patient.id);
                        const currentBottle = portal.bottles.find((bottle) => bottle.status === "em-uso");
                        const nextContact = currentBottle ? (() => { const date = new Date(`${currentBottle.startedAt}T12:00:00`); date.setDate(date.getDate() + 30); return date; })() : null;
                        const receivedAfterCurrentStart = Boolean(currentBottle && patient.lastReceivedDate && patient.lastReceivedDate > currentBottle.startedAt.slice(0, 10));
                        const showAlert = Boolean(nextContact && nextContact <= new Date() && !receivedAfterCurrentStart);

                        return (
                          <article
                            key={patient.id}
                            draggable
                            role="link"
                            tabIndex={0}
                            aria-label={`Abrir cadastro completo de ${patient.name}`}
                            onClick={() => {
                              if (cardWasDragged.current) return;
                              setKanbanMenuOpen(false);
                              router.push(`/secretaria/cadastros#${patient.id}`);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              setKanbanMenuOpen(false);
                              router.push(`/secretaria/cadastros#${patient.id}`);
                            }}
                            onDragStart={(event) => {
                              cardWasDragged.current = true;
                              event.dataTransfer.setData("text/plain", patient.id);
                              event.dataTransfer.effectAllowed = "move";
                              setDraggedPatientId(patient.id);
                            }}
                            onDragEnd={() => {
                              setDraggedPatientId(null);
                              setDragOverStatus(null);
                              window.setTimeout(() => {
                                cardWasDragged.current = false;
                              }, 0);
                            }}
                            className={`cursor-pointer rounded-2xl border border-[#ece3df] bg-white p-4 shadow-sm outline-none transition hover:-translate-y-0.5 hover:border-[#d9b4bf] hover:shadow-md focus:ring-2 focus:ring-[#b91142]/40 active:cursor-grabbing ${draggedPatientId === patient.id ? "opacity-50" : ""}`}
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
                                  Próximo pedido/contato:
                                </span>{" "}
                                {nextContact ? nextContact.toLocaleDateString("pt-BR") : "Aguardando início do frasco"}
                              </p>

                              <p>
                                <span className="font-semibold">
                                  Frascos recebidos:
                                </span>{" "}
                                {patient.bottlesReceived}
                              </p>
                              <p><span className="font-semibold">Frascos iniciados:</span> {portal.bottles.length}</p>
                              <p><span className="font-semibold">Frasco atual:</span> {currentBottle ? currentBottle.number : "Nenhum"}</p>
                              <p><span className="font-semibold">Status:</span> {column.title}</p>
                              {patient.status === "desistente" && patient.abandonmentReason && (
                                <p className="rounded-xl bg-[#fdf0ee] px-3 py-2 text-[#9b5047]">
                                  <span className="font-semibold">Motivo da desistência:</span>{" "}
                                  {patient.abandonmentReason}
                                </p>
                              )}
                            </div>

                            {showAlert && (
                              <div className="mt-4 rounded-xl bg-[#fff1ec] px-3 py-2 text-xs font-semibold text-[#ae4b35]">
                                ⚠️ Próximo pedido pendente
                              </div>
                            )}

                            <div className="mt-4 flex items-center justify-between">
                              <div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#f5f0ed] px-3 py-1 text-xs font-medium text-[#706467]">{patient.delivery}</span><span className="rounded-full bg-[#fff0f3] px-3 py-1 text-xs font-semibold text-[#a3113a]">{patient.acquisitionMethod ?? "Método não definido"}</span></div>

                              <span className="text-xs font-bold text-[#a3113a]">
                                {patient.registrationComplete === false
                                  ? "Completar cadastro →"
                                  : "Abrir paciente →"}
                              </span>
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
            Operação sincronizada com a base segura do CRA Care.
          </p>
        </section>
      </div>

      {showPatientForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#29151b]/65 p-4 backdrop-blur-sm lg:left-[285px] lg:justify-end">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-patient-title"
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] bg-white shadow-2xl lg:max-w-[min(900px,calc(100vw-285px))] lg:rounded-r-none"
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
                  <label className="text-sm font-medium text-[#544449] sm:col-span-2">E-mail do paciente<input type="email" value={newPatient.email} onChange={(event) => updateNewPatient("email", event.target.value)} placeholder="paciente@email.com" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /></label>
                  <label className="text-sm font-medium text-[#544449]">CEP<input value={newPatient.zipCode} onChange={(event) => updateNewPatient("zipCode", event.target.value)} placeholder="00000-000" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /></label>
                  <label className="text-sm font-medium text-[#544449]">Rua<input value={newPatient.street} onChange={(event) => updateNewPatient("street", event.target.value)} placeholder="Nome da rua" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /></label>
                  <label className="text-sm font-medium text-[#544449]">Número<input value={newPatient.addressNumber} onChange={(event) => updateNewPatient("addressNumber", event.target.value)} placeholder="Número" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /></label>
                  <label className="text-sm font-medium text-[#544449]">Complemento<input value={newPatient.addressComplement} onChange={(event) => updateNewPatient("addressComplement", event.target.value)} placeholder="Apartamento, bloco..." className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /></label>
                  <label className="text-sm font-medium text-[#544449]">Bairro<input value={newPatient.neighborhood} onChange={(event) => updateNewPatient("neighborhood", event.target.value)} placeholder="Bairro" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /></label>
                  <label className="text-sm font-medium text-[#544449]">Cidade<input value={newPatient.city} onChange={(event) => updateNewPatient("city", event.target.value)} placeholder="Cidade" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" /></label>
                  <label className="text-sm font-medium text-[#544449]">Estado<input maxLength={2} value={newPatient.state} onChange={(event) => updateNewPatient("state", event.target.value.toUpperCase())} placeholder="PR" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 uppercase outline-none focus:border-[#b91142]" /></label>
                  <label className="text-sm font-medium text-[#544449] sm:col-span-2">Observações de entrega<textarea value={newPatient.deliveryNotes} onChange={(event) => updateNewPatient("deliveryNotes", event.target.value)} rows={3} placeholder="Ponto de referência, melhor horário, pessoa autorizada a receber..." className="mt-2 w-full rounded-xl border border-[#e9dfda] px-4 py-3 outline-none focus:border-[#b91142]" /></label>
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
                      <option>Método 1.0</option>
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#a3113a]">Financeiro do paciente</h3>
                    <p className="mt-1 text-xs text-[#817578]">Registre os valores efetivamente pagos pelo paciente.</p>
                  </div>
                  <div className="rounded-2xl bg-[#edf8f3] px-4 py-3 text-right">
                    <p className="text-xs text-[#187157]">Total pago</p>
                    <p className="mt-1 text-xl font-bold text-[#187157]">
                      {formatCurrency(newPatient.payments.reduce((total, payment) => total + payment.amount, 0))}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-sm font-medium text-[#544449]">
                    Valor pago (R$)
                    <input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="0,00" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" />
                  </label>
                  <label className="text-sm font-medium text-[#544449]">
                    Data do pagamento
                    <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" />
                  </label>
                  <label className="text-sm font-medium text-[#544449] lg:col-span-2">
                    Observação
                    <input value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} placeholder="Ex.: pagamento do 2º frasco" className="mt-2 h-12 w-full rounded-xl border border-[#e9dfda] px-4 outline-none focus:border-[#b91142]" />
                  </label>
                </div>
                <button type="button" onClick={addPayment} className="mt-4 rounded-xl bg-[#187157] px-5 py-3 text-sm font-semibold text-white">
                  Adicionar pagamento
                </button>

                <div className="mt-5 space-y-3">
                  {newPatient.payments.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[#e6dbd6] px-4 py-5 text-center text-sm text-[#817578]">Nenhum pagamento registrado.</p>
                  ) : newPatient.payments.map((payment) => (
                    <article key={payment.id} className="flex flex-col gap-3 rounded-2xl bg-[#fbf5f2] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#433438]">{formatCurrency(payment.amount)}</p>
                        <p className="mt-1 text-xs text-[#716569]">{formatDate(payment.paidAt)} · {payment.method}{payment.installments ? ` · ${payment.installments}x` : ""}</p>
                        {payment.notes && <p className="mt-1 text-xs text-[#817578]">{payment.notes}</p>}
                      </div>
                      <button type="button" onClick={() => setNewPatient((current) => ({ ...current, payments: current.payments.filter((item) => item.id !== payment.id) }))} className="self-start rounded-lg bg-[#fff1f3] px-3 py-2 text-xs font-semibold text-[#a3113a]">
                        Remover
                      </button>
                    </article>
                  ))}
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
                disabled={savingPatient}
                className="rounded-xl bg-[#a3113a] px-6 py-3 text-sm font-semibold text-white"
              >
                {savingPatient ? "Salvando..." : "Salvar dados complementares"}
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
