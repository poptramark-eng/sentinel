"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Option = { id: string; name: string };
type ClassOption = { id: string; display_name: string; academic_year_id: string };
type LearnerRow = { id: string; admission_number: string; given_name: string; family_name: string; other_names: string | null; gender: string | null; class_name: string; year_name: string };

export function LearnerManager({ years, classes, learners, canManage }: {
  years: Option[]; classes: ClassOption[]; learners: LearnerRow[]; canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [admission, setAdmission] = useState("");
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [other, setOther] = useState("");
  const [gender, setGender] = useState("");
  const [yearId, setYearId] = useState(years[0]?.id ?? "");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return learners;
    return learners.filter(l => [l.admission_number, l.given_name, l.family_name, l.other_names ?? "", l.class_name].join(" ").toLowerCase().includes(q));
  }, [learners, search]);

  const classOptions = classes.filter(c => !yearId || c.academic_year_id === yearId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("create_learner_with_enrollment", {
        p_admission_number: admission.trim(),
        p_given_name: given.trim(),
        p_family_name: family.trim(),
        p_academic_year_id: yearId,
        p_class_id: classId,
        p_other_names: other.trim() || null,
        p_gender: gender || null,
      });
      if (rpcError) throw rpcError;
      setAdmission(""); setGiven(""); setFamily(""); setOther(""); setGender("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not register this learner.");
    } finally { setSaving(false); }
  }

  return <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
    {canManage ? <section className="cbe-panel h-fit p-5">
      <p className="cbe-eyebrow">Learner admission</p><h2 className="mt-2 text-lg font-semibold">Register a learner</h2>
      {years.length === 0 || classes.length === 0 ? <div className="mt-4 rounded-xl bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning)]">Set up an academic year and at least one class before admitting learners.</div> : <form onSubmit={submit} className="mt-5 space-y-3">
        <div><label htmlFor="admission" className="mb-1.5 block text-xs font-semibold">Admission number</label><input id="admission" required value={admission} onChange={e=>setAdmission(e.target.value)} className="cbe-field" placeholder="e.g. 2026/001" /></div>
        <div className="grid grid-cols-2 gap-3"><div><label htmlFor="given" className="mb-1.5 block text-xs font-semibold">First name</label><input id="given" required value={given} onChange={e=>setGiven(e.target.value)} className="cbe-field" /></div><div><label htmlFor="family" className="mb-1.5 block text-xs font-semibold">Family name</label><input id="family" required value={family} onChange={e=>setFamily(e.target.value)} className="cbe-field" /></div></div>
        <div><label htmlFor="other" className="mb-1.5 block text-xs font-semibold">Other names <span className="font-normal text-[var(--subtle)]">Optional</span></label><input id="other" value={other} onChange={e=>setOther(e.target.value)} className="cbe-field" /></div>
        <div><label htmlFor="gender" className="mb-1.5 block text-xs font-semibold">Gender <span className="font-normal text-[var(--subtle)]">Optional</span></label><select id="gender" value={gender} onChange={e=>setGender(e.target.value)} className="cbe-field"><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="undisclosed">Prefer not to say</option></select></div>
        <div><label htmlFor="year" className="mb-1.5 block text-xs font-semibold">Academic year</label><select id="year" value={yearId} onChange={e=>{setYearId(e.target.value);const first=classes.find(c=>c.academic_year_id===e.target.value);setClassId(first?.id??"");}} className="cbe-field">{years.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
        <div><label htmlFor="class" className="mb-1.5 block text-xs font-semibold">Class / stream</label><select id="class" value={classId} onChange={e=>setClassId(e.target.value)} required className="cbe-field">{classOptions.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select></div>
        {error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>:null}
        <button disabled={saving || !classId || !yearId} className="cbe-button cbe-button-primary w-full">{saving?"Registering…":"Register learner"}</button>
        <p className="text-xs leading-5 text-[var(--subtle)]">Learners are records, not login accounts. Admission and class placement are saved together.</p>
      </form>}
    </section> : null}
    <section className="cbe-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-5"><div><p className="cbe-eyebrow">Learner register</p><h2 className="mt-2 text-lg font-semibold">Learners</h2><p className="mt-1 text-xs text-[var(--muted)]">{visible.length} of {learners.length} records</p></div><input aria-label="Search learners" value={search} onChange={e=>setSearch(e.target.value)} className="cbe-field max-w-xs" placeholder="Search name or admission no." /></div>
      {visible.length?<div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-wide text-[var(--muted)]"><tr><th className="px-5 py-3 font-semibold">Learner</th><th className="px-5 py-3 font-semibold">Admission no.</th><th className="px-5 py-3 font-semibold">Class</th><th className="px-5 py-3 font-semibold">Year</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{visible.map(l=><tr key={l.id}><td className="px-5 py-4 font-medium">{[l.given_name,l.other_names,l.family_name].filter(Boolean).join(" ")}</td><td className="px-5 py-4 text-[var(--muted)]">{l.admission_number}</td><td className="px-5 py-4">{l.class_name}</td><td className="px-5 py-4 text-[var(--muted)]">{l.year_name}</td></tr>)}</tbody></table></div>:<div className="p-8 text-center"><p className="text-sm font-semibold">{learners.length?"No matching learners":"No learners registered yet"}</p><p className="mt-1 text-xs text-[var(--muted)]">Use the admission form to add your first learner.</p></div>}
    </section>
  </div>;
}
