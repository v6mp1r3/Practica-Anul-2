import type { GenerationRules } from '../domain/types';

const KEY = 'eduschedule:generation-rules';

/** Every rule is allowed (a soft preference) except days below the minimum number of pairs, which are not. */
export const DEFAULT_RULES: Required<GenerationRules> = {
  allowGroupGaps: true,
  allowTeacherGaps: true,
  allowThinDays: false,
  allowOverload: true,
  allowEdgeMisses: true,
};

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const browserStore = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // blocked storage (private window): the choices simply are not remembered
  }
};

/** The rules the administrator chose last time; the defaults for anything missing or unreadable. */
export function loadRules(store: Store | null = browserStore()): Required<GenerationRules> {
  try {
    const saved = JSON.parse(store?.getItem(KEY) ?? 'null');
    const out = { ...DEFAULT_RULES };
    for (const k of Object.keys(DEFAULT_RULES) as (keyof GenerationRules)[]) if (typeof saved?.[k] === 'boolean') out[k] = saved[k];
    return out;
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export function saveRules(rules: Required<GenerationRules>, store: Store | null = browserStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(rules));
  } catch {
    /* storage full or blocked: nothing to do */
  }
}
