import Link from "next/link";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`cbe-brand-mark${compact ? " cbe-brand-mark--compact" : ""}`} aria-hidden="true">
      <span>C</span><i />
    </span>
  );
}

export function BrandLockup({
  href = "/",
  className = "",
  showCompany = false,
}: {
  href?: string;
  className?: string;
  showCompany?: boolean;
}) {
  return (
    <Link href={href} className={`cbe-brand-lockup ${className}`.trim()} aria-label="CBE Assessment Management home">
      <BrandMark />
      <span className="cbe-brand-copy">
        <strong>CBE</strong>
        <span>Assessment Management</span>
        {showCompany ? <small>A Softflix product</small> : null}
      </span>
    </Link>
  );
}
