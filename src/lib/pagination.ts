export const DEFAULT_PAGE_SIZE = 50;

export function parsePage(value: string | string[] | undefined) {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] : value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function pageRange(page: number, pageSize = DEFAULT_PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}
