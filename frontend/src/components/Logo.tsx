// Placeholder wordmark until the final EduSchool logo is ready.
// To use the real logo, replace the contents of these two components only.

export function Logo({ height = 28, title = 'EduSchool' }: { height?: number; title?: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      style={{ display: 'block', fontSize: height * 0.78, lineHeight: `${height}px`, fontWeight: 650, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}
    >
      Edu<span style={{ color: 'var(--primary)' }}>School</span>
    </span>
  );
}

/** Square app icon placeholder. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'grid',
        placeItems: 'center',
        width: size,
        height: size,
        flex: 'none',
        borderRadius: size * 0.24,
        background: 'var(--primary)',
        color: 'var(--on-primary)',
        fontWeight: 700,
        fontSize: size * 0.55,
      }}
    >
      E
    </span>
  );
}
