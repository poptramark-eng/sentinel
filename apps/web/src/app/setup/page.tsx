import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { BrandLockup } from "../../components/brand-lockup";
import { bootstrapSchool } from "./actions";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");

  const { data: membership } = await supabase.from("school_memberships").select("id").limit(1).maybeSingle();
  if (membership) redirect("/workspace");
  const params = await searchParams;

  return <main className="min-h-screen bg-[var(--canvas)] px-5 py-8 sm:px-8">
    <div className="mx-auto max-w-2xl">
      <BrandLockup href="/" />
      <div className="mt-12 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-card)] sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand)]">First-time setup</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">Set up your school</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">This creates the first school workspace and assigns the currently signed-in account as School Administrator. This one-time action is available only while the installation has no school.</p>
        {params.error ? <p role="alert" className="mt-5 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{params.error}</p> : null}
        <form action={bootstrapSchool} className="mt-7 grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-2 block text-sm font-medium">School name *</span><input name="school_name" required minLength={2} maxLength={160} className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm outline-none focus:border-[var(--brand)]" placeholder="e.g. Kisii..." /></label>
          <label><span className="mb-2 block text-sm font-medium">School code</span><input name="school_code" maxLength={40} className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" /></label>
          <label><span className="mb-2 block text-sm font-medium">County</span><input name="county" maxLength={100} className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" /></label>
          <label><span className="mb-2 block text-sm font-medium">Sub-county</span><input name="sub_county" maxLength={100} className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" /></label>
          <label><span className="mb-2 block text-sm font-medium">Phone (optional)</span><input name="phone" type="tel" maxLength={30} className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" /></label>
          <label className="sm:col-span-2"><span className="mb-2 block text-sm font-medium">Contact email (stored only)</span><input name="contact_email" type="email" maxLength={254} className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" /><span className="mt-1 block text-xs text-[var(--subtle)]">No email notifications are sent.</span></label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5"><button className="rounded-lg bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]">Create school workspace</button><Link href="/workspace" className="text-sm text-[var(--muted)]">Cancel</Link></div>
        </form>
      </div>
    </div>
  </main>;
}
