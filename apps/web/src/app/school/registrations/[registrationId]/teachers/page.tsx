"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, clearStoredCsrfToken } from "../../../../../lib/api";

type Teacher = {
  id: string;
  personId: string;
  name: string;
  email: string | null;
  accountStatus: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  addedAt: string;
};
type TeacherRoster = {
  school: { id: string; name: string };
  council: { id: string; name: string };
  teachers: Teacher[];
};

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
  if (Array.isArray(payload?.message)) return payload.message.join(" ");
  return payload?.message ?? fallback;
}

function statusStyle(status: string): string {
  if (status === "ACTIVE") return "bg-[#e8f6ef] text-[#26744f]";
  if (status === "PENDING") return "bg-[#fff6e8] text-[#9a651f]";
  if (status === "REVOKED") return "bg-[#f1f4f8] text-[#64748b]";
  return "bg-[#fff0f0] text-[#a33b3b]";
}

export default function SchoolTeachersPage() {
  const params = useParams<{ registrationId: string }>();
  const registrationId = params.registrationId;
  const router = useRouter();
  const [roster, setRoster] = useState<TeacherRoster | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRoster = useCallback(async () => {
    const response = await apiRequest(`/school/registrations/${registrationId}/teachers`);
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 403) { router.replace("/workspace"); return; }
    if (!response.ok) throw new Error(await responseMessage(response, "The teacher roster could not be loaded."));
    setRoster((await response.json()) as TeacherRoster);
    setError("");
  }, [registrationId, router]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void loadRoster()
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load the teacher roster."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [loadRoster]);

  async function linkTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await apiRequest(`/school/registrations/${registrationId}/teachers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "The teacher could not be linked."));
      const result = await response.json() as { name: string; email: string | null; action: string };
      setEmail("");
      setNotice(`${result.name} has been linked to this school. A notification was attempted${result.email ? ` for ${result.email}` : ""}.`);
      await loadRoster();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The teacher could not be linked.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8fc]">
      <header className="border-b border-[#e5eaf1] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/workspace" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#2457c5] text-xs font-bold text-white">S</span><span className="text-sm font-semibold text-[#172b4d]">School workspace</span></Link><div className="flex items-center gap-4"><Link href="/school-registration" className="text-xs font-semibold text-[#52647d] hover:text-[#2457c5]">My registrations</Link><button onClick={async () => { await apiRequest("/auth/logout", { method: "POST" }); clearStoredCsrfToken(); router.replace("/login"); }} className="rounded-lg border border-[#dbe3ee] px-3 py-2 text-xs font-semibold text-[#52647d] hover:bg-[#f6f8fb]">Sign out</button></div></div></header>

      <section className="mx-auto max-w-6xl px-5 py-9 sm:px-8">
        <Link href="/workspace" className="text-xs font-semibold text-[#64748b] hover:text-[#2457c5]">← Back to workspace</Link>
        <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2457c5]">School administration</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d]">Teacher roster</h1><p className="mt-2 text-sm leading-6 text-[#64748b]">Link existing global teacher identities to this Council-specific school membership. A teacher can work across multiple schools without creating duplicate identities.</p></div>{roster ? <div className="rounded-xl border border-[#e5eaf1] bg-white px-4 py-3"><p className="text-xs font-semibold text-[#172b4d]">{roster.school.name}</p><p className="mt-1 text-xs text-[#64748b]">{roster.council.name}</p></div> : null}</div>

        {error ? <p role="alert" className="mt-6 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}
        {notice ? <p role="status" className="mt-6 rounded-xl border border-[#cfe9dd] bg-[#f2fbf6] px-4 py-3 text-sm text-[#287653]">{notice}</p> : null}

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_350px]">
          <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-[#172b4d]">Current teachers</h2><span className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#2457c5]">{roster?.teachers.length ?? 0}</span></div>
            {loading ? <p className="mt-6 text-sm text-[#64748b]">Loading teacher roster…</p> : roster?.teachers.length ? <div className="mt-5 divide-y divide-[#edf1f6]">{roster.teachers.map((teacher) => <article key={teacher.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-[#263b5b]">{teacher.name}</p><p className="mt-1 text-xs text-[#8a99ad]">{teacher.email ?? "No verified email on file"} · Account: {teacher.accountStatus.replaceAll("_", " ")}</p><p className="mt-1 text-[11px] text-[#a0acbc]">Added {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(teacher.addedAt))}</p></div><span className={`w-fit rounded-full px-3 py-1 text-[11px] font-semibold ${statusStyle(teacher.status)}`}>{teacher.status}</span></article>)}</div> : <div className="mt-6 rounded-xl border border-dashed border-[#ccd8e8] p-8 text-center"><h3 className="text-sm font-semibold text-[#172b4d]">No teachers linked yet</h3><p className="mt-2 text-xs leading-5 text-[#7b8ba2]">Use the verified email address of an existing teacher identity to add them to this school.</p></div>}
          </section>

          <aside className="h-fit rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-[#172b4d]">Link an existing teacher</h2><p className="mt-2 text-xs leading-5 text-[#7b8ba2]">Enter the email address already verified on the teacher&apos;s Sentinel account. The system links the existing global identity; it does not create another person record.</p><form onSubmit={linkTeacher} className="mt-5 space-y-3"><div><label htmlFor="teacher-email" className="mb-2 block text-xs font-semibold text-[#52647d]">Teacher&apos;s verified email</label><input id="teacher-email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher@example.org" className="w-full rounded-xl border border-[#dbe3ee] px-3.5 py-3 text-sm outline-none focus:border-[#6d94e8] focus:ring-4 focus:ring-[#eaf1ff]" /></div><button disabled={busy || !email.trim()} className="w-full rounded-xl bg-[#2457c5] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1e49a6] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Linking teacher…" : "Link teacher to school"}</button></form><div className="mt-5 rounded-xl bg-[#f7f9fc] p-4"><p className="text-xs font-semibold text-[#52647d]">Identity and access safeguards</p><ul className="mt-2 space-y-2 text-xs leading-5 text-[#7b8ba2]"><li>Only active accounts with verified email addresses can be linked.</li><li>Existing teacher identities are reused across schools.</li><li>Membership changes are audited and the teacher is notified by email when delivery is available.</li><li>New teachers must create and verify their own Sentinel account before a School Administrator can link them. <a href="/register" className="font-semibold text-[#2457c5] hover:underline">Create account</a>.</li></ul></div></aside>
        </div>
      </section>
    </main>
  );
}
