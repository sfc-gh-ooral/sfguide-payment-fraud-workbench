// Ferrovane logo mark: a hexagon (H3 cells) holding a vane arrow. Inline SVG, no image files.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M16 2.5 28 9.25v13.5L16 29.5 4 22.75V9.25Z" fill="var(--surface)" stroke="var(--signal)" strokeWidth="1.6" />
      <path d="M10 21.5 21.5 10M14.5 10H21.5V17" fill="none" stroke="var(--signal)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="21.5" r="2.2" fill="var(--fraud)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-none">
        <span className="block text-[15px] font-bold tracking-tight">Ferrovane</span>
        <span className="block eyebrow !text-[9px] mt-0.5">Fraud Desk</span>
      </span>
    </span>
  );
}
