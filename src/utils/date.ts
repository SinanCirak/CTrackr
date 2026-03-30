const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function extractDateOnlyPart(value: string): string {
  const normalized = String(value || '').trim().replace(/[/.]/g, '-');
  if (normalized.length >= 10) return normalized.slice(0, 10);
  return normalized;
}

export function parseDateOnlyToLocal(dateValue: string): Date | null {
  const value = extractDateOnlyPart(dateValue);
  const match = value.match(DATE_ONLY_REGEX);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function dateOnlyToBoundaryMs(dateValue: string, endOfDay = false): number {
  const parsed = parseDateOnlyToLocal(dateValue);
  if (!parsed) return endOfDay ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed.getTime();
}

export function formatDateOnlyForDisplay(dateValue?: string | null): string {
  if (!dateValue) return '';
  const parsed = parseDateOnlyToLocal(dateValue);
  if (!parsed) {
    const fallback = new Date(dateValue);
    return Number.isNaN(fallback.getTime()) ? String(dateValue) : fallback.toLocaleDateString();
  }
  return parsed.toLocaleDateString();
}

export function getTodayDateLocalISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
