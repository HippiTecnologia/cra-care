"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  DemoInvoice,
  DemoPatientRecord,
  demoMedicalPatients,
  readDemoInvoices,
  readDemoPatients,
  removeDemoInvoice,
  saveDemoInvoice,
  subscribeDemoPatients,
} from "../../medico/patient-store";

function normalizeCpf(value: string) {
  return value.replace(/\D/g, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatSize(value: number) {
  return `${(value / 1024).toFixed(1)} KB`;
}

export default function SecretariaNotasFiscaisPage() {
  const [patients, setPatients] = useState<DemoPatientRecord[]>([]);
  const [invoices, setInvoices] = useState<DemoInvoice[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const synchronize = () => {
      const savedPatients = readDemoPatients();
      const savedIds = new Set(savedPatients.map((patient) => patient.id));
      setPatients([...savedPatients, ...demoMedicalPatients.filter((patient) => !savedIds.has(patient.id))]);
      setInvoices(readDemoInvoices());
    };

    queueMicrotask(synchronize);
    return subscribeDemoPatients(synchronize);
  }, []);

  const filteredInvoices = useMemo(() => {
    const normalized = normalizeCpf(search.toLowerCase());
    const text = search.toLowerCase().trim();

    return invoices.filter((invoice) =>
      !text ||
      invoice.patientName.toLowerCase().includes(text) ||
      invoice.fileName.toLowerCase().includes(text) ||
      normalizeCpf(invoice.patientCpf).includes(normalized),
    );
  }, [invoices, search]);

  function readFile(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(new Error("Não foi possível ler o PDF.")));
      reader.readAsDataURL(file);
    });
  }

  async function extractPdfText(file: File) {
    const { GlobalWorkerOptions, getDocument } = await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    );
    GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocument({ data }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
    }

    pdf.cleanup();
    return pages.join(" ");
  }

  async function uploadInvoice(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setMessage("");

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Selecione um arquivo no formato PDF.");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setError("Neste protótipo, o PDF deve ter no máximo 3 MB.");
      return;
    }

    setUploading(true);
    try {
      const pdfText = await extractPdfText(file);
      const normalizedText = normalizeCpf(pdfText);
      const matchingPatients = patients.filter((record) =>
        normalizedText.includes(normalizeCpf(record.cpf)),
      );

      if (matchingPatients.length === 0) {
        throw new Error("Nenhum CPF de paciente cadastrado foi encontrado dentro do PDF. Confira se o documento possui texto pesquisável.");
      }

      if (matchingPatients.length > 1) {
        throw new Error("O PDF contém CPFs de mais de um paciente cadastrado. Confira o documento antes de importar.");
      }

      const patient = matchingPatients[0];
      if (invoices.some((invoice) => invoice.patientId === patient.id && invoice.fileName.toLowerCase() === file.name.toLowerCase())) {
        throw new Error("Este arquivo já foi vinculado ao paciente. Renomeie-o ou remova a versão anterior.");
      }

      const invoice: DemoInvoice = {
        id: crypto.randomUUID(),
        patientId: patient.id,
        patientName: patient.name,
        patientCpf: patient.cpf,
        fileName: file.name,
        fileData: await readFile(file),
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: "Secretaria CRA",
      };
      saveDemoInvoice(invoice);
      setMessage(`${file.name} vinculado automaticamente a ${patient.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível armazenar a nota neste navegador.");
    } finally {
      setUploading(false);
    }
  }

  function deleteInvoice(invoice: DemoInvoice) {
    removeDemoInvoice(invoice.id);
    setMessage(`Nota ${invoice.fileName} removida do protótipo.`);
    setError("");
  }

  return (
    <main className="min-h-screen bg-[#f8f5f2] text-[#34292d]">
      <div className="min-h-screen lg:grid lg:grid-cols-[285px_minmax(0,1fr)]">
        <aside className="bg-gradient-to-b from-[#b31340] to-[#790b2a] px-7 py-8 text-white lg:min-h-screen">
          <Image src="/logo-cra-branca.png" alt="CRA" width={170} height={115} priority className="h-auto w-36" />
          <p className="mt-4 border-b border-white/15 pb-8 text-sm text-white/70">Painel da Secretaria</p>
          <nav className="mt-8 space-y-2">
            <Link href="/secretaria" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Dashboard</Link>
            <Link href="/secretaria/lotes" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Lotes</Link>
            <Link href="/secretaria/estoque" className="block rounded-2xl px-4 py-3 text-sm text-white/80 hover:bg-white/10">Vacinas em estoque</Link>
            <Link href="/secretaria/notas-fiscais" className="block rounded-2xl bg-white/15 px-4 py-3 text-sm font-semibold">Notas fiscais</Link>
          </nav>
          <Link href="/" className="mt-8 inline-flex text-sm font-semibold text-white/85">← Sair</Link>
        </aside>

        <section className="px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a3113a]">Secretaria · documentos</p><h1 className="mt-2 text-3xl font-bold text-[#433438]">Notas fiscais</h1><p className="mt-2 text-sm text-[#817578]">Importe o PDF e o sistema localizará o paciente pelo CPF escrito no documento.</p></div>
              <Link href="/secretaria" className="self-start rounded-xl border border-[#e6dbd6] bg-white px-4 py-3 text-sm font-semibold text-[#a3113a]">← Voltar</Link>
            </div>

            {message && <p className="mt-5 rounded-2xl border border-[#cfe9df] bg-[#edf8f3] px-4 py-3 text-sm text-[#187157]">{message}</p>}
            {error && <p role="alert" className="mt-5 rounded-2xl border border-[#f3d5d8] bg-[#fff2f3] px-4 py-3 text-sm text-[#a3113a]">{error}</p>}

            <section className="mt-6 rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
              <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div><h2 className="text-xl font-bold text-[#433438]">Importar nota fiscal</h2><p className="mt-2 text-sm text-[#817578]">O arquivo pode ter qualquer nome. O CRA Care lerá o CPF diretamente no conteúdo do PDF.</p></div>
                <label className={`cursor-pointer rounded-xl bg-[#a3113a] px-5 py-3 text-center text-sm font-semibold text-white ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                  {uploading ? "Enviando..." : "Selecionar PDF"}
                  <input type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadInvoice(event)} className="sr-only" />
                </label>
              </div>
              <p className="mt-5 rounded-2xl bg-[#fff8eb] px-4 py-3 text-xs leading-5 text-[#806238]"><strong>Protótipo:</strong> o PDF precisa conter texto pesquisável; documentos apenas escaneados precisarão de OCR na versão final. Os arquivos ficam somente neste navegador e nesta aba e depois serão armazenados de forma privada no Supabase.</p>
            </section>

            <section className="mt-6 rounded-[28px] border border-[#eee5e0] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-[#433438]">Documentos vinculados</h2><p className="mt-1 text-sm text-[#817578]">{invoices.length} nota(s) fiscal(is)</p></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar paciente, CPF ou arquivo" className="h-11 rounded-xl border border-[#e9dfda] px-4 text-sm outline-none focus:border-[#b91142]" /></div>
              <div className="mt-6 space-y-3">
                {filteredInvoices.length === 0 ? <p className="rounded-2xl border border-dashed border-[#e6dbd6] px-5 py-10 text-center text-sm text-[#817578]">Nenhuma nota fiscal encontrada.</p> : filteredInvoices.map((invoice) => (
                  <article key={invoice.id} className="flex flex-col gap-4 rounded-2xl bg-[#fbf5f2] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-bold text-[#433438]">{invoice.patientName}</p><p className="mt-1 text-xs text-[#716569]">CPF {invoice.patientCpf} · {invoice.fileName}</p><p className="mt-1 text-xs text-[#817578]">{formatSize(invoice.fileSize)} · Enviado em {formatDate(invoice.uploadedAt)}</p></div>
                    <div className="flex flex-wrap gap-2"><a href={invoice.fileData} target="_blank" rel="noreferrer" className="rounded-xl border border-[#e6dbd6] px-4 py-2.5 text-xs font-semibold text-[#a3113a]">Abrir PDF</a><a href={invoice.fileData} download={invoice.fileName} className="rounded-xl bg-[#a3113a] px-4 py-2.5 text-xs font-semibold text-white">Baixar</a><button type="button" onClick={() => deleteInvoice(invoice)} className="rounded-xl bg-[#fff1f3] px-4 py-2.5 text-xs font-semibold text-[#a3113a]">Remover</button></div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
