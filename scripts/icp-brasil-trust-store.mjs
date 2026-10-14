// Downloads only the current ICP-Brasil root certificates published by ITI.
// The output is public PEM data and is intended for ICP_BRASIL_TRUSTED_ROOTS_PEM.
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootUrls = [
  "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv4.crt",
  "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv5.crt",
  "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv6.crt",
  "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv7.crt",
  "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv12.crt",
  "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv13.crt",
];

function toPem(bytes) {
  const text = Buffer.from(bytes).toString("utf8").trim();
  if (/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(text)) {
    return text.replace(/\r\n/g, "\n");
  }
  const base64 = Buffer.from(bytes).toString("base64").match(/.{1,64}/g)?.join("\n");
  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----`;
}

async function downloadCertificate(url) {
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch (fetchError) {
    // The AC-Raiz endpoint currently omits an intermediate that Node does not
    // always have. On Windows, curl uses the verified system certificate store.
    if (process.platform !== "win32") throw fetchError;
    const { stdout } = await execFileAsync("curl.exe", ["--fail", "--silent", "--show-error", "--proto", "=https", url], { encoding: "buffer", maxBuffer: 64 * 1024 });
    return new Uint8Array(stdout);
  }
}

const certificates = await Promise.all(rootUrls.map(async (url) => {
  const bytes = await downloadCertificate(url);
  if (!bytes.length || bytes.length > 64 * 1024) throw new Error(`Certificado raiz inválido recebido de ${url}.`);
  return toPem(bytes);
}));

const pem = `${certificates.join("\n")}\n`;
const outputPath = process.argv[2] === "--env-file" ? process.argv[3] : undefined;

if (outputPath) {
  if (!outputPath || outputPath.startsWith("-") || !outputPath.endsWith(".env")) throw new Error("Informe um arquivo .env para exportar as raízes ICP-Brasil.");
  const escapedPem = pem.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
  await writeFile(outputPath, `ICP_BRASIL_TRUSTED_ROOTS_PEM="${escapedPem}"\n`, "utf8");
  process.stdout.write(`Arquivo criado: ${outputPath}\n`);
} else {
  process.stdout.write(pem);
}
