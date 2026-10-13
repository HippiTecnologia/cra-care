import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import readline from "node:readline";
import { PDFDocument } from "pdf-lib";

const require = createRequire(import.meta.url);
const { SignPdf } = require("@signpdf/signpdf");
const { pdflibAddPlaceholder } = require("@signpdf/placeholder-pdf-lib");
const { P12Signer } = require("@signpdf/signer-p12");

function ask(question) {
  return new Promise((resolve) => {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    prompt.question(question, (answer) => { prompt.close(); resolve(answer.trim()); });
  });
}

function askHidden(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") return ask(question);
  return new Promise((resolve) => {
    process.stdout.write(question);
    let answer = "";
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") process.exit(130);
        if (character === "\r" || character === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(answer);
          return;
        }
        if (character === "\u007f") answer = answer.slice(0, -1);
        else answer += character;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

const [inputPath, outputPath, p12Path] = process.argv.slice(2);
if (!inputPath || !outputPath || !p12Path) {
  console.error("Uso: npm run a1:sign -- <entrada.pdf> <saida-assinada.pdf> <certificado.p12>");
  process.exit(2);
}

try {
  const [pdf, p12] = await Promise.all([readFile(inputPath), readFile(p12Path)]);
  if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("O arquivo de entrada não é um PDF válido.");
  const passphrase = await askHidden("Senha do certificado A1 (não será salva): ");
  const pdfDocument = await PDFDocument.load(pdf);
  pdflibAddPlaceholder({
    pdfDoc: pdfDocument,
    reason: "Assinatura digital CRA Care",
    contactInfo: "CRA Care",
    name: "Assinatura A1",
    location: "Curitiba - PR",
    signatureLength: 16000,
  });
  const preparedPdf = Buffer.from(await pdfDocument.save({ useObjectStreams: false }));
  const signedPdf = await new SignPdf().sign(preparedPdf, new P12Signer(p12, { passphrase }));
  await writeFile(outputPath, signedPdf);
  console.log(`PDF assinado criado em: ${outputPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Não foi possível assinar o PDF.");
  process.exit(1);
}
