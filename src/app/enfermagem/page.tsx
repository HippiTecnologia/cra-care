"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createNursingPatient,
  createNursingReport,
  findNursingPatientByCpf,
  loadNursingReportsForPatient,
  loadNursingWorkspace,
  type NursingPatient,
  type NursingProfile,
} from "../../lib/supabase/nursing-records";

type Section = "patients" | "reports";
type ReportType = "prick_test" | "patch_test";
type Modal = "patient" | "report" | null;
type PrickResult = { mm: number; reaction: "-" | "+" | "++" | "+++" | "++++"; pseudopod: boolean; dermatographism: boolean };
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
const patchItems = ["Níquel", "Sulfato de cobalto", "Dicromato de potássio", "Mistura de fragrâncias", "Bálsamo do Peru", "Parafenilenodiamina", "Lanolina", "Formaldeído", "Parabenos", "Propilenoglicol"];
const emptyPrick = (): PrickResult => ({ mm: 0, reaction: "-", pseudopod: false, dermatographism: false });

export default function NursingPage() {
  const [section, setSection] = useState<Section>("patients");
  const [profile, setProfile] = useState<NursingProfile | null>(null);
  const [patients, setPatients] = useState<NursingPatient[]>([]);
  const [selected, setSelected] = useState<NursingPatient | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [searchCpf, setSearchCpf] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [reportType, setReportType] = useState<ReportType>("prick_test");
  const [patchResponsible, setPatchResponsible] = useState("Patricia Martinski");
  const [prickResults, setPrickResults] = useState<Record<string, PrickResult>>({});
  const [patchResults, setPatchResults] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  async function reload() {
    const workspace = await loadNursingWorkspace();
    setProfile(workspace.profile);
    setPatients(workspace.patients);
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
    if (!profile || searchCpf.replace(/\D/g, "").length !== 11) return setMessage("Informe o CPF completo.");
    const patient = await findNursingPatientByCpf(profile, searchCpf);
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
    setPrickResults((current) => ({ ...current, [item]: { ...(current[item] ?? emptyPrick()), ...change } }));
  }

  function openReport() {
    setReportType("prick_test"); setPrickResults({}); setPatchResults({}); setNotes(""); setModal("report");
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
        examResponsible: reportType === "prick_test" ? "Dr. Sergio Fabricio Maniglia" : patchResponsible,
        registeredAt: new Date().toISOString(),
      },
    });
    setReports(await loadNursingReportsForPatient(selected.id) as SavedReport[]);
    setModal(null);
    setMessage("Laudo salvo no histórico da paciente.");
  }

  return <main className="min-h-screen bg-[#f8f5f2] text-[#34292d]"><div className="min-h-screen lg:grid lg:grid-cols-[270px_1fr]">
    <aside className="bg-gradient-to-b from-[#b31340] to-[#790b2a] p-7 text-white"><Image src="/logo-cra-branca.png" alt="CRA" width={160} height={100} priority/><p className="mt-4 text-sm text-white/70">Painel de Enfermagem</p><nav className="mt-8 space-y-2"><button onClick={() => setSection("patients")} className={`w-full rounded-xl p-3 text-left ${section === "patients" ? "bg-white/20 font-bold" : ""}`}>Pacientes</button><button onClick={() => setSection("reports")} className={`w-full rounded-xl p-3 text-left ${section === "reports" ? "bg-white/20 font-bold" : ""}`}>Laudos</button><Link href="/" className="block rounded-xl p-3">Sair</Link></nav></aside>
    <section className="p-6 lg:p-10"><header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#a3113a]">Área clínica</p><h1 className="mt-2 text-3xl font-bold">{section === "patients" ? "Pacientes" : "Laudos"}</h1></div><button onClick={() => section === "patients" ? setModal("patient") : openReport()} className="rounded-xl bg-[#a3113a] px-5 py-3 font-bold text-white">{section === "patients" ? "+ Cadastrar paciente" : "+ Novo laudo"}</button></header>
      {message && <p className="mt-5 rounded-xl bg-[#edf8f3] p-4 text-sm">{message}</p>}
      {section === "patients" ? <><div className="mt-7 flex gap-2 rounded-2xl bg-white p-4"><input value={searchCpf} onChange={(e) => setSearchCpf(e.target.value)} placeholder="Pesquisar paciente pelo CPF" className="flex-1 rounded-xl border p-3"/><button onClick={() => void searchPatient()} className="rounded-xl border px-5 font-bold text-[#a3113a]">Buscar</button></div>{selected && <article className="mt-5 rounded-3xl border border-[#eadfd9] bg-white p-6"><h2 className="text-xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-[#817578]">CPF {selected.cpf} · Nascimento {selected.birthDate}</p><div className="mt-5 flex items-center justify-between"><strong>Histórico de laudos ({reportCount})</strong><button onClick={openReport} className="rounded-xl bg-[#a3113a] px-4 py-2 text-sm font-bold text-white">+ Novo laudo</button></div>{reports.map((report) => <p key={report.id} className="mt-3 rounded-xl bg-[#fbf5f2] p-4 text-sm">{report.report_type === "prick_test" ? "Prick Test" : "Patch Test"} · {new Date(report.created_at).toLocaleDateString("pt-BR")}</p>)}</article>}<div className="mt-5 space-y-3">{patients.map((patient) => <button key={patient.id} onClick={() => void openPatient(patient)} className="block w-full rounded-2xl bg-white p-5 text-left shadow-sm"><strong>{patient.name}</strong><span className="ml-3 text-sm text-[#817578]">CPF {patient.cpf}</span></button>)}</div></> : <><select value={selected?.id ?? ""} onChange={(e) => { const patient = patients.find((item) => item.id === e.target.value); if (patient) void openPatient(patient, "reports"); }} className="mt-7 rounded-xl border p-3"><option value="">Selecione a paciente</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select><div className="mt-5 space-y-3">{reports.map((report) => <article key={report.id} className="rounded-2xl bg-white p-5"><strong>{report.report_type === "prick_test" ? "Laudo Prick" : "Laudo Patch"}</strong><p className="text-sm text-[#817578]">{new Date(report.created_at).toLocaleDateString("pt-BR")}</p></article>)}</div></>}
    </section>
  </div>
  {modal === "patient" && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><form onSubmit={savePatient} className="w-full max-w-lg rounded-3xl bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">Cadastrar paciente</h2><button type="button" onClick={() => setModal(null)}>Fechar</button></div><div className="mt-5 grid gap-3"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" className="rounded-xl border p-3"/><input required value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="CPF" className="rounded-xl border p-3"/><input required type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="rounded-xl border p-3"/><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" className="rounded-xl border p-3"/></div><button className="mt-5 w-full rounded-xl bg-[#a3113a] p-3 font-bold text-white">Salvar paciente</button></form></div>}
  {modal === "report" && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4"><section className="mx-auto my-5 max-w-6xl rounded-3xl bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">Preencher laudo</h2><p className="mt-1 text-sm text-[#817578]">Paciente: {selected?.name ?? "Selecione uma paciente antes de criar o laudo"}</p></div><button onClick={() => setModal(null)} className="rounded-xl border px-4 py-2 font-semibold">Fechar laudo</button></div><div className="mt-5 flex flex-wrap gap-3"><select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="rounded-xl border p-3"><option value="prick_test">Laudo Prick</option><option value="patch_test">Laudo Patch</option></select>{reportType === "prick_test" ? <p className="rounded-xl bg-[#f7f1ee] p-3 text-sm">Responsável: <strong>Dr. Sergio Fabricio Maniglia</strong></p> : <select value={patchResponsible} onChange={(e) => setPatchResponsible(e.target.value)} className="rounded-xl border p-3"><option>Patricia Martinski</option><option>Alessandra Bitencourt</option></select>}</div>
    {reportType === "prick_test" ? <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="bg-[#8f99a5] text-left text-white"><th className="p-3">Item</th><th className="p-3">Medida</th><th className="p-3">Reação</th><th className="p-3">Pseudópode</th><th className="p-3">Dermatografismo</th></tr></thead><tbody>{prickGroups.map((group, groupIndex) => <MemoGroup key={`${group.battery}-${group.category}`} group={group} showBattery={groupIndex === 0 || prickGroups[groupIndex - 1].battery !== group.battery} values={prickResults} update={updatePrick}/>)}</tbody></table></div> : <div className="mt-6 space-y-2">{patchItems.map((item) => <label key={item} className="flex items-center justify-between border-b p-3"><span>{item}</span><select value={patchResults[item] ?? ""} onChange={(e) => setPatchResults((current) => ({ ...current, [item]: e.target.value }))} className="rounded-lg border p-2"><option value="">Não informado</option><option>-</option><option>?</option><option>+</option><option>++</option><option>+++</option></select></label>)}</div>}
    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações clínicas" className="mt-6 min-h-24 w-full rounded-xl border p-3"/><button disabled={!selected} onClick={() => void saveReport()} className="mt-5 w-full rounded-xl bg-[#a3113a] p-3 font-bold text-white disabled:opacity-50">Salvar laudo</button></section></div>}
  </main>;
}

function MemoGroup({ group, showBattery, values, update }: { group: { battery: string; category: string; items: string[] }; showBattery: boolean; values: Record<string, PrickResult>; update: (item: string, change: Partial<PrickResult>) => void }) {
  return <>{showBattery && <tr><td colSpan={5} className="border-t-4 border-[#586574] bg-[#d6d9dd] px-4 py-2 font-bold">{group.battery}</td></tr>}<tr><td colSpan={5} className="bg-[#aeb5bd] px-4 py-1 font-semibold">{group.category}</td></tr>{group.items.map((item) => { const value = values[item] ?? emptyPrick(); return <tr key={item} className="border-b"><td className="p-3">{item}</td><td className="p-3"><div className="flex items-center gap-2"><button type="button" onClick={() => update(item, { mm: Math.max(0, value.mm - 1) })} className="h-8 w-8 rounded-full bg-[#45505d] font-bold text-white">−</button><strong className="min-w-12 text-center">{value.mm} mm</strong><button type="button" onClick={() => update(item, { mm: value.mm + 1 })} className="h-8 w-8 rounded-full bg-[#159568] font-bold text-white">+</button></div></td><td className="p-3"><select value={value.reaction} onChange={(e) => update(item, { reaction: e.target.value as PrickResult["reaction"] })} className="rounded-lg border p-2"><option>-</option><option>+</option><option>++</option><option>+++</option><option>++++</option></select></td><td className="p-3"><input type="checkbox" checked={value.pseudopod} onChange={(e) => update(item, { pseudopod: e.target.checked })}/></td><td className="p-3"><input type="checkbox" checked={value.dermatographism} onChange={(e) => update(item, { dermatographism: e.target.checked })}/></td></tr>; })}</>;
}


