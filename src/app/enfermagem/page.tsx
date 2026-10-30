"use client";

import Image from "next/image";
import Link from "next/link";
import { ClipboardEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createNursingPatient,
  createNursingReport,
  findNursingPatient,
  findNursingPatientByCpf,
  loadNursingReportsForPatient,
  loadNursingWorkspace,
  deleteNursingReport,
  type NursingPatient,
  type NursingDoctor,
  type NursingProfile,
  updateNursingReport,
  updateNursingPatient,
} from "../../lib/supabase/nursing-records";
import { patchSubstanceCode, patchSubstanceDetails } from "../../lib/patch-substances";
import { formatBirthDate, normalizeBirthDate } from "../../lib/birth-date";
import { getPrickGroupsForDoctor, isAlessandraPrickDoctor, prickResultKey } from "../../lib/prick-batteries";

type Section = "patients" | "reports" | "in-progress";
type ReportType = "prick_test" | "patch_test";
type Modal = "patient" | "patient-edit" | "report" | null;
type PrickResult = { mm: number; reaction: "-" | "+" | "++" | "+++" | "++++"; pseudopod: boolean; dermatographism: boolean };
type PatchResult = { firstReading: "" | "-" | "?" | "+" | "++" | "+++"; secondReading: "" | "-" | "?" | "+" | "++" | "+++" };
type SavedReport = { id: string; patient_id: string; nurse_profile_id: string; doctor_profile_id?: string | null; report_type: ReportType; content: Record<string, unknown>; created_at: string };

function isDuplicateReport(report: SavedReport) {
  return typeof report.content.duplicateOf === "string" && Boolean(report.content.duplicateOf);
}

function reportContentSignature(content: Record<string, unknown>) {
  const stableContent = { ...content };
  delete stableContent.registeredAt;
  delete stableContent.duplicateOf;
  return JSON.stringify(stableContent);
}

