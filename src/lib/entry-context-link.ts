export function parseContextEntryIds(value: string | null): number[] {
  if (!value) return [];
  const parts = value.split(',');
  if (parts.length > 2 || parts.some(part => !/^[1-9]\d{0,15}$/.test(part))) return [];
  const ids = parts.map(Number);
  return ids.every(Number.isSafeInteger) ? [...new Set(ids)] : [];
}
