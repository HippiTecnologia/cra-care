"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createNursingPatient,
  createNursingReport,
  findNursingPatient,
  loadNursingReportsForPatient,
  loadNursingWorkspace,
  type NursingPatient,
  type NursingProfile,
} from "../../lib/supabase/nursing-records";
import { patchSubstanceCode, patchSubstanceDetails } from "../../lib/patch-substances";

type Section = "patients" | "reports";
type ReportType = "prick_test" | "patch_test";
type Modal = "patient" | "report" | null;
type PrickResult = { mm: number; reaction: "-" | "+" | "++" | "+++" | "++++"; pseudopod: boolean; dermatographism: boolean };
type PatchResult = { firstReading: "" | "-" | "?" | "+" | "++" | "+++"; secondReading: "" | "-" | "?" | "+" | "++" | "+++" };
type SavedReport = { id: string; patient_id: string; report_type: ReportType; content: Record<string, unknown>; created_at: string };

const prickGroups = [
  { battery: "BATERIA A", category: "Controles", items: ["Controle Positivo", "Controle Negativo"] },
  { battery: "BATERIA A", category: "Ácaros", items: ["Blomia tropicalis", "Dermatophagoides farinae", "Dermatophagoides pteronyssinus"] },
  { battery: "BATERIA A", category: "Fungos", items: ["Fungos II: Alternaria, Cladosporium, Aspergillus, Penicillium"] },
  { battery: "BATERIA A", category: "Pólens", items: ["Gramíneas mix: Dactylis glomerata, Festuca pratensis, Lolium multiflorum, Phleum pratense, Poa pratensis"] },
  { battery: "BATERIA A", category: "Outros", items: ["Látex"] },
  { battery: "BATERIA A", category: "Epitélios", items: ["Epitélio de cão", "Epitélio de gato"] },
  { battery: "BATERIA B", category: "Insetos", items: ["Barata Mix", "Mosquito Mix"] },
  { battery: "BATERIA B", category: "Alimentos", items: ["Leite de vaca", "Ovo de galinha", "Trigo", "Crustáceos (mix): lagosta, ostra, siri, marisco", "Amendoim"] },
];
const patchBatteries = [
  { name: "Bateria Padrão 1", items: ["P-01 · Antraquinona · 2,0%", "P-02 · Bálsamo do Peru · 25,0%", "P-03 · PPD Mix · 0,4%", "P-04 · Hidroquinona · 1,0%", "P-05 · Bicromato de Potássio · 0,5%", "P-06 · Propilenoglicol · 10,0%", "P-07 · Butilfenol-para-terciário · 1,0%", "P-08 · Neomicina, Sulfato · 20,0%", "P-09 · Irgasan · 1,0%", "P-10 · Kathon CG · 0,5%"] },
  { name: "Bateria Padrão 2", items: ["P-11 · Cloreto de Cobalto · 1,0%", "P-12 · Lanolina · 30,0%", "P-13 · Tiuram Mix · 1,0%", "P-14 · Etilenodiamina · 1,0%", "P-15 · Perfume Mix · 7,0%", "P-16 · Mercapto Mix · 2,0%", "P-17 · Benzocaína · 5,0%", "P-18 · Quartenium 15 · 6,0%", "P-19 · Quinolina Mix · 6,0%", "P-20 · Nitrofurazona · 1,0%"] },
  { name: "Bateria Padrão 3", items: ["P-21 · Paraben Mix · 15,0%", "P-22 · Resina Epóxi · 1,0%", "P-23 · Timerosal · 0,1%", "P-24 · Terebentina · 10,0%", "P-25 · Carba Mix · 3,0%", "P-26 · Prometazina · 1,0%", "P-27 · Sulfato de Níquel · 5,0%", "P-28 · Colofônia · 20,0%", "P-29 · Parafenilenodiamina · 1,0%", "P-30 · Formaldeído · 1,0%"] },
  { name: "Bateria Cosméticos 1", items: ["C-01 · Germall 115 · 2,0%", "C-02 · BHT · 2,0%", "C-03 · Resina Tosilamida/Formaldeído · 10,0%", "C-04 · Trietanolamina · 2,5%", "C-05 · Bronopol · 0,5%", "C-06 · Cloracetamida · 0,2%", "C-07 · Ácido Sórbico · 2,0%", "C-08 · Tioglicolato de Amônio · 2,5%", "C-09 · Amerchol L 101 · 100,0%", "C-10 · Clorexidina · 0,5%", "C-11 · Dietanolamida de Ácido Graxo de Coco · 0,5%"] },
];
const emptyPrick = (): PrickResult => ({ mm: 0, reaction: "-", pseudopod: false, dermatographism: false });
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
  const [patients, setPatients] = useState<NursingPatient[]>([]);
  const [selected, setSelected] = useState<NursingPatient | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [allReports, setAllReports] = useState<SavedReport[]>([]);
  const [reportPatientFilter, setReportPatientFilter] = useState("");
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
  const [reportType, setReportType] = useState<ReportType>("prick_test");
  const [patchResponsible, setPatchResponsible] = useState("Patricia Martinski");
  const [prickResults, setPrickResults] = useState<Record<string, PrickResult>>({});
  const [patchResults, setPatchResults] = useState<Record<string, PatchResult>>({});
  const [notes, setNotes] = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));

  async function reload() {
    const workspace = await loadNursingWorkspace();
    setProfile(workspace.profile);
    setPatients(workspace.patients);
    setAllReports(workspace.reports as SavedReport[]);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload().catch(() => setMessage("Não foi possível carregar a área de Enfermagem.")); }, []);

  const reportCount = useMemo(() => reports.length, [reports]);

  async function openPatient(patient: NursingPatient, destination: Section = "patients") {
    setSelected(patient);
    setReports(await loadNursingReportsForPatient(patient.id) as SavedReport[]);
    setSection(destination);
  }

  async function searchPatient() {
    if (!profile || !searchQuery.trim()) return setMessage("Informe o nome ou CPF da paciente.");
    const patient = await findNursingPatient(profile, searchQuery);
    if (!patient) return setMessage("Paciente não encontrada.");
    setPatients((current) => current.some((item) => item.id === patient.id) ? current : [patient, ...current]);
    await openPatient(patient, "patients");
    setMessage("Cadastro e histórico de laudos carregados.");
  }

  async function savePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const id = await createNursingPatient(profile, { name, cpf, birthDate, phone });
    const patient: NursingPatient = { id, name, cpf, birthDate, phone, doctorName: "Não vinculado", createdAt: new Date().toISOString() };
    setPatients((current) => [patient, ...current]);
    setModal(null);
    setName(""); setCpf(""); setBirthDate(""); setPhone("");
    await openPatient(patient);
  }

  function updatePrick(item: string, change: Partial<PrickResult>) {
    setPrickResults((current) => {
      const next = { ...(current[item] ?? emptyPrick()), ...change };
      next.reaction = reactionForMm(next.mm);
      return { ...current, [item]: next };
    });
  }

  function openReport() {
    setReportType("prick_test"); setPrickResults({}); setPatchResults({}); setNotes(""); setReportDate(new Date().toISOString().slice(0, 10)); setModal("report");
  }

  async function saveReport() {
    if (!profile || !selected) return;
    await createNursingReport(profile, {
      patientId: selected.id,
      doctorId: selected.doctorId,
      reportType,
      content: {
        prickResults: reportType === "prick_test" ? prickResults : undefined,
        results: reportType === "patch_test" ? patchResults : undefined,
        notes,
        nurseName: profile.fullName,
        patientName: selected.name,
        patientCpf: selected.cpf,
        examResponsible: reportType === "prick_test" ? "Dr. Sergio Fabricio Maniglia" : patchResponsible,
        examDate: reportDate,
        registeredAt: new Date().toISOString(),
      },
    });
    const updatedReports = await loadNursingReportsForPatient(selected.id) as SavedReport[];
    setReports(updatedReports);
    await reload();
    setModal(null);
    setSection("patients");
    setMessage("Laudo salvo no histórico da paciente.");
  }

  function printPrickReport(report: SavedReport, openPrintDialog = true) {
    if (report.report_type !== "prick_test") return;
    const reportPatient = selected?.id === report.patient_id ? selected : undefined;
    const patientName = reportPatient?.name ?? String(report.content.patientName ?? "Paciente");
    const savedResults = (report.content.prickResults ?? {}) as Record<string, Partial<PrickResult>>;
    const rows = prickGroups.map((group) => {
      const items = group.items.map((item, itemIndex) => {
        const number = prickGroups.slice(0, prickGroups.indexOf(group)).reduce((total, current) => total + current.items.length, 0) + itemIndex + 1;
        const result = savedResults[item] ?? {};
        const mm = Number(result.mm ?? 0);
        return `<tr><td class="number">${number}</td><td>${escapeHtml(item)}</td><td>${mm} mm</td><td>${result.pseudopod ? "sim" : "não"}</td><td>${reactionForMm(mm) === "-" ? "Sem Reação" : reactionForMm(mm)}</td><td>${result.dermatographism ? "sim" : "não"}</td></tr>`;
      }).join("");
      return `<tr class="category"><td colspan="6">${escapeHtml(group.category)}</td></tr>${items}`;
    });
    const batteries = ["BATERIA A", "BATERIA B"].map((battery) => `<section class="battery"><h2>${battery}</h2><table><thead><tr><th></th><th>Extrato</th><th>MM</th><th>Pseudópode</th><th>Resposta Alérgica</th><th>Dermatografismo</th></tr></thead><tbody>${rows.filter((_, index) => prickGroups[index].battery === battery).join("")}</tbody></table></section>`).join("");
    const date = typeof report.content.examDate === "string" ? report.content.examDate : report.created_at;
    const formattedDate = new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
    const nurse = escapeHtml(String(report.content.nurseName ?? profile?.fullName ?? "Enfermagem"));
    const printable = window.open("", "_blank");
    if (!printable) { setMessage("Permita a abertura de janelas para gerar o PDF."); return; }
    printable.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Laudo Prick - ${escapeHtml(patientName)}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10px}.logo{display:inline-block;border-left:6px solid #a71437;padding-left:8px;font-weight:800;font-size:18px;line-height:15px;color:#7d2435}.logo small{display:block;font-size:7px;letter-spacing:1px;color:#333}.patient{margin:9px 0 13px;font-size:11px;line-height:17px}.head{background:#aeb5be;font-weight:700}table{width:100%;border-collapse:collapse}th{background:#aeb5be;border:1px solid #8e959d;padding:6px;text-align:center;font-size:10px}td{border-bottom:1px solid #e3e5e8;padding:4px 6px;text-align:center}td:nth-child(2){text-align:left}.number{width:34px}.category td{background:#d3d6da;text-align:left;font-weight:700;padding:4px 8px}.battery{margin-top:12px;border:1px solid #bac0c7;border-radius:3px;overflow:hidden}.battery h2{font-size:12px;margin:0;padding:5px 18px;background:#d3d6da;border-top:2px solid #687380}.battery .category:first-child td{background:#d3d6da}.legend{margin-top:16px;font-size:10px;line-height:15px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:90px;margin-top:72px;text-align:center;font-size:10px}.line{border-top:1px solid #111;padding-top:4px;margin:auto;width:220px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="logo">HOSPITAL<br/>IPO<small>INSTITUTO PARANAENSE DE OTORRINOLARINGOLOGIA</small></div><div class="patient">Paciente: <strong>${escapeHtml(patientName)}</strong><br/>Data: <strong>${formattedDate}</strong></div>${batteries}<div class="legend"><strong>Legenda:</strong><br/>- = Sem reação<br/>+ = Reação fraca<br/>++ = Reação moderada<br/>+++ = Reação forte<br/>++++ = Reação muito forte<br/>XXXX = Teste inválido por dermatografismo/impossibilidade técnica.</div><div class="signatures"><div><div class="line">${nurse}<br/>Enfermagem</div></div><div><div class="line">Dr. Sérgio Maniglia<br/>CRM 20.762</div></div></div>${openPrintDialog ? "<script>window.onload=()=>window.print()<\\/script>" : ""}</body></html>`);
    printable.document.head.insertAdjacentHTML("beforeend", "<style>@page{size:A4 portrait;margin:9mm}body{font-size:8px}.battery{margin-top:7px}.battery h2{font-size:9px;padding:3px 8px}table{table-layout:fixed}th{font-size:7px;padding:3px 1px}td{font-size:7px;padding:2px 1px;word-break:break-word}.number{width:22px}.signatures{gap:30px;margin-top:32px;font-size:8px}.line{width:170px}</style>");
    printable.document.close();
  }

  function printPatchReport(report: SavedReport, openPrintDialog = true) {
    if (report.report_type !== "patch_test") return;
    const patientName = selected?.id === report.patient_id ? selected.name : String(report.content.patientName ?? "Paciente");
    const date = typeof report.content.examDate === "string" ? report.content.examDate : report.created_at;
    const formattedDate = new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
    const savedResults = (report.content.results ?? {}) as Record<string, unknown>;
    const positiveItems = Object.entries(savedResults).filter(([, value]) => ["+", "++", "+++"].includes(patchResultText(value)));
    const rows = patchBatteries.map((battery) => `<section class="battery"><h2>${escapeHtml(battery.name)}</h2><table><thead><tr><th>Substância</th><th>1ª leitura · 48h</th><th>2ª leitura · 48h</th><th>Resultado</th></tr></thead><tbody>${battery.items.map((item) => { const result = savedResults[item] as Partial<PatchResult> | undefined; return `<tr><td>${escapeHtml(item)}</td><td>${escapeHtml(result?.firstReading || "—")}</td><td>${escapeHtml(result?.secondReading || "—")}</td><td><strong>${escapeHtml(patchResultText(result))}</strong></td></tr>`; }).join("")}</tbody></table></section>`).join("");
    const detailed = positiveItems.length ? `<section class="details"><h2>Substâncias com reação</h2>${positiveItems.map(([item, result]) => { const detail = patchSubstanceDetails[patchSubstanceCode(item)]; const fields = detail ? [["O que é", detail.what], ["Descrição", detail.description], ["Onde é encontrada", detail.where], ["Também pode ser encontrada como", detail.aliases], ["Reação cruzada", detail.crossReaction], ["Observações", detail.observations]].filter(([, value]) => value && value !== "-").map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("") : ""; return `<article><h3>${escapeHtml(item)} — ${escapeHtml(patchResultText(result))}</h3><p><strong>Leituras:</strong> ${escapeHtml(patchResultDetails(result))}</p>${fields}</article>`; }).join("")}</section>` : "";
    const printable = window.open("", "_blank");
    if (!printable) { setMessage("Permita a abertura de janelas para gerar o PDF."); return; }
    printable.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Laudo Patch - ${escapeHtml(patientName)}</title><style>@page{size:A4 portrait;margin:11mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1e1b1c;margin:0;font-size:10px}.brand{display:flex;align-items:center;gap:10px;border-bottom:2px solid #a3113a;padding-bottom:9px}.brand strong{font-size:18px;letter-spacing:1px;color:#8e1535}.brand small{display:block;font-size:7px;font-weight:700;letter-spacing:1px}.patient{margin:10px 0 12px;line-height:16px}.battery{margin-top:8px;border:1px solid #bac0c7;border-radius:3px;overflow:hidden}.battery h2,.details h2{margin:0;padding:5px 9px;background:#d3d6da;border-top:2px solid #687380;font-size:10px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#aeb5be;border:1px solid #8e959d;padding:4px;text-align:left;font-size:8px}td{border-bottom:1px solid #e3e5e8;padding:3px 4px;font-size:8px}th:nth-child(n+2),td:nth-child(n+2){text-align:center;width:18%}.details{margin-top:14px}.details article{border-bottom:1px solid #ddd;padding:7px 2px}.details h3{margin:0 0 4px;font-size:10px;color:#8e1535}.details p{margin:0;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header class="brand"><img src="${window.location.origin}/logo-cra.png" alt="CRA Care" style="height:32px;width:auto" onerror="this.style.display='none'"/><div><strong>CRA CARE</strong><small>CENTRO DE RINITE E ALERGIA</small></div></header><div class="patient">Paciente: <strong>${escapeHtml(patientName)}</strong><br/>Data: <strong>${formattedDate}</strong><br/>Médica responsável: <strong>${escapeHtml(String(report.content.examResponsible ?? "Não informado"))}</strong><br/>Enfermagem: <strong>${escapeHtml(String(report.content.nurseName ?? "Enfermagem"))}</strong></div>${rows}${detailed}${typeof report.content.notes === "string" && report.content.notes ? `<section class="details"><h2>Observações</h2><article>${escapeHtml(report.content.notes)}</article></section>` : ""}${openPrintDialog ? "<script>window.onload=()=>window.print()<\\/script>" : ""}</body></html>`);
    printable.document.close();
  }

  return <main className="min-h-screen bg-[#f8f5f2] text-[#34292d]"><div className="min-h-screen lg:grid lg:grid-cols-[270px_1fr]">
    <aside className="bg-gradient-to-b from-[#b31340] to-[#790b2a] p-7 text-white"><Image src="/logo-cra-branca.png" alt="CRA" width={160} height={100} priority/><p className="mt-4 text-sm text-white/70">Painel de Enfermagem</p><nav className="mt-8 space-y-2"><button onClick={() => setSection("patients")} className={`w-full rounded-xl p-3 text-left ${section === "patients" ? "bg-white/20 font-bold" : ""}`}>Pacientes</button><button onClick={() => setSection("reports")} className={`w-full rounded-xl p-3 text-left ${section === "reports" ? "bg-white/20 font-bold" : ""}`}>Laudos</button><Link href="/" className="block rounded-xl p-3">Sair</Link></nav></aside>
    <section className="p-6 lg:p-10"><header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#a3113a]">Área clínica</p><h1 className="mt-2 text-3xl font-bold">{section === "patients" ? "Pacientes" : "Laudos"}</h1></div><button onClick={() => section === "patients" ? setModal("patient") : openReport()} className="rounded-xl bg-[#a3113a] px-5 py-3 font-bold text-white">{section === "patients" ? "+ Cadastrar paciente" : "+ Novo laudo"}</button></header>
      {message && <p className="mt-5 rounded-xl bg-[#edf8f3] p-4 text-sm">{message}</p>}
      {section === "patients" && <p className="mt-4 text-sm text-[#817578]">Você pode localizar a paciente pelo nome ou pelo CPF.</p>}
      {section === "patients" ? <><div className="mt-7 flex gap-2 rounded-2xl bg-white p-4"><input value={searchCpf} onChange={(e) => setSearchCpf(e.target.value)} placeholder="Pesquisar paciente pelo nome ou CPF" className="flex-1 rounded-xl border p-3"/><button onClick={() => void searchPatient()} className="rounded-xl border px-5 font-bold text-[#a3113a]">Buscar</button></div>{selected && <article className="mt-5 rounded-3xl border border-[#eadfd9] bg-white p-6"><h2 className="text-xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-[#817578]">CPF {selected.cpf} · Nascimento {selected.birthDate}</p><div className="mt-5 flex items-center justify-between"><strong>Histórico de laudos ({reportCount})</strong><button onClick={openReport} className="rounded-xl bg-[#a3113a] px-4 py-2 text-sm font-bold text-white">+ Novo laudo</button></div>{reports.map((report) => <article key={report.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fbf5f2] p-4 text-sm"><span><strong>{report.report_type === "prick_test" ? "Prick Test" : "Patch Test"}</strong> · {new Date(report.created_at).toLocaleDateString("pt-BR")}</span><span className="flex gap-2"><button type="button" onClick={() => report.report_type === "prick_test" ? printPrickReport(report, false) : printPatchReport(report, false)} className="rounded-lg border border-[#d8cbc7] bg-white px-3 py-2 text-xs font-bold text-[#a3113a]">Visualizar</button><button type="button" onClick={() => report.report_type === "prick_test" ? printPrickReport(report) : printPatchReport(report)} className="rounded-lg bg-[#a3113a] px-3 py-2 text-xs font-bold text-white">Gerar PDF / Imprimir</button></span></article>)}</article>}<div className="mt-5 space-y-3">{patients.map((patient) => <button key={patient.id} onClick={() => void openPatient(patient)} className="block w-full rounded-2xl bg-white p-5 text-left shadow-sm"><strong>{patient.name}</strong><span className="ml-3 text-sm text-[#817578]">CPF {patient.cpf}</span></button>)}</div></> : <><div className="mt-7 flex flex-wrap gap-3"><select value={reportPatientFilter} onChange={(event) => setReportPatientFilter(event.target.value)} className="rounded-xl border p-3"><option value="">Todos os pacientes</option>{[...new Set(allReports.map((report) => String(report.content.patientName ?? "Paciente")))].sort().map((patientName) => <option key={patientName} value={patientName}>{patientName}</option>)}</select><input type="date" value={reportDateFilter} onChange={(event) => setReportDateFilter(event.target.value)} aria-label="Filtrar pela data do laudo" className="rounded-xl border p-3" /></div><div className="mt-5"><h2 className="text-xl font-bold">Histórico de laudos</h2><p className="mt-1 text-sm text-[#817578]">Todos os laudos já preenchidos por você permanecem disponíveis aqui.</p><div className="mt-4 space-y-3">{allReports.filter((report) => (!reportPatientFilter || String(report.content.patientName ?? "Paciente") === reportPatientFilter) && (!reportDateFilter || (typeof report.content.examDate === "string" ? report.content.examDate : report.created_at).slice(0, 10) === reportDateFilter)).map((report) => <article key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5"><div><strong>{report.report_type === "prick_test" ? "Laudo Prick" : "Laudo Patch"}</strong><p className="mt-1 text-sm font-medium text-[#544449]">{String(report.content.patientName ?? "Paciente")}</p><p className="text-sm text-[#817578]">{new Date(report.created_at).toLocaleDateString("pt-BR")}</p></div><span className="flex gap-2"><button type="button" onClick={() => report.report_type === "prick_test" ? printPrickReport(report, false) : printPatchReport(report, false)} className="rounded-lg border border-[#d8cbc7] bg-white px-3 py-2 text-xs font-bold text-[#a3113a]">Visualizar</button><button type="button" onClick={() => report.report_type === "prick_test" ? printPrickReport(report) : printPatchReport(report)} className="rounded-lg bg-[#a3113a] px-3 py-2 text-xs font-bold text-white">Gerar PDF / Imprimir</button></span></article>)}</div></div></>}
    </section>
  </div>
  {modal === "patient" && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><form onSubmit={savePatient} className="w-full max-w-lg rounded-3xl bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">Cadastrar paciente</h2><button type="button" onClick={() => setModal(null)}>Fechar</button></div><div className="mt-5 grid gap-3"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" className="rounded-xl border p-3"/><input required value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="CPF" className="rounded-xl border p-3"/><input required type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="rounded-xl border p-3"/><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" className="rounded-xl border p-3"/></div><button className="mt-5 w-full rounded-xl bg-[#a3113a] p-3 font-bold text-white">Salvar paciente</button></form></div>}
  {modal === "report" && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4"><section className="mx-auto my-5 max-w-6xl rounded-3xl bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">Preencher laudo</h2><p className="mt-1 text-sm text-[#817578]">Paciente: {selected?.name ?? "Selecione uma paciente antes de criar o laudo"}</p></div><button onClick={() => setModal(null)} className="rounded-xl border px-4 py-2 font-semibold">Fechar laudo</button></div><div className="mt-5 grid gap-3 md:grid-cols-[1fr_210px]"><label className="text-sm font-semibold text-[#544449]">Paciente<input readOnly value={selected?.name ?? ""} className="mt-1 w-full rounded-xl border border-[#ddd5d0] bg-[#faf8f6] p-3 font-normal"/></label><label className="text-sm font-semibold text-[#544449]">Data<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="mt-1 w-full rounded-xl border border-[#ddd5d0] p-3 font-normal"/></label></div><div className="mt-4 flex flex-wrap gap-3"><select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="rounded-xl border p-3"><option value="prick_test">Laudo Prick</option><option value="patch_test">Laudo Patch</option></select>{reportType === "prick_test" ? <p className="rounded-xl bg-[#f7f1ee] p-3 text-sm">Responsável: <strong>Dr. Sergio Fabricio Maniglia</strong></p> : <select value={patchResponsible} onChange={(e) => setPatchResponsible(e.target.value)} className="rounded-xl border p-3"><option>Patricia Martinski</option><option>Alessandra Bitencourt</option></select>}</div>
    {reportType === "prick_test" ? <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="sr-only"><tr><th>Item</th><th>Medida</th><th>Observações</th><th>Resultado</th></tr></thead><tbody>{prickGroups.map((group, groupIndex) => <MemoGroup key={`${group.battery}-${group.category}`} group={group} showBattery={groupIndex === 0 || prickGroups[groupIndex - 1].battery !== group.battery} values={prickResults} update={updatePrick}/>)}</tbody></table></div> : <div className="mt-6 space-y-5">{patchBatteries.map((battery) => <section key={battery.name} className="overflow-hidden rounded-xl border"><h3 className="bg-[#d4d8dd] px-4 py-2 text-sm font-bold">{battery.name}</h3>{battery.items.map((item) => { const result = patchResults[item] ?? { firstReading: "", secondReading: "" }; return <div key={item} className="grid gap-3 border-t p-3 text-sm sm:grid-cols-[1fr_180px_180px]"><span>{item}</span><label>1ª leitura · 48h<select value={result.firstReading} onChange={(event) => setPatchResults((current) => ({ ...current, [item]: { ...result, firstReading: event.target.value as PatchResult["firstReading"] } }))} className="mt-1 w-full rounded-lg border p-2"><option value="">Não informado</option><option>-</option><option>?</option><option>+</option><option>++</option><option>+++</option></select></label><label>2ª leitura · 48h<select value={result.secondReading} onChange={(event) => setPatchResults((current) => ({ ...current, [item]: { ...result, secondReading: event.target.value as PatchResult["secondReading"] } }))} className="mt-1 w-full rounded-lg border p-2"><option value="">Não informado</option><option>-</option><option>?</option><option>+</option><option>++</option><option>+++</option></select></label></div>; })}</section>)}</div>}
    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações clínicas" className="mt-6 min-h-24 w-full rounded-xl border p-3"/><button disabled={!selected} onClick={() => void saveReport()} className="mt-5 w-full rounded-xl bg-[#a3113a] p-3 font-bold text-white disabled:opacity-50">Salvar laudo</button></section></div>}
  </main>;
}

function MemoGroup({ group, showBattery, values, update }: { group: { battery: string; category: string; items: string[] }; showBattery: boolean; values: Record<string, PrickResult>; update: (item: string, change: Partial<PrickResult>) => void }) {
  const groupIndex = prickGroups.indexOf(group);
  const firstNumber = prickGroups.slice(0, groupIndex).reduce((total, current) => total + current.items.length, 0) + 1;

  return <>
    {showBattery && <tr><td colSpan={5} className="border-t-4 border-[#596573] bg-[#d4d8dd] px-4 py-1.5 text-xs font-bold text-[#29323b]">{group.battery}</td></tr>}
    <tr><td colSpan={5} className="bg-[#aeb5bd] px-4 py-1 text-xs font-semibold text-[#26303a]">{group.category}</td></tr>
    {group.items.map((item, itemIndex) => {
      const value = values[item] ?? emptyPrick();
      const reaction = reactionForMm(value.mm);
      return <tr key={item} className="border-b border-[#d9dde0] bg-white text-xs text-[#2f3840]">
        <td className="w-[48%] px-3 py-2"><div className="grid grid-cols-[36px_1fr] items-center gap-3"><span className="text-center font-medium">{firstNumber + itemIndex}</span><span className="text-center">{item}</span></div></td>
        <td className="w-[20%] px-3 py-2"><div className="flex items-center justify-center gap-4"><button aria-label={`Aumentar medida de ${item}`} type="button" onClick={() => update(item, { mm: value.mm + 1 })} className="font-bold text-[#159568]">⊕</button><span className="min-w-12 text-center font-medium">{value.mm} mm</span><button aria-label={`Diminuir medida de ${item}`} type="button" onClick={() => update(item, { mm: Math.max(0, value.mm - 1) })} className="font-bold text-[#4d5965]">⊖</button><button aria-label={`Zerar medida de ${item}`} type="button" onClick={() => update(item, { mm: 0 })} className="font-bold text-[#c52743]">⊗</button></div></td>
        <td className="w-[18%] px-3 py-2"><label className="flex items-center gap-1.5"><input type="checkbox" checked={value.pseudopod} onChange={(event) => update(item, { pseudopod: event.target.checked })}/><span>Pseudópode</span></label><label className="mt-1 flex items-center gap-1.5"><input type="checkbox" checked={value.dermatographism} onChange={(event) => update(item, { dermatographism: event.target.checked })}/><span>Dermatografismo</span></label></td>
        <td colSpan={2} className={`w-[14%] px-3 py-2 text-right font-medium ${reaction === "-" ? "text-[#4e5961]" : "text-[#a3113a]"}`}>{reaction === "-" ? "Sem Reação" : reaction}</td>
      </tr>;
    })}
  </>;
}
