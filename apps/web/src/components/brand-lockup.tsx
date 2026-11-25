import Link from "next/link";

interface BrandLockupProps {
  href?: string;
  descriptor?: string;
  compact?: boolean;
}

export function BrandLockup({
  href = "/",
  descriptor = "by Softflix",
  compact = false,
}: BrandLockupProps) {
  return (
    <Link href={href} className="inline-flex w-fit items-center gap-3" aria-label="cbe by Softflix">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold tracking-tight text-white shadow-sm">
        cbe
      </span>
      {!compact ? (
        <span className="min-w-0">
          <span className="block text-sm font-bold tracking-tight text-[var(--ink-strong)]">cbe</span>
          <span className="block text-[11px] text-[var(--muted)]">{descriptor}</span>
        </span>
      ) : null}
    </Link>
  );
}
