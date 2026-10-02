// A statement that fills in word by word, from grey to ink, as it scrolls
// through the viewport (same effect as the TAFI Contabil site). Scroll
// progress is written to one CSS variable; each word derives its own colour
// from it in CSS, so a scroll frame costs a single style update.
import { useEffect, useRef, type CSSProperties } from 'react';

export function ScrollText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(' ');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--p', '1');
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const r = el.getBoundingClientRect();
      // 0 when the top reaches 82% of the viewport, 1 when the bottom reaches 55%
      const p = (vh * 0.82 - r.top) / (vh * 0.27 + r.height);
      el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(4));
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
  }, []);

  return (
    <section className="lp-scrolltext">
      <div className="lp-container">
        <p ref={ref} className="st-reveal" style={{ ['--n' as string]: words.length } as CSSProperties}>
          {words.map((w, i) => (
            <span key={i} style={{ ['--i' as string]: i } as CSSProperties}>
              {w}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
