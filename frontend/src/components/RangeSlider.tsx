// A bar with two handles to drag, for a range (e.g. a room's seats).
export function RangeSlider({
  min,
  max,
  value: [lo, hi],
  onChange,
  label,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  label: string;
}) {
  const pct = (v: number) => `${max > min ? ((v - min) / (max - min)) * 100 : 0}%`;
  return (
    <div className="range-filter">
      <span className="small">
        {label}{' '}
        <strong>
          {lo}–{hi}
        </strong>
      </span>
      <div className="range2" style={{ ['--lo' as string]: pct(lo), ['--hi' as string]: pct(hi) }}>
        <input
          type="range"
          min={min}
          max={max}
          value={lo}
          aria-label={`${label} min`}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={hi}
          aria-label={`${label} max`}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
        />
      </div>
    </div>
  );
}
