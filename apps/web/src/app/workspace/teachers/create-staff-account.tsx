"use client";

import { FormEvent, useState } from "react";

export function CreateStaffAccount() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"class_teacher" | "subject_teacher">("class_teacher");
  const [actionLink, setActionLink] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setActionLink("");
    try {
      const response = await fetch("/api/staff/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create the account.");
      setActionLink(result.actionLink);
      setMessage(result.message);
      setEmail("");
      setDisplayName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the account.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(actionLink);
      setMessage("Setup link copied. Share it with the staff member using your usual secure channel.");
    } catch {
      setError("Could not copy automatically. Select and copy the setup link below.");
    }
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--brand)]">Staff access</p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">Create a teacher account</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Create a Supabase Auth account and generate a one-time setup link. No email or SMS is sent. After the teacher accepts the link, assign them to a class and learning area below.</p>
      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="block"><span className="mb-2 block text-xs font-semibold text-[var(--muted)]">Full name</span><input required minLength={2} maxLength={120} value={displayName} onChange={event=>setDisplayName(event.target.value)} className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" autoComplete="name" /></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-[var(--muted)]">Email address</span><input required type="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} className="w-full rounded-lg border border-[var(--line)] px-3 py-3 text-sm" autoComplete="email" /></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-[var(--muted)]">Teacher role</span><select value={role} onChange={event=>setRole(event.target.value as "class_teacher" | "subject_teacher")} className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm"><option value="class_teacher">Class teacher</option><option value="subject_teacher">Subject teacher</option></select></label>
        <div className="flex items-end"><button disabled={loading} className="w-full rounded-lg bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{loading ? "Creating…" : "Create account"}</button></div>
      </form>
      {error ? <p role="alert" className="mt-4 rounded-lg bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p role="status" className="mt-4 rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">{message}</p> : null}
      {actionLink ? <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] p-4"><label htmlFor="staff-invite-link" className="block text-xs font-semibold text-[var(--muted)]">One-time setup link</label><textarea id="staff-invite-link" readOnly value={actionLink} rows={3} className="mt-2 w-full resize-y rounded-lg border border-[var(--line)] bg-white p-3 text-xs text-[var(--ink)]" /><button type="button" onClick={copyLink} className="mt-3 rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold text-[var(--ink)]">Copy setup link</button></div> : null}
    </section>
  );
}
