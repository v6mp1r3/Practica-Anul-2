// A one-line statement whose middle word starts scattered and its letters
// land in place when the line scrolls into view (same effect as the TAFI
// Agent site). Only transforms move, so nothing reflows. With reduced motion,
// or if the line is already on screen at load, it is shown whole at once.
import { useEffect, useRef, useState, type CSSProperties } from 'react';

/** Deterministic 0..1 noise: the same letters land the same way every visit. */
function rnd(i: number) {
  const v = Math.sin(i * 91.7 + 13.1) * 43758.5453;
  return v - Math.floor(v);
}

function letterStyle(i: number, count: number): CSSProperties {
  const mid = (count - 1) / 2;
  const fan = mid ? (i - mid) / mid : 0; // spread out from the middle so letters don't smudge
  const dir = i % 2 ? 1 : -1; // alternate up/down so the word breaks evenly
  return {
    ['--dx' as string]: `${(fan * 0.26 + (rnd(i) - 0.5) * 0.14).toFixed(3)}em`,
    ['--dy' as string]: `${(dir * (0.58 + rnd(i + 40) * 0.5)).toFixed(3)}em`,
    ['--r' as string]: `${((rnd(i + 80) * 2 - 1) * 26).toFixed(1)}deg`,
    ['--d' as string]: `${(rnd(i + 120) * 0.22).toFixed(3)}s`,
  };
}

type Phase = 'idle' | 'armed' | 'together' | 'instant';

export function Statement({ before, word, after }: { before: string; word: string; after: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || el.getBoundingClientRect().top < window.innerHeight) {
      setPhase('instant');
      return;
    }
    setPhase('armed');
    let raf = 0;
    const check = () => {
      raf = 0;
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        setPhase('together');
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const cls = [
    'st-line',
    phase === 'armed' || phase === 'together' ? 'is-armed' : '',
    phase === 'together' ? 'is-together' : '',
    phase === 'instant' ? 'st-instant' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="statement">
      <div className="lp-container">
        <h2 ref={ref} className={cls} aria-label={`${before}${word}${after}`}>
          <span aria-hidden="true">
            {before}
            <span className="st-word">
              {[...word].map((ch, i) => (
                <span key={i} className="st-l" style={letterStyle(i, word.length)}>
                  {ch}
                </span>
              ))}
            </span>
            {after}
          </span>
        </h2>
      </div>
    </section>
  );
}
