/** Occhio aperto (visibile) o barrato (nascosto). Vettoriale: non dipende dagli emoji del sistema. */
export function EyeIcon({ off = false, size = 16 }: { off?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 12Q12 4 22 12Q12 20 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4L20 20" />}
    </svg>
  );
}
