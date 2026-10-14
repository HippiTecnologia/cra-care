function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Converts either DD/MM/AAAA or AAAA-MM-DD to the database format AAAA-MM-DD. */
export function normalizeBirthDate(value: string) {
  const text = value.trim();
  let year: number;
  let month: number;
  let day: number;

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const brazilian = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const digits = text.replace(/\D/g, "");

  if (iso) [, year, month, day] = iso.map(Number);
  else if (brazilian) [, day, month, year] = brazilian.map(Number);
  else if (/^\d{8}$/.test(digits)) {
    const firstFour = Number(digits.slice(0, 4));
    if (firstFour >= 1900 && firstFour <= 2100) {
      year = firstFour; month = Number(digits.slice(4, 6)); day = Number(digits.slice(6, 8));
    } else {
      day = Number(digits.slice(0, 2)); month = Number(digits.slice(2, 4)); year = Number(digits.slice(4, 8));
    }
  } else return null;

  if (!validDate(year!, month!, day!)) return null;
  return `${year!.toString().padStart(4, "0")}-${month!.toString().padStart(2, "0")}-${day!.toString().padStart(2, "0")}`;
}

export function formatBirthDate(value?: string | null) {
  const normalized = value ? normalizeBirthDate(value) : null;
  if (!normalized) return value || "Não informada";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}
