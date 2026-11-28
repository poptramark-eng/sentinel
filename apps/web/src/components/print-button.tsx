"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="no-print rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-subtle)]">
      Print / Save as PDF
    </button>
  );
}
