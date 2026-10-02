// Full-screen logo reveal played once after signing in, before the platform
// opens. Skippable; falls straight through if the video can't play or the
// user prefers reduced motion.
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

const FADE_MS = 450;

export function IntroVideo({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLVideoElement>(null);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    setTimeout(onDone, FADE_MS);
  };

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      done.current = true;
      onDone();
      return;
    }
    ref.current?.play().catch(finish);
    const safety = setTimeout(finish, 9000); // never get stuck on the intro
    return () => clearTimeout(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`intro ${leaving ? 'leaving' : ''}`} role="presentation">
      <video ref={ref} src="/video/intro.mp4" muted playsInline autoPlay preload="auto" onEnded={finish} onError={finish} />
      <button type="button" className="intro-skip" onClick={finish}>
        {t('intro.skip')}
      </button>
    </div>
  );
}