function normalizePersonName(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isDoctorWithNursingAccess(profile: NursingProfile | null) {
  if (profile?.role !== "medico") return false;
  const name = normalizePersonName(profile.fullName);
  const crm = (profile.coren ?? "").replace(/\D/g, "");
  return crm === "28606"
    || crm === "17877"
    || name.includes("alessandra") && name.includes("bitencourt")
    || name.includes("patricia") && name.includes("martins");
}

function doctorAllowedForReport(doctor: NursingDoctor, reportType: ReportType) {
  const name = normalizePersonName(doctor.fullName);
  const crm = (doctor.crm ?? "").replace(/\D/g, "");
  const isExamDoctor = crm === "28606"
    || crm === "17877"
    || name.includes("alessandra") && name.includes("bitencourt")
    || name.includes("patricia") && name.includes("martins");
  if (isExamDoctor) return true;
  if (reportType === "prick_test") return crm === "20762" || (name.includes("sergio") && name.includes("maniglia"));
  return false;
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function createInitialPatchResults(): Record<string, PatchResult> {
  return Object.fromEntries(
    patchBatteries.flatMap((battery) => battery.items.map((item) => [item, { firstReading: "-", secondReading: "-" }])),
  );
}

const patchBatteries = [
  { name: "Bateria Padrão 1", items: ["P-01 · Antraquinona · 2,0%", "P-02 · Bálsamo do Peru · 25,0%", "P-03 · PPD Mix · 0,4%", "P-04 · Hidroquinona · 1,0%", "P-05 · Bicromato de Potássio · 0,5%", "P-06 · Propilenoglicol · 10,0%", "P-07 · Butilfenol-para-terciário · 1,0%", "P-08 · Neomicina, Sulfato · 20,0%", "P-09 · Irgasan · 1,0%", "P-10 · Kathon CG · 0,5%"] },
  { name: "Bateria Padrão 2", items: ["P-11 · Cloreto de Cobalto · 1,0%", "P-12 · Lanolina · 30,0%", "P-13 · Tiuram Mix · 1,0%", "P-14 · Etilenodiamina · 1,0%", "P-15 · Perfume Mix · 7,0%", "P-16 · Mercapto Mix · 2,0%", "P-17 · Benzocaína · 5,0%", "P-18 · Metacrilato de 2-hidroxietila (2-HEMA)", "P-19 · Quinolina Mix · 6,0%", "P-20 · Nitrofurazona · 1,0%"] },
  { name: "Bateria Padrão 3", items: ["P-21 · Paraben Mix · 15,0%", "P-22 · Resina Epóxi · 1,0%", "P-23 · Timerosal · 0,1%", "P-24 · Terebentina · 10,0%", "P-25 · Carba Mix · 3,0%", "P-26 · Prometazina · 1,0%", "P-27 · Sulfato de Níquel · 5,0%", "P-28 · Colofônia · 20,0%", "P-29 · Parafenilenodiamina · 1,0%", "P-30 · Formaldeído · 1,0%"] },
  { name: "Bateria Cosméticos 1", items: ["C-01 · Germall 115 · 2,0%", "C-02 · BHT · 2,0%", "C-03 · Resina Tosilamida/Formaldeído · 10,0%", "C-04 · Trietanolamina · 2,5%", "C-05 · Bronopol · 0,5%", "C-06 · Cloracetamida · 0,2%", "C-07 · Ácido Sórbico · 2,0%", "C-08 · Tioglicolato de Amônio · 2,5%", "C-09 · Amerchol L 101 · 100,0%", "C-10 · Clorexidina · 0,5%", "C-11 · Dietanolamida de Ácido Graxo de Coco · 0,5%"] },
];
const emptyPrick = (): PrickResult => ({ mm: 0, reaction: "-", pseudopod: false, dermatographism: false });
const createInitialPrickResults = (groups: { items: string[]; resultKeys?: string[] }[]) => Object.fromEntries(groups.flatMap((group) => group.items.map((item, index) => [group.resultKeys?.[index] ?? item, emptyPrick()])));
const reactionForMm = (mm: number): PrickResult["reaction"] => mm === 0 ? "-" : mm <= 3 ? "+" : mm <= 6 ? "++" : mm <= 9 ? "+++" : "++++";

function escapeHtml(value: string | number) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function patchResultText(value: unknown) {
  if (!value || typeof value !== "object") return "Não informado";
  const result = value as Partial<PatchResult>;
  return result.secondReading || result.firstReading || "Não informado";
}

function patchResultDetails(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const result = value as Partial<PatchResult>;
  return `1ª leitura: ${result.firstReading || "Não informado"} · 2ª leitura: ${result.secondReading || "Não informado"}`;
}

export default function NursingPage() {
  const [section, setSection] = useState<Section>("patients");
  const [profile, setProfile] = useState<NursingProfile | null>(null);
  const [doctors, setDoctors] = useState<NursingDoctor[]>([]);
  const [patients, setPatients] = useState<NursingPatient[]>([]);
  const [selected, setSelected] = useState<NursingPatient | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [rawReports, setAllReports] = useState<SavedReport[]>([]);
  const [reportPatientFilter, setReportPatientFilter] = useState("");
  const [reportSearchQuery, setReportSearchQuery] = useState("");
  const [reportDateFilter, setReportDateFilter] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchCpf = searchQuery;
  const setSearchCpf = setSearchQuery;
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [duplicatePatient, setDuplicatePatient] = useState<NursingPatient | null>(null);
  const [reportType, setReportType] = useState<ReportType>("prick_test");
  const [reportDoctorId, setReportDoctorId] = useState("");
  const [includeImmunotechBattery, setIncludeImmunotechBattery] = useState(false);
  const [prickResults, setPrickResults] = useState<Record<string, PrickResult>>({});
  const [patchResults, setPatchResults] = useState<Record<string, PatchResult>>({});
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingDuplicateReportIds, setEditingDuplicateReportIds] = useState<string[]>([]);
  const [savingReport, setSavingReport] = useState(false);
  const reportSaveInFlight = useRef(false);
  const [notes, setNotes] = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));

  async function reload() {
    const workspace = await loadNursingWorkspace();
    setProfile(workspace.profile);
    setDoctors(workspace.doctors);
    setPatients(workspace.patients);
    setAllReports(workspace.reports as SavedReport[]);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload().catch(() => setMessage("Não foi possível carregar a área de Exames.")); }, []);

  const reportCount = useMemo(() => reports.length, [reports]);
  const filteredReports = useMemo(() => {
    const query = reportSearchQuery.trim().toLocaleLowerCase("pt-BR");
    return rawReports.filter((report) => {
      const patientName = String(report.content.patientName ?? "Paciente");
      const patientCpf = String(report.content.patientCpf ?? "");
      const matchesSearch = !query || patientName.toLocaleLowerCase("pt-BR").includes(query) || patientCpf.replace(/\D/g, "").includes(query.replace(/\D/g, ""));
      const matchesPatient = !reportPatientFilter || patientName === reportPatientFilter;
      const reportDate = (typeof report.content.examDate === "string" ? report.content.examDate : report.created_at).slice(0, 10);
      return report.content.status !== "em_andamento" && !isDuplicateReport(report) && matchesSearch && matchesPatient && (!reportDateFilter || reportDate === reportDateFilter);
    });
  }, [rawReports, reportDateFilter, reportPatientFilter, reportSearchQuery]);
  const allReports = filteredReports;
  const inProgressReports = useMemo(
    () => {
      const pendingReports = rawReports.filter((report) => report.report_type === "patch_test"
        && report.content.status === "em_andamento"
        && !isDuplicateReport(report)
        && (profile?.role !== "medico" || report.nurse_profile_id === profile.id));
      const groups = new Map<string, SavedReport[]>();
      for (const report of pendingReports) {
        const key = `${report.patient_id}:${String(report.content.examDate ?? report.created_at).slice(0, 10)}:${reportContentSignature(report.content)}`;
        groups.set(key, [...(groups.get(key) ?? []), report]);
      }
      return [...groups.values()]
        .map((group) => {
          const [report, ...duplicates] = [...group].sort((first, second) => first.created_at.localeCompare(second.created_at));
          return { report, duplicates };
        })
        .sort((first, second) => second.report.created_at.localeCompare(first.report.created_at));
    },
    [profile, rawReports],
  );
  const allowedReportDoctors = useMemo(
    () => doctors.filter((doctor) => doctorAllowedForReport(doctor, reportType)),
    [doctors, reportType],
  );
  const selectedReportDoctor = allowedReportDoctors.find((doctor) => doctor.id === reportDoctorId) ?? allowedReportDoctors[0];
  const activePrickGroups = useMemo(
    () => getPrickGroupsForDoctor(selectedReportDoctor?.fullName ?? "", selectedReportDoctor?.crm, includeImmunotechBattery),
    [includeImmunotechBattery, selectedReportDoctor?.crm, selectedReportDoctor?.fullName],
  );
  const canCreatePatients = profile?.role === "enfermagem" || isDoctorWithNursingAccess(profile);
  const canEditPatients = profile?.role === "enfermagem";
  const canEditReports = profile?.role === "enfermagem" || profile?.role === "medico";
  const canReturnToMedicalMenu = isDoctorWithNursingAccess(profile);

  function canEditSavedReport(report: SavedReport) {
    return profile?.role === "enfermagem" || profile?.role === "medico" && report.nurse_profile_id === profile.id;
  }

  function openPatientEditor() {
    if (!selected) return;
    setName(selected.name);
    setCpf(selected.cpf);
    setBirthDate(selected.birthDate);
    setPhone(selected.phone ?? "");
    setModal("patient-edit");
  }

  function pasteBirthDate(event: ClipboardEvent<HTMLInputElement>) {
    const normalized = normalizeBirthDate(event.clipboardData.getData("text"));
    if (!normalized) {
      setMessage("Use uma data válida no formato DD/MM/AAAA ou AAAA-MM-DD.");
      return;
    }
    event.preventDefault();
    setBirthDate(normalized);
  }

  function defaultReportDoctorId(nextType: ReportType) {
    const loggedDoctor = doctors.find((doctor) => doctor.id === profile?.id && doctorAllowedForReport(doctor, nextType));
    if (loggedDoctor) return loggedDoctor.id;
    const preferredDoctor = nextType === "prick_test"
      ? doctors.find((doctor) => (doctor.crm ?? "").replace(/\D/g, "") === "20762" || normalizePersonName(doctor.fullName).includes("sergio"))
      : doctors.find((doctor) => doctorAllowedForReport(doctor, nextType));
    return preferredDoctor?.id ?? doctors.find((doctor) => doctorAllowedForReport(doctor, nextType))?.id ?? "";
  }

  async function openPatient(patient: NursingPatient, destination: Section = "patients") {
    setSelected(patient);
    const patientReports = await loadNursingReportsForPatient(patient.id) as SavedReport[];
    setReports(patientReports.filter((report) => report.content.status !== "em_andamento" && !isDuplicateReport(report)));
    setSection(destination);
  }

  async function searchPatient() {
    if (!profile || !searchQuery.trim()) return setMessage("Informe o nome ou CPF da paciente.");
    const patient = await findNursingPatient(profile, searchQuery);
    if (!patient) return setMessage("Paciente não encontrada.");
    setPatients((current) => current.some((item) => item.id === patient.id) ? current : [patient, ...current]);
    await openPatient(patient, "patients");
    setMessage("Cadastro e histórico de exames carregados.");
  }

  async function savePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const normalizedCpf = cpf.replace(/\D/g, "");
    if (normalizedCpf.length !== 11) return setMessage("Informe um CPF com 11 números.");
    setDuplicatePatient(null);
    try {
      const duplicate = await findNursingPatientByCpf(profile, normalizedCpf);
      if (duplicate) {
        setDuplicatePatient(duplicate);
        return;
      }
      const doctorId = profile.role === "medico" ? profile.id : undefined;
      const id = await createNursingPatient(profile, { name, cpf: normalizedCpf, birthDate, phone });
      const patient: NursingPatient = { id, name, cpf: normalizedCpf, birthDate, phone, doctorId, doctorName: profile.role === "medico" ? profile.fullName : "Equipe médica CRA Care", createdAt: new Date().toISOString() };
      setPatients((current) => [patient, ...current]);
      setModal(null);
      setName(""); setCpf(""); setBirthDate(""); setPhone("");
      await openPatient(patient);
    } catch (cause) {
      if (cause instanceof Error && cause.message === "CPF_DUPLICADO") {
        const duplicate = await findNursingPatientByCpf(profile, normalizedCpf).catch(() => null);
        setDuplicatePatient(duplicate);
        return;
      }
      setMessage("Não foi possível cadastrar a paciente. Tente novamente.");
    }
  }

  function updatePrick(item: string, change: Partial<PrickResult>) {
    setPrickResults((current) => {
      const updated = { ...current, [item]: { ...(current[item] ?? emptyPrick()), ...change } };
      return Object.fromEntries(activePrickGroups.flatMap((group) => {
        const negativeControlIndex = group.items.indexOf("Controle Negativo");
        const negativeControlKey = negativeControlIndex >= 0 ? prickResultKey(group, negativeControlIndex) : "Controle Negativo";
        const negativeMm = Number(updated[negativeControlKey]?.mm || 0);
        const dermatographismActive = negativeMm > 0;
        return group.items.map((name, index) => {
          const key = prickResultKey(group, index);
          const result = { ...(updated[key] ?? emptyPrick()), dermatographism: dermatographismActive };
          const isControl = name === "Controle Positivo" || name === "Controle Negativo";
          if (!isControl && negativeMm > 0 && result.mm > 0 && result.mm <= negativeMm) {
            result.mm = 0;
            result.pseudopod = false;
          }
          result.reaction = result.pseudopod ? "++++" : reactionForMm(result.mm);
          return [key, result];
        });
      }));
    });
  }

  function openReport() {
    const nextType: ReportType = "prick_test";
    const nextDoctorId = defaultReportDoctorId(nextType);
    const nextDoctor = doctors.find((doctor) => doctor.id === nextDoctorId);
    const includeBattery = Boolean(nextDoctor && isAlessandraPrickDoctor(nextDoctor.fullName, nextDoctor.crm));
    setReportType(nextType); setReportDoctorId(nextDoctorId); setIncludeImmunotechBattery(includeBattery);
    setPrickResults(createInitialPrickResults(getPrickGroupsForDoctor(nextDoctor?.fullName ?? "", nextDoctor?.crm, includeBattery)));
    setPatchResults(createInitialPatchResults()); setEditingReportId(null); setEditingDuplicateReportIds([]); setNotes(""); setReportDate(new Date().toISOString().slice(0, 10)); setModal("report");
  }

  function changeReportType(nextType: ReportType) {
    const nextDoctorId = defaultReportDoctorId(nextType);
    const nextDoctor = doctors.find((doctor) => doctor.id === nextDoctorId);
    const includeBattery = nextType === "prick_test" && Boolean(nextDoctor && isAlessandraPrickDoctor(nextDoctor.fullName, nextDoctor.crm));
    setReportType(nextType);
    setReportDoctorId(nextDoctorId);
    setIncludeImmunotechBattery(includeBattery);
  }

  function changeReportDoctor(nextDoctorId: string) {
    const nextDoctor = doctors.find((doctor) => doctor.id === nextDoctorId);
    const includeBattery = reportType === "prick_test" && Boolean(nextDoctor && isAlessandraPrickDoctor(nextDoctor.fullName, nextDoctor.crm));
    setReportDoctorId(nextDoctorId);
    setIncludeImmunotechBattery(includeBattery);
    if (includeBattery) {
      const groups = getPrickGroupsForDoctor(nextDoctor?.fullName ?? "", nextDoctor?.crm, true);
      setPrickResults((current) => ({ ...createInitialPrickResults(groups), ...current }));
    }
  }

  async function saveReport() {
    if (!profile || !selected) return;
    if (reportSaveInFlight.current) return;
    if (!selectedReportDoctor) {
      setMessage("Selecione um médico autorizado para gerar o laudo.");
      return;
    }
    reportSaveInFlight.current = true;
    setSavingReport(true);
    const isPatchInProgress = reportType === "patch_test" && !editingReportId;
    const content = {
      status: isPatchInProgress ? "em_andamento" : "concluido",
      patientId: selected.id,
      prickResults: reportType === "prick_test" ? Object.fromEntries(activePrickGroups.flatMap((group) => group.items.map((_, index) => prickResultKey(group, index))).filter((item) => item in prickResults).map((item) => [item, prickResults[item]])) : undefined,
      prickBattery: reportType === "prick_test" && includeImmunotechBattery ? "immunotech-v1" : undefined,
      results: reportType === "patch_test" ? patchResults : undefined,
      notes,
      nurseName: profile.fullName,
      nurseCoren: profile.coren ?? "Não informado",
      examinerRole: profile.role,
      patientName: selected.name,
      patientCpf: selected.cpf,
      patientBirthDate: selected.birthDate,
      examResponsible: selectedReportDoctor.fullName,
      examResponsibleCrm: selectedReportDoctor.crm ?? "Não informado",
      examDate: reportDate,
      registeredAt: new Date().toISOString(),
    };
    try {
      if (!editingReportId && isPatchInProgress) {
        const alreadySaved = rawReports.some((report) => report.patient_id === selected.id
          && report.report_type === "patch_test"
          && report.content.status === "em_andamento"
          && !isDuplicateReport(report)
          && reportContentSignature(report.content) === reportContentSignature(content));
        if (alreadySaved) {
          setMessage("Este laudo Patch já está salvo. Continue a 2ª leitura em Exames em andamento para evitar uma cópia.");
          return;
        }
      }
      if (editingReportId && editingDuplicateReportIds.length) {
        const duplicates = rawReports.filter((report) => editingDuplicateReportIds.includes(report.id));
        await Promise.all(duplicates.map((report) => updateNursingReport(
          profile,
          report.id,
          { ...report.content, duplicateOf: editingReportId },
          report.doctor_profile_id ?? undefined,
        )));
      }
      if (editingReportId) {
        await updateNursingReport(profile, editingReportId, content, selectedReportDoctor.id);
      } else {
        await createNursingReport(profile, { patientId: selected.id, doctorId: selectedReportDoctor.id, reportType, content });
      }
      const updatedReports = await loadNursingReportsForPatient(selected.id) as SavedReport[];
      setReports(updatedReports.filter((report) => report.content.status !== "em_andamento" && !isDuplicateReport(report)));
      await reload();
      setModal(null);
      setSection("patients");
      const duplicateMessage = editingDuplicateReportIds.length
        ? ` ${editingDuplicateReportIds.length} cópia(s) idêntica(s) foram preservadas e associadas ao laudo, sem apagar dados.`
        : "";
      setMessage(isPatchInProgress ? "1ª leitura salva. O laudo permanece em andamento para a 2ª leitura." : `Laudo salvo no histórico da paciente.${duplicateMessage}`);
      setEditingDuplicateReportIds([]);
    } catch (cause) {
      setMessage(cause instanceof Error && cause.message === "PATCH_REPORT_DUPLICATE"
        ? "Este laudo Patch já está salvo. Continue a 2ª leitura em Exames em andamento para evitar uma cópia."
        : "Não foi possível salvar o laudo. Os registros existentes foram preservados; tente novamente.");
    } finally {
      reportSaveInFlight.current = false;
      setSavingReport(false);
    }
  }

  async function editReport(report: SavedReport) {
    if (!profile) return;
    if (!canEditSavedReport(report)) {
      setMessage("Este exame foi realizado por outra profissional e está disponível somente para visualização.");
      return;
    }
    const patientName = String(report.content.patientName ?? "");
    const patientCpf = String(report.content.patientCpf ?? "");
    const patient = patients.find((candidate) => candidate.id === report.patient_id) ?? await findNursingPatient(profile, patientCpf || patientName);
    if (!patient) { setMessage("Não foi possível localizar a paciente deste laudo."); return; }
    setPatients((current) => current.some((candidate) => candidate.id === patient.id) ? current : [patient, ...current]);
    setSelected(patient);
    setReportType(report.report_type);
    const savedResponsible = String(report.content.examResponsible ?? "");
    const savedDoctor = doctors.find((doctor) => normalizePersonName(doctor.fullName) === normalizePersonName(savedResponsible))
      ?? doctors.find((doctor) => doctorAllowedForReport(doctor, report.report_type));
    setReportDoctorId(savedDoctor?.id ?? "");
    setIncludeImmunotechBattery(report.content.prickBattery === "immunotech-v1");
    setPrickResults({ ...((report.content.prickResults ?? {}) as Record<string, PrickResult>) });
    setPatchResults({ ...createInitialPatchResults(), ...((report.content.results ?? {}) as Record<string, PatchResult>) });
    setNotes(String(report.content.notes ?? ""));
    setReportDate(String(report.content.examDate ?? report.created_at).slice(0, 10));
    setEditingReportId(report.id);
    setEditingDuplicateReportIds(report.report_type === "patch_test" && report.content.status === "em_andamento"
      ? rawReports.filter((candidate) => candidate.id !== report.id
        && candidate.patient_id === report.patient_id
        && candidate.report_type === "patch_test"
        && candidate.content.status === "em_andamento"
        && !isDuplicateReport(candidate)
        && String(candidate.content.examDate ?? candidate.created_at).slice(0, 10) === String(report.content.examDate ?? report.created_at).slice(0, 10)
        && reportContentSignature(candidate.content) === reportContentSignature(report.content)).map((candidate) => candidate.id)
      : []);
    setModal("report");
  }

  async function savePatientEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !selected) return;
    try {
      await updateNursingPatient(profile, selected.id, { name, cpf, birthDate, phone });
      const updated = { ...selected, name, cpf, birthDate, phone: phone || undefined };
      setSelected(updated);
      setPatients((current) => current.map((patient) => patient.id === updated.id ? updated : patient));
      setModal(null);
      setMessage("Dados da paciente atualizados.");
    } catch (cause) {
      setMessage(cause instanceof Error && cause.message === "CPF_DUPLICADO"
        ? "Este CPF já está cadastrado em outro paciente da clínica. Confira o registro antes de alterar."
        : "Não foi possível atualizar os dados da paciente.");
    }
  }

  async function removeReport(report: SavedReport) {
    if (!profile || !canEditSavedReport(report)) return;
    const type = report.report_type === "prick_test" ? "Prick" : "Patch";
    const patientName = String(report.content.patientName ?? "esta paciente");
    const reportDate = new Date(report.created_at).toLocaleDateString("pt-BR");
    if (!window.confirm(`Excluir o laudo ${type} de ${patientName}, registrado em ${reportDate}? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteNursingReport(profile, report.id);
      setReports((current) => current.filter((item) => item.id !== report.id));
      await reload();
      setMessage("Laudo excluído.");
    } catch {
      setMessage("Não foi possível excluir o laudo.");
    }
  }

  function printPrickReport(report: SavedReport, openPrintDialog = true) {
    if (report.report_type !== "prick_test") return;
    const reportPatient = selected?.id === report.patient_id ? selected : undefined;
    const patientName = reportPatient?.name ?? String(report.content.patientName ?? "Paciente");
    const patientBirthDate = formatBirthDate(reportPatient?.birthDate ?? String(report.content.patientBirthDate ?? ""));
    const savedResults = (report.content.prickResults ?? {}) as Record<string, Partial<PrickResult>>;
    const prickGroups = getPrickGroupsForDoctor(String(report.content.examResponsible ?? ""), String(report.content.examResponsibleCrm ?? ""), report.content.prickBattery === "immunotech-v1");
    const rows = prickGroups.map((group) => {
      const items = group.items.map((item, itemIndex) => {
        const number = prickGroups.slice(0, prickGroups.indexOf(group)).reduce((total, current) => total + current.items.length, 0) + itemIndex + 1;
        const result = savedResults[prickResultKey(group, itemIndex)] ?? {};
        const mm = Number(result.mm ?? 0);
        const reaction = result.pseudopod ? "++++" : result.reaction ?? reactionForMm(mm);
        return `<tr><td class="number">${number}</td><td>${escapeHtml(item)}</td><td>${mm} mm</td><td>${result.pseudopod ? "sim" : "não"}</td><td class="reaction ${reaction === "-" ? "no-reaction" : "positive-reaction"}">${reaction === "-" ? "Sem Reação" : reaction}</td><td>${result.dermatographism ? "sim" : "não"}</td></tr>`;
      }).join("");
      return `<tr class="category"><td colspan="6">${escapeHtml(group.category)}</td></tr>${items}`;
    });
    const batteries = [...new Set(prickGroups.map((group) => group.battery))].map((battery) => `<section class="battery"><h2>${escapeHtml(battery)}</h2><table><thead><tr><th></th><th>Extrato</th><th>MM</th><th>Pseudópode</th><th>Resposta Alérgica</th><th>Dermatografismo</th></tr></thead><tbody>${rows.filter((_, index) => prickGroups[index].battery === battery).join("")}</tbody></table></section>`).join("");
    const date = typeof report.content.examDate === "string" ? report.content.examDate : report.created_at;
    const formattedDate = new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
    const nurse = escapeHtml(String(report.content.nurseName ?? profile?.fullName ?? "Enfermagem"));
    const nurseCoren = escapeHtml(String(report.content.nurseCoren ?? profile?.coren ?? "Não informado"));
    const examinerIsDoctor = report.content.examinerRole === "medico";
    const responsible = escapeHtml(String(report.content.examResponsible ?? "Dr. Sérgio Fabricio Maniglia"));
    const responsibleCrm = escapeHtml(String(report.content.examResponsibleCrm ?? "20762"));
    const printable = window.open("", "_blank");
    if (!printable) { setMessage("Permita a abertura de janelas para gerar o PDF."); return; }
    printable.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Laudo Prick - ${escapeHtml(patientName)}</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#202020;margin:0;font-size:9px}.brand{display:flex;align-items:center;gap:10px;border-bottom:2px solid #a3113a;padding-bottom:7px}.brand img{height:38px;width:38px;border-radius:7px}.brand strong{font-size:16px;letter-spacing:.8px;color:#8e1535}.brand small{display:block;font-size:7px;font-weight:700;letter-spacing:.7px}.patient{margin:8px 0 10px;font-size:9px;line-height:14px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#aeb5be;border:1px solid #8e959d;padding:3px 2px;text-align:center;font-size:8px}td{border-bottom:1px solid #e3e5e8;padding:2px 3px;text-align:center;font-size:8px;line-height:10px;vertical-align:middle}td:nth-child(2){text-align:left}.number{width:5%}th:nth-child(2){width:32%}th:nth-child(n+3){width:15.75%}.category td{background:#d3d6da;text-align:left;font-weight:700;padding:3px 6px}.battery{margin-top:7px;border:1px solid #bac0c7;border-radius:3px;overflow:hidden}.battery h2{font-size:9px;margin:0;padding:4px 7px;background:#d3d6da;border-top:2px solid #687380}.reaction{font-size:10px;font-weight:700;letter-spacing:1px}.reaction.no-reaction{font-size:8px;letter-spacing:0}.legend{margin-top:10px;font-size:8px;line-height:12px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:86px;text-align:center;font-size:8px}.line{border-top:1px solid #111;padding-top:3px;margin:auto;width:170px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header class="brand"><img src="${window.location.origin}/cra-care-icon-512.png" alt="Centro de Rinite e Alergia"/><div><strong>Centro de Rinite e Alergia</strong></div></header><div class="patient">Paciente: <strong>${escapeHtml(patientName)}</strong><br/>Data de nascimento: <strong>${escapeHtml(patientBirthDate)}</strong><br/>Data: <strong>${formattedDate}</strong></div>${batteries}<div class="legend"><strong>Legenda:</strong><br/>- = Sem reação<br/>+ = Reação fraca<br/>++ = Reação moderada<br/>+++ = Reação forte<br/>++++ = Reação muito forte<br/>XXXX = Teste inválido por dermatografismo/impossibilidade técnica.</div><div class="signatures"><div><div class="line">${nurse}<br/>Enfermagem · COREN ${nurseCoren}</div></div><div><div class="line">${responsible}<br/>CRM ${responsibleCrm}</div></div></div>${openPrintDialog ? "<script>window.onload=()=>window.print()<\\/script>" : ""}</body></html>`);
    if (examinerIsDoctor) {
      const examinerSignature = printable.document.querySelector(".signatures .line");
      if (examinerSignature) examinerSignature.innerHTML = `${nurse}<br/>Médico executor · CRM ${nurseCoren}`;
    }
    const readableStyle = printable.document.createElement("style");
    readableStyle.textContent = "html{background:#3a3a3a}body{font-size:10px;width:190mm;min-height:277mm;height:auto;margin:18px auto;padding:10mm;background:#fff;box-shadow:0 4px 24px #1118}.patient{font-size:10px;line-height:15px}th{font-size:8.5px;padding:4px 3px}td{font-size:8.7px;line-height:11px;padding:3px 4px}.reaction{font-size:10.5px;font-weight:700;text-align:center;letter-spacing:1px}.reaction.no-reaction{font-size:8.5px;letter-spacing:0}.battery h2{font-size:10px;padding:5px 8px}.legend{font-size:9px;line-height:13px}.signatures{font-size:9px;margin-top:64px}@media print{html,body{background:white}body{padding:0;width:auto;min-height:0;margin:0;box-shadow:none}}";
    printable.document.head.append(readableStyle);
    printable.document.close();
    if (openPrintDialog) {
      printable.focus();
      window.setTimeout(() => printable.print(), 250);
    }
  }

  function printPatchReport(report: SavedReport, openPrintDialog = true) {
    if (report.report_type !== "patch_test") return;
    const patientName = selected?.id === report.patient_id ? selected.name : String(report.content.patientName ?? "Paciente");
    const patientBirthDate = formatBirthDate(selected?.id === report.patient_id ? selected.birthDate : String(report.content.patientBirthDate ?? ""));
    const date = typeof report.content.examDate === "string" ? report.content.examDate : report.created_at;
    const formattedDate = new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
    const responsible = escapeHtml(String(report.content.examResponsible ?? "Responsável não informado"));
    const responsibleCrm = escapeHtml(String(report.content.examResponsibleCrm ?? "Não informado"));
    const examinerIsDoctor = report.content.examinerRole === "medico";
    const savedResults = (report.content.results ?? {}) as Record<string, unknown>;
    const positiveItems = Object.entries(savedResults).filter(([, value]) => ["+", "++", "+++"].includes(patchResultText(value)));
    const rows = patchBatteries.map((battery) => `<section class="battery"><h2>${escapeHtml(battery.name)}</h2><table><thead><tr><th>Substância</th><th>1ª leitura · 48h</th><th>2ª leitura · 48h</th><th>Resultado</th></tr></thead><tbody>${battery.items.map((item) => { const result = savedResults[item] as Partial<PatchResult> | undefined; return `<tr><td>${escapeHtml(item)}</td><td>${escapeHtml(result?.firstReading || "—")}</td><td>${escapeHtml(result?.secondReading || "—")}</td><td><strong>${escapeHtml(patchResultText(result))}</strong></td></tr>`; }).join("")}</tbody></table></section>`).join("");
    const detailed = positiveItems.length ? `<section class="details"><h2>Substâncias com reação</h2>${positiveItems.map(([item, result]) => { const detail = patchSubstanceDetails[patchSubstanceCode(item)]; const fields = detail ? [["O que é", detail.what], ["Descrição", detail.description], ["Onde é encontrada", detail.where], ["Também pode ser encontrada como", detail.aliases], ["Reação cruzada", detail.crossReaction], ["Observações", detail.observations]].filter(([, value]) => value && value !== "-").map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("") : ""; return `<article><h3>${escapeHtml(item)} — ${escapeHtml(patchResultText(result))}</h3><p><strong>Leituras:</strong> ${escapeHtml(patchResultDetails(result))}</p>${fields}</article>`; }).join("")}</section>` : "";
    const printable = window.open("", "_blank");
    if (!printable) { setMessage("Permita a abertura de janelas para gerar o PDF."); return; }
    printable.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Laudo Patch - ${escapeHtml(patientName)}</title><style>@page{size:A4 portrait;margin:11mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1e1b1c;margin:0;font-size:10px}.brand{display:flex;align-items:center;gap:10px;border-bottom:2px solid #a3113a;padding-bottom:9px}.brand img{height:36px;width:36px;border-radius:7px}.brand strong{font-size:17px;letter-spacing:1px;color:#8e1535}.brand small{display:block;font-size:7px;font-weight:700;letter-spacing:1px}.patient{margin:10px 0 12px;line-height:16px}.battery{margin-top:8px;border:1px solid #bac0c7;border-radius:3px;overflow:hidden}.battery h2,.details h2{margin:0;padding:5px 9px;background:#d3d6da;border-top:2px solid #687380;font-size:10px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#aeb5be;border:1px solid #8e959d;padding:4px;text-align:left;font-size:8px}td{border-bottom:1px solid #e3e5e8;padding:3px 4px;font-size:8px}th:nth-child(n+2),td:nth-child(n+2){text-align:center;width:18%}.details{margin-top:14px}.details article{border-bottom:1px solid #ddd;padding:7px 2px}.details h3{margin:0 0 4px;font-size:10px;color:#8e1535}.details p{margin:0;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header class="brand"><img src="${window.location.origin}/cra-care-icon-512.png" alt="CRA Care"/><div><strong>CRA CARE</strong><small>CENTRO DE RINITE E ALERGIA</small></div></header><div class="patient">Paciente: <strong>${escapeHtml(patientName)}</strong><br/>Data: <strong>${formattedDate}</strong><br/>Responsabilidade médica: <strong>${responsible} · CRM ${responsibleCrm}</strong><br/>Enfermagem: <strong>${escapeHtml(String(report.content.nurseName ?? "Enfermagem"))} · COREN ${escapeHtml(String(report.content.nurseCoren ?? profile?.coren ?? "Não informado"))}</strong></div>${rows}${detailed}${typeof report.content.notes === "string" && report.content.notes ? `<section class="details"><h2>Observações</h2><article>${escapeHtml(report.content.notes)}</article></section>` : ""}${openPrintDialog ? "<script>window.onload=()=>window.print()<\\/script>" : ""}</body></html>`);
    if (examinerIsDoctor) {
      const patientDetails = printable.document.querySelector(".patient");
      if (patientDetails) patientDetails.innerHTML = patientDetails.innerHTML.replace("Enfermagem:", "Médico executor:").replace("· COREN", "· CRM");
    }
    const printedBrand = printable.document.querySelector(".brand div");
    if (printedBrand) printedBrand.textContent = "Centro de Rinite e Alergia";
    const printedPatient = printable.document.querySelector(".patient");
    if (printedPatient) printedPatient.innerHTML = printedPatient.innerHTML.replace("<br>Data:", `<br>Data de nascimento: <strong>${escapeHtml(patientBirthDate)}</strong><br>Data:`);
    const printedPatchBrand = printable.document.querySelector(".brand");
    const patchPatientInfo = printable.document.querySelector(".patient");
    const batterySections = Array.from(printable.document.querySelectorAll(".battery"));
    const detailSections = Array.from(printable.document.querySelectorAll(".details"));
    if (printedPatchBrand && patchPatientInfo && batterySections.length === patchBatteries.length) {
      const firstPage = printable.document.createElement("section");
      const secondPage = printable.document.createElement("section");
      firstPage.className = "print-page";
      secondPage.className = "print-page";
      firstPage.append(printedPatchBrand.cloneNode(true), patchPatientInfo.cloneNode(true));
      secondPage.append(printedPatchBrand.cloneNode(true), patchPatientInfo.cloneNode(true));
      batterySections.slice(0, 2).forEach((battery) => firstPage.append(battery));
      batterySections.slice(2).forEach((battery) => secondPage.append(battery));
      detailSections.forEach((details) => secondPage.append(details));
      for (const page of [firstPage, secondPage]) {
        const signatures = printable.document.createElement("div");
        const signatureLine = printable.document.createElement("div");
        signatures.className = "signatures";
        signatureLine.className = "line";
        signatureLine.innerHTML = `${responsible}<br/>CRM ${responsibleCrm}`;
        signatures.append(signatureLine);
        page.append(signatures);
      }
      printable.document.body.replaceChildren(firstPage, secondPage);
    }
    const readableStyle = printable.document.createElement("style");
    readableStyle.textContent = "html{background:#3a3a3a}body{font-size:10.5px;width:210mm;margin:18px auto;background:#fff;box-shadow:0 4px 24px #1118}.print-page{display:flex;flex-direction:column;width:210mm;min-height:297mm;margin:0 auto 18px;padding:11mm;background:#fff;box-shadow:0 4px 24px #1118;break-after:page;page-break-after:always}.print-page:last-child{break-after:auto;page-break-after:auto}.patient{font-size:10.5px;line-height:17px}th{font-size:9px;padding:6px}td{font-size:11px;line-height:14px;padding:8px 7px}.battery h2,.details h2{font-size:10.5px;padding:7px 9px}.details h3{font-size:11px}.details p{font-size:9.5px;line-height:13px}.details article{margin:8px 0;padding:10px;border:1px solid #e2d8d5;border-radius:8px;background:#fffafa;break-inside:avoid}.details article p:first-of-type{margin-bottom:14px}.signatures{margin-top:auto;padding-top:16mm;text-align:center;font-size:9px}.line{border-top:1px solid #111;padding-top:3px;margin:auto;width:170px}@media print{html,body{background:white}body{padding:0;width:auto;min-height:0;margin:0;box-shadow:none}.print-page{width:auto;height:275mm;min-height:0;margin:0;padding:0;box-shadow:none;break-after:page;page-break-after:always}.print-page:last-child{break-after:auto;page-break-after:auto}}";
    printable.document.head.append(readableStyle);
    printable.document.close();
    if (openPrintDialog) {
      printable.focus();
      window.setTimeout(() => printable.print(), 250);
    }
  }

  function reportActions(report: SavedReport) {
    const editable = canEditSavedReport(report);
    const label = report.report_type === "prick_test" ? "Prick" : "Patch";
    return <span className="flex flex-wrap gap-2">
      <button type="button" onClick={() => report.report_type === "prick_test" ? printPrickReport(report, false) : printPatchReport(report, false)} className="rounded-lg border border-[#d8cbc7] bg-white px-3 py-2 text-xs font-bold text-[#a3113a]">Visualizar</button>
      {editable && <button type="button" onClick={() => void editReport(report)} className="rounded-lg border border-[#d8cbc7] bg-white px-3 py-2 text-xs font-bold text-[#a3113a]">Editar</button>}
      <button type="button" onClick={() => report.report_type === "prick_test" ? printPrickReport(report) : printPatchReport(report)} className="rounded-lg bg-[#a3113a] px-3 py-2 text-xs font-bold text-white">Gerar PDF / Imprimir</button>
      {editable && <button type="button" onClick={() => void removeReport(report)} className="rounded-lg bg-[#fff1f3] px-3 py-2 text-xs font-bold text-[#a3113a]">Excluir laudo {label}</button>}
    </span>;
  }

  return <main data-exams-area className="min-h-screen bg-[#f8f5f2] text-[#34292d]"><div className="min-h-screen lg:pl-[270px]">
    <aside className="bg-gradient-to-b from-[#b31340] to-[#790b2a] p-7 text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-[270px] lg:overflow-y-auto"><Image src="/logo-cra-branca.png" alt="CRA" width={160} height={100} priority/><p className="mt-4 text-sm text-white/70">Painel de Exames</p><nav className="mt-8 space-y-2"><button onClick={() => setSection("patients")} className={`w-full rounded-xl p-3 text-left ${section === "patients" ? "bg-white/20 font-bold" : ""}`}>Pacientes</button><button onClick={() => setSection("reports")} className={`w-full rounded-xl p-3 text-left ${section === "reports" ? "bg-white/20 font-bold" : ""}`}>Exames</button><button onClick={() => setSection("in-progress")} className={`w-full rounded-xl p-3 text-left ${section === "in-progress" ? "bg-white/20 font-bold" : ""}`}>Exames em andamento{inProgressReports.length ? ` (${inProgressReports.length})` : ""}</button>{canReturnToMedicalMenu && <Link href="/medico" className="block rounded-xl border border-white/30 bg-white/10 p-3 font-semibold hover:bg-white/20">Voltar ao menu médico</Link>}<Link href="/sair" className="block rounded-xl p-3">Sair</Link></nav></aside>
    <section className="p-6 lg:p-10"><header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#a3113a]">Área clínica</p><h1 className="mt-2 text-3xl font-bold">{section === "patients" ? "Pacientes" : section === "in-progress" ? "Exames em andamento" : "Exames"}</h1></div>{((section === "patients" && canCreatePatients) || (section === "reports" && canEditReports)) && <button onClick={() => section === "patients" ? setModal("patient") : openReport()} className="rounded-xl bg-[#a3113a] px-5 py-3 font-bold text-white">{section === "patients" ? "+ Cadastrar paciente" : "+ Novo exame"}</button>}</header>
      {message && <p className="mt-5 rounded-xl bg-[#edf8f3] p-4 text-sm">{message}</p>}
      {section === "patients" && <p className="mt-4 text-sm text-[#817578]">Você pode localizar a paciente pelo nome ou pelo CPF.</p>}
      {section === "reports" && <div className="mt-6 rounded-2xl bg-white p-4"><input value={reportSearchQuery} onChange={(event) => setReportSearchQuery(event.target.value)} placeholder="Pesquisar laudo pelo nome ou CPF do paciente" className="w-full rounded-xl border p-3" /></div>}
      {section === "in-progress" && <section className="mt-6 rounded-2xl border border-[#f1d5dc] bg-[#fff8fa] p-5"><p className="text-sm text-[#817578]">Laudos Patch aguardando a 2ª leitura.</p>{inProgressReports.length === 0 ? <p className="mt-5 rounded-xl bg-white p-4 text-sm text-[#817578]">Nenhum laudo em andamento no momento.</p> : <div className="mt-4 space-y-3">{inProgressReports.map(({ report, duplicates }) => <article key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4"><div><strong>{String(report.content.patientName ?? "Paciente")}</strong><p className="mt-1 text-sm text-[#817578]">1ª leitura: {new Date(String(report.content.examDate ?? report.created_at)).toLocaleDateString("pt-BR")}</p>{duplicates.length > 0 && <p className="mt-2 rounded-lg bg-[#fff4e5] px-3 py-2 text-xs font-medium text-[#805313]">{duplicates.length} cópia(s) idêntica(s) detectada(s). Nenhum registro será apagado; ao concluir a leitura, as cópias ficarão associadas a este laudo.</p>}</div>{canEditReports ? <button type="button" onClick={() => void editReport(report)} className="rounded-xl bg-[#a3113a] px-4 py-2 text-sm font-bold text-white">Continuar 2ª leitura</button> : <span className="text-xs font-semibold text-[#817578]">Aguardando a Enfermagem</span>}</article>)}</div>}</section>}
      {section === "patients" ? <>
        <div className="mt-7 flex gap-2 rounded-2xl bg-white p-4"><input value={searchCpf} onChange={(e) => setSearchCpf(e.target.value)} placeholder="Pesquisar paciente pelo nome ou CPF" className="flex-1 rounded-xl border p-3"/><button onClick={() => void searchPatient()} className="rounded-xl border px-5 font-bold text-[#a3113a]">Buscar</button></div>
        {selected && <article className="mt-5 rounded-3xl border border-[#eadfd9] bg-white p-6">
          <h2 className="text-xl font-bold">{selected.name}</h2>
          <p className="mt-1 text-sm text-[#817578]">CPF {selected.cpf} · Nascimento {formatBirthDate(selected.birthDate)}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><strong>Histórico de laudos ({reportCount})</strong><div className="flex flex-wrap gap-2">{canEditReports && <button onClick={openReport} className="rounded-xl bg-[#a3113a] px-4 py-2 text-sm font-bold text-white">+ Novo laudo</button>}{canEditPatients && <button type="button" onClick={openPatientEditor} className="rounded-xl border border-[#d8cbc7] bg-white px-4 py-2 text-sm font-bold text-[#a3113a]">Editar dados da paciente</button>}</div></div>
          {reports.map((report) => <article key={report.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fbf5f2] p-4 text-sm"><span><strong>{report.report_type === "prick_test" ? "Prick Test" : "Patch Test"}</strong> · {new Date(report.created_at).toLocaleDateString("pt-BR")}</span>{reportActions(report)}</article>)}
        </article>}
        <div className="mt-5 space-y-3">{patients.map((patient) => <button key={patient.id} onClick={() => void openPatient(patient)} className="block w-full rounded-2xl bg-white p-5 text-left shadow-sm"><strong>{patient.name}</strong><span className="ml-3 text-sm text-[#817578]">CPF {patient.cpf}</span></button>)}</div>
      </> : section === "reports" ? <>
        <div className="mt-7 flex flex-wrap gap-3"><select value={reportPatientFilter} onChange={(event) => setReportPatientFilter(event.target.value)} className="rounded-xl border p-3"><option value="">Todos os pacientes</option>{[...new Set(allReports.map((report) => String(report.content.patientName ?? "Paciente")))].sort().map((patientName) => <option key={patientName} value={patientName}>{patientName}</option>)}</select><input type="date" value={reportDateFilter} onChange={(event) => setReportDateFilter(event.target.value)} aria-label="Filtrar pela data do laudo" className="rounded-xl border p-3" /></div>
        <div className="mt-5"><h2 className="text-xl font-bold">Histórico de laudos</h2><p className="mt-1 text-sm text-[#817578]">Todos os laudos preenchidos pela equipe permanecem disponíveis aqui.</p><div className="mt-4 space-y-3">{allReports.map((report) => <article key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5"><div><strong>{report.report_type === "prick_test" ? "Laudo Prick" : "Laudo Patch"}</strong><p className="mt-1 text-sm font-medium text-[#544449]">{String(report.content.patientName ?? "Paciente")}</p><p className="text-sm text-[#817578]">{new Date(report.created_at).toLocaleDateString("pt-BR")}</p></div>{reportActions(report)}</article>)}</div></div>
      </> : null}
    </section>
  </div>
  {canCreatePatients && modal === "patient" && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><form onSubmit={savePatient} className="w-full max-w-lg rounded-3xl bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">Cadastrar paciente</h2><button type="button" onClick={() => setModal(null)}>Fechar</button></div><div className="mt-5 grid gap-3"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" className="rounded-xl border p-3"/><input required inputMode="numeric" maxLength={14} value={cpf} onChange={(e) => { setCpf(formatCpf(e.target.value)); setDuplicatePatient(null); }} placeholder="000.000.000-00" className="rounded-xl border p-3"/><label className="text-sm font-medium text-[#544449]">Data de nascimento<input required type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} onPaste={pasteBirthDate} className="mt-1 w-full rounded-xl border p-3"/><span className="mt-1 block text-xs text-[#817578]">Você pode selecionar ou colar DD/MM/AAAA.</span></label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" className="rounded-xl border p-3"/></div>{duplicatePatient && <div className="mt-4 rounded-xl border border-[#f0c5ce] bg-[#fff1f3] p-4 text-sm text-[#8f1235]"><strong>CPF já cadastrado.</strong><p className="mt-1">Encontramos {duplicatePatient.name} · CPF {duplicatePatient.cpf}. Não criamos outro registro.</p><button type="button" onClick={() => { const existing = duplicatePatient; setDuplicatePatient(null); setModal(null); void openPatient(existing); }} className="mt-3 rounded-lg bg-[#a3113a] px-3 py-2 font-semibold text-white">Abrir paciente existente</button></div>}<p className="mt-4 rounded-xl bg-[#fbf5f2] p-3 text-sm text-[#66595d]">A paciente ficará disponível para consulta por toda a equipe médica. O médico que assumir o acompanhamento será vinculado ao tratamento.</p><button className="mt-5 w-full rounded-xl bg-[#a3113a] p-3 font-bold text-white">Salvar paciente</button></form></div>}
  {canEditPatients && modal === "patient-edit" && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><form onSubmit={savePatientEdit} className="w-full max-w-lg rounded-3xl bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">Editar dados da paciente</h2><button type="button" onClick={() => setModal(null)}>Fechar</button></div><div className="mt-5 grid gap-3"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" className="rounded-xl border p-3"/><input required inputMode="numeric" maxLength={14} value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="CPF" className="rounded-xl border p-3"/><label className="text-sm font-medium text-[#544449]">Data de nascimento<input required type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} onPaste={pasteBirthDate} className="mt-1 w-full rounded-xl border p-3"/><span className="mt-1 block text-xs text-[#817578]">Você pode selecionar ou colar DD/MM/AAAA.</span></label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" className="rounded-xl border p-3"/></div><button className="mt-5 w-full rounded-xl bg-[#a3113a] p-3 font-bold text-white">Salvar alterações</button></form></div>}
  {canEditReports && modal === "report" && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4"><section className="mx-auto my-5 max-w-6xl rounded-3xl bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">Preencher laudo</h2><p className="mt-1 text-sm text-[#817578]">Paciente: {selected?.name ?? "Selecione uma paciente antes de criar o laudo"}</p></div><button onClick={() => setModal(null)} className="rounded-xl border px-4 py-2 font-semibold">Fechar laudo</button></div><div className="mt-5 grid gap-3 md:grid-cols-[1fr_210px]"><label className="text-sm font-semibold text-[#544449]">Paciente<input readOnly value={selected?.name ?? ""} className="mt-1 w-full rounded-xl border border-[#ddd5d0] bg-[#faf8f6] p-3 font-normal"/></label><label className="text-sm font-semibold text-[#544449]">Data<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="mt-1 w-full rounded-xl border border-[#ddd5d0] p-3 font-normal"/></label></div><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold text-[#544449]">Tipo de laudo<select value={reportType} onChange={(event) => changeReportType(event.target.value as ReportType)} className="mt-1 w-full rounded-xl border p-3 font-normal"><option value="prick_test">Laudo Prick</option><option value="patch_test">Laudo Patch</option></select></label><label className="text-sm font-semibold text-[#544449]">Médico responsável<select value={selectedReportDoctor?.id ?? ""} onChange={(event) => changeReportDoctor(event.target.value)} disabled={profile?.role === "medico" || allowedReportDoctors.length <= 1} className="mt-1 w-full rounded-xl border p-3 font-normal disabled:bg-[#f7f4f2]"><option value="">Selecione o médico</option>{allowedReportDoctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName}{doctor.crm ? ` · CRM ${doctor.crm}` : ""}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#817578]">{profile?.role === "medico" ? "O laudo será registrado no seu perfil médico." : reportType === "prick_test" ? "Prick: Dr. Sérgio, Dra. Alessandra ou Dra. Patrícia Martinski." : "Patch: Dra. Alessandra ou Dra. Patrícia Martinski."}</span>{reportType === "prick_test" && includeImmunotechBattery && <span className="mt-1 block text-xs font-semibold text-[#187157]">Bateria Immunotech incluída para a Dra. Alessandra.</span>}</label></div>
    {reportType === "prick_test" ? <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="sr-only"><tr><th>Item</th><th>Medida</th><th>Observações</th><th>Resultado</th></tr></thead><tbody>{activePrickGroups.map((group, groupIndex) => <MemoGroup key={`${group.battery}-${group.category}`} group={group} allGroups={activePrickGroups} showBattery={groupIndex === 0 || activePrickGroups[groupIndex - 1].battery !== group.battery} values={prickResults} update={updatePrick}/>)}</tbody></table></div> : <div className="mt-6 space-y-5">{patchBatteries.map((battery) => <section key={battery.name} className="overflow-hidden rounded-xl border"><h3 className="bg-[#d4d8dd] px-4 py-2 text-sm font-bold">{battery.name}</h3>{battery.items.map((item) => { const result = patchResults[item] ?? { firstReading: "", secondReading: "" }; return <div key={item} className="grid gap-3 border-t p-3 text-sm sm:grid-cols-[1fr_180px_180px]"><span>{item}</span><label>1ª leitura · 48h<select value={result.firstReading} onChange={(event) => setPatchResults((current) => ({ ...current, [item]: { ...result, firstReading: event.target.value as PatchResult["firstReading"] } }))} className="mt-1 w-full rounded-lg border p-2"><option value="">Não informado</option><option>-</option><option>?</option><option>+</option><option>++</option><option>+++</option></select></label><label>2ª leitura · 48h<select value={result.secondReading} onChange={(event) => setPatchResults((current) => ({ ...current, [item]: { ...result, secondReading: event.target.value as PatchResult["secondReading"] } }))} className="mt-1 w-full rounded-lg border p-2"><option value="">Não informado</option><option>-</option><option>?</option><option>+</option><option>++</option><option>+++</option></select></label></div>; })}</section>)}</div>}
    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações clínicas" className="mt-6 min-h-24 w-full rounded-xl border p-3"/><button disabled={!selected || savingReport} onClick={() => void saveReport()} className="mt-5 w-full rounded-xl bg-[#a3113a] p-3 font-bold text-white disabled:cursor-wait disabled:opacity-50">{savingReport ? "Salvando laudo…" : "Salvar laudo"}</button></section></div>}
  </main>;
}

function MemoGroup({ group, allGroups, showBattery, values, update }: { group: { battery: string; category: string; items: string[]; resultKeys?: string[] }; allGroups: { battery: string; category: string; items: string[]; resultKeys?: string[] }[]; showBattery: boolean; values: Record<string, PrickResult>; update: (item: string, change: Partial<PrickResult>) => void }) {
  const groupIndex = allGroups.indexOf(group);
  const firstNumber = allGroups.slice(0, groupIndex).reduce((total, current) => total + current.items.length, 0) + 1;

  return <>
    {showBattery && <tr><td colSpan={5} className="border-t-4 border-[#596573] bg-[#d4d8dd] px-4 py-1.5 text-xs font-bold text-[#29323b]">{group.battery}</td></tr>}
    <tr><td colSpan={5} className="bg-[#aeb5bd] px-4 py-1 text-xs font-semibold text-[#26303a]">{group.category}</td></tr>
    {group.items.map((item, itemIndex) => {
      const key = prickResultKey(group, itemIndex);
      const value = values[key] ?? emptyPrick();
      const reaction = value.pseudopod ? "++++" : value.reaction ?? reactionForMm(value.mm);
      return <tr key={item} className="border-b border-[#d9dde0] bg-white text-xs text-[#2f3840]">
        <td className="w-[48%] px-3 py-2"><div className="grid grid-cols-[36px_1fr] items-center gap-3"><span className="text-center font-medium">{firstNumber + itemIndex}</span><span className="text-center">{item}</span></div></td>
        <td className="w-[20%] px-3 py-2"><div className="flex items-center justify-center gap-2"><button aria-label={`Aumentar medida de ${item}`} type="button" onClick={() => update(key, { mm: value.mm + 1 })} className="grid h-9 w-9 place-items-center rounded-lg text-xl font-bold leading-none text-[#159568]">⊕</button><span className="min-w-12 text-center font-medium">{value.mm} mm</span><button aria-label={`Diminuir medida de ${item}`} type="button" onClick={() => update(key, { mm: Math.max(0, value.mm - 1) })} className="grid h-9 w-9 place-items-center rounded-lg text-xl font-bold leading-none text-[#4d5965]">⊖</button><button aria-label={`Zerar medida de ${item}`} type="button" onClick={() => update(key, { mm: 0 })} className="grid h-9 w-9 place-items-center rounded-lg text-xl font-bold leading-none text-[#c52743]">⊗</button></div></td>
        <td className="w-[18%] px-3 py-2"><label className="flex items-center gap-1.5"><input type="checkbox" checked={value.pseudopod} onChange={(event) => update(key, { pseudopod: event.target.checked })}/><span>Pseudópode</span></label><label className="mt-1 flex items-center gap-1.5"><input type="checkbox" checked={value.dermatographism} onChange={(event) => update(key, { dermatographism: event.target.checked })}/><span>Dermatografismo</span></label></td>
        <td colSpan={2} className={`w-[14%] px-3 py-2 text-center font-bold ${reaction === "-" ? "text-sm tracking-normal text-[#4e5961]" : "text-base tracking-[.12em] text-[#a3113a]"}`}>{reaction === "-" ? "Sem Reação" : reaction}</td>
      </tr>;
    })}
  </>;
}
