// Pinned stacking cards (same effect as the TAFI Contabil site): each card
// sticks to the screen, the next one slides over it, and the ones behind scale
// back into a stack. One scroll listener sets a progress value; each card's
// scale is derived from it.
import { useEffect, useRef, useState } from 'react';

export interface StackCard {
  title: string;
  text: string;
}

const META = [
  { color: '#1b7396', img: '/img/landing/setup.jpg' }, // blue (Pantone 633)
  { color: '#006c50', img: '/img/landing/generate.jpg' }, // deep green (Pantone 342)
  { color: '#940144', img: '/img/landing/publish.jpg' }, // plum (Pantone 221)
];

export function StackingCards({ title, cards }: { title: string; cards: StackCard[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      setProgress(span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0);
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

  const total = cards.length;

  return (
    <section id="how" className="lp-stack">
      <div className="lp-container lp-stack-intro">
        <h2 className="lp-h2">{title}</h2>
      </div>

      <div ref={ref}>
        {cards.map((card, i) => {
          const meta = META[i % META.length];
          // cards behind shrink as later cards arrive
          const target = 1 - (total - 1 - i) * 0.05;
          const start = i / total;
          const local = progress <= start ? 0 : (progress - start) / (1 - start);
          const scale = 1 - (1 - target) * Math.min(1, local);
          return (
            <div key={card.title} className="lp-stack-slot">
              <article className="lp-stack-card" style={{ top: i * 26, transform: `scale(${scale})`, backgroundColor: meta.color }}>
                <div className="lp-stack-text">
                  <span className="lp-stack-num">0{i + 1}</span>
                  <div>
                    <h3>{card.title}</h3>
                    <p>{card.text}</p>
                  </div>
                </div>
                <div className="lp-stack-media">
                  <img src={meta.img} alt="" loading="lazy" />
                  <div style={{ backgroundColor: meta.color }} />
                </div>
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
}
