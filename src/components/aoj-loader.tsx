/** AOJ loading mark: a white disc with a red "A" and a spinning red ring. */
export function AojLoader({ size = 64, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="relative grid place-items-center rounded-full bg-white shadow-lift" style={{ width: size, height: size }}>
      <svg className="aoj-spin absolute inset-0" viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <circle cx="32" cy="32" r="29" fill="none" stroke="#FFE0DD" strokeWidth="4" />
        <path d="M32 3 a29 29 0 0 1 29 29" fill="none" stroke="#E5120E" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="font-extrabold leading-none text-brand" style={{ fontSize: size * 0.44 }}>A</span>
    </div>
  );
}
