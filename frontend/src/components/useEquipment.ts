import { EQUIPMENT } from '../domain/equipment';
import { useI18n } from '../i18n';

/** The equipment list with its names in the current language. */
export function useEquipment() {
  const { t } = useI18n();
  const options = EQUIPMENT.map((e) => ({ value: e.value, label: t(`equipment.${e.key}`) }));
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return { options, label, list: (values: string[]) => values.map(label).join(', ') };
}
