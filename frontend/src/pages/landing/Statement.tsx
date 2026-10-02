// A one-line statement whose middle word is scattered and whose letters land
// in place when the line reaches the middle of the screen (the TAFI Agent
// effect, replayed on every pass). Only transforms move, so nothing reflows. With reduced
// motion the line is simply shown whole.
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

export function Statement({ before, word, after }: { before: string; word: string; after: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [reduced] = useState(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [together, setTogether] = useState(false);

  // The letters come together when the line reaches the middle of the screen
  // (from either direction) and scatter again once it has left the screen, so
  // the effect replays on every pass.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let from: 'below' | 'above' = 'below';
    let isTogether = false;
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      if (r.top >= vh || r.bottom <= 0) {
        from = r.top >= vh ? 'below' : 'above';
        if (isTogether) setTogether((isTogether = false));
        return;
      }
      const reached = from === 'below' ? center <= vh / 2 : center >= vh / 2;
      if (reached && !isTogether) setTogether((isTogether = true));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const cls = ['st-line', reduced ? 'st-instant' : 'is-armed', together ? 'is-together' : ''].filter(Boolean).join(' ');

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
