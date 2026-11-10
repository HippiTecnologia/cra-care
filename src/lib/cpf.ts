export function normalizeCpf(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatCpfInput(value: string): string {
  const digits = normalizeCpf(value).slice(0, 11);

  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatCpfDisplay(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const digits = normalizeCpf(raw);

  if (digits.length !== 11) return raw;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
