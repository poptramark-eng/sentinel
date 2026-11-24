import Link from "next/link";
import type { ReactNode } from "react";

export interface WorkspaceNavItem {
  label: string;
  href: string;
  active?: boolean;
  description?: string;
}

interface WorkspaceShellProps {
  section: string;
  title: string;
  description?: string;
  navigation: WorkspaceNavItem[];
  actions?: ReactNode;
  children: ReactNode;
}

export function WorkspaceShell({
  section,
  title,
  description,
  navigation,
  actions,
  children,
}: WorkspaceShellProps) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <a href="#workspace-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-[var(--brand-strong)] focus:shadow-lg">Skip to main content</a>
      <aside className="print:hidden fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col border-r border-[var(--line)] bg-white lg:flex">
        <Link href="/workspace" className="flex h-[var(--topbar-height)] items-center gap-3 border-b border-[var(--line)] px-5" aria-label="Softflix cbe workspace home">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-[11px] font-bold tracking-wide text-white">cbe</span>
          <span className="min-w-0"><span className="block text-sm font-bold tracking-tight text-[var(--ink-strong)]">cbe</span><span className="block text-[10px] text-[var(--muted)]">by Softflix</span></span>
        </Link>
        <div className="px-4 pt-6">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--subtle)]">{section}</p>
          <nav aria-label="Workspace navigation" className="mt-3 space-y-1">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}
                className={item.active
                  ? "flex items-center gap-3 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-2.5 text-sm font-semibold text-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]"
                  : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]"}>
                <span className={item.active ? "size-1.5 rounded-full bg-[var(--brand)]" : "size-1.5 rounded-full bg-[var(--line-strong)]"} />
                <span className="min-w-0 flex-1">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto border-t border-[var(--line)] p-4">
          <div className="rounded-xl bg-[var(--surface-subtle)] p-3">
            <p className="text-xs font-semibold text-[var(--ink)]">Assessment operations</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">A coordinated workspace for trusted assessment records and results.</p>
          </div>
          <p className="px-1 pt-3 text-[10px] text-[var(--subtle)]">SOFTFLIX · CBE PLATFORM</p>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[var(--sidebar-width)]">
        <header className="print:hidden sticky top-0 z-20 flex min-h-[var(--topbar-height)] items-center justify-between gap-4 border-b border-[var(--line)] bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/workspace" className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand)] text-[11px] font-bold text-white lg:hidden">cbe</Link>
            <div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{section}</p><p className="truncate text-sm font-semibold text-[var(--ink-strong)]">{title}</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </header>
        <main id="workspace-main" tabIndex={-1} className="mx-auto w-full max-w-[var(--content-max)] px-4 py-7 outline-none sm:px-7 sm:py-9">
          {description ? <div className="mb-6 max-w-3xl"><p className="text-sm leading-6 text-[var(--muted)]">{description}</p></div> : null}
          <nav aria-label="Mobile workspace navigation" className="print:hidden mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navigation.map((item) => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={item.active ? "shrink-0 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-xs font-semibold text-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]" : "shrink-0 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-[var(--muted)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]"}>{item.label}</Link>)}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
