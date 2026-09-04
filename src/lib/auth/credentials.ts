export type AccountRole = "paciente" | "medico" | "secretaria" | "laboratorio" | "admin";

function normalizePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizeUsername(value: string) {
  return normalizePart(value).join(".") || "usuario";
}

export function authEmailForUsername(username: string) {
  return `${normalizeUsername(username)}@login.cra-care.local`;
}

export function authEmailForPatientCpf(cpf: string) {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) throw new Error("CPF inválido.");
  return `paciente.${digits}@login.cra-care.local`;
}

export function patientUsername(fullName: string) {
  const parts = normalizePart(fullName);
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0] ?? "paciente";
}

export function doctorUsername(fullName: string) {
  const parts = normalizePart(fullName);
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0] ?? "medico";
}

export function patientInitialPassword(birthDate: string) {
  const [year, month, day] = birthDate.slice(0, 10).split("-");
  if (!year || !month || !day) throw new Error("Data de nascimento inválida.");
  return `${day}${month}${year}`;
}

export function doctorInitialPassword(crm: string) {
  const digits = crm.replace(/\D/g, "");
  if (!digits) throw new Error("CRM inválido.");
  return digits;
}

export function requiresPasswordChange(role: AccountRole) {
  return role === "secretaria" || role === "admin";
}
