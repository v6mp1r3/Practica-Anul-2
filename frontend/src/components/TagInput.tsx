import { useState } from 'react';
import { Icon } from './Icon';

/** Free-text tags with suggestions (used for room equipment). */
export function TagInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = (tag: string) => {
    const v = tag.trim().toLowerCase();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  const remaining = suggestions.filter((s) => !value.includes(s));

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row wrap" style={{ gap: 4 }}>
        {value.map((tag) => (
          <span key={tag} className="badge primary">
            {tag}
            <button type="button" className="btn ghost" style={{ height: 16, padding: 0, color: 'inherit' }} onClick={() => onChange(value.filter((x) => x !== tag))} aria-label={`- ${tag}`}>
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
      </div>
      <input
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => text && add(text)}
      />
      {remaining.length > 0 && (
        <div className="row wrap" style={{ gap: 4 }}>
          {remaining.map((s) => (
            <button key={s} type="button" className="badge" style={{ border: 'none', cursor: 'pointer' }} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
