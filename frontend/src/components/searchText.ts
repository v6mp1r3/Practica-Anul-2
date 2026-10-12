// Typing in a drop-down list narrows it: matching ignores case and accents (ă = a, ț = t).
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Lists longer than this get a search box. */
export const SEARCH_FROM = 5;

export const matches = (label: string, query: string) => {
  const q = fold(query).trim();
  return !q || fold(label).includes(q);
};
