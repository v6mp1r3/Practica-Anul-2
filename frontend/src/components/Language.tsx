// Language of instruction: a small tag (RO / RU / EN / FR) and the field to pick it.
import { LANGUAGES, type Language } from '../domain/types';
import { useI18n } from '../i18n';
import { Select } from './Select';
import { Field } from './ui';

export const languageOf = (x: { language?: Language }): Language => x.language ?? 'ro';

export function LanguageTag({ language }: { language?: Language }) {
  const { t } = useI18n();
  const l = language ?? 'ro';
  return (
    <span className={`badge lang lang-${l}`} title={t(`language.${l}`)}>
      {l.toUpperCase()}
    </span>
  );
}

export function LanguageField({
  value,
  onChange,
  label,
  hint,
}: {
  value?: Language;
  onChange: (l: Language) => void;
  label: string;
  hint?: string;
}) {
  const { t } = useI18n();
  return (
    <Field label={label} hint={hint}>
      <Select className="select" value={value ?? 'ro'} onChange={(e) => onChange(e.target.value as Language)}>
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {t(`language.${l}`)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
