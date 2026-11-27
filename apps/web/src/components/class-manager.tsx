"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type AcademicYear = { id: string; name: string };
type SchoolClass = { id: string; display_name: string; grade_level: number; stream: string; academic_year_id: string; year_name?: string };

export function ClassManager({ schoolId, academicYears, initialClasses, canManage }: {
  schoolId: string;
  academicYears: AcademicYear[];
  initialClasses: SchoolClass[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [grade, setGrade] = useState("1");
  const [stream, setStream] = useState("A");
  const [yearId, setYearId] = useState(academicYears[0]?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const supabase = createClient();
      const gradeLevel = Number(grade);
      const streamName = stream.trim().toUpperCase();
      const { error: insertError } = await supabase.from("classes").insert({
        school_id: schoolId,
        academic_year_id: yearId,
        grade_level: gradeLevel,
        stream: streamName,
        display_name: `Grade ${gradeLevel} · ${streamName}`,
      });
      if (insertError) throw insertError;
      setStream("A");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create this class.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      {canManage ? <section className="cbe-panel h-fit p-5">
        <p className="cbe-eyebrow">Class setup</p><h2 className="mt-2 text-lg font-semibold">Create a class</h2>
        {academicYears.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Add an academic year before creating classes.</p> : <form onSubmit={createClass} className="mt-5 space-y-4">
          <div><label htmlFor="academic-year" className="mb-2 block text-xs font-semibold">Academic year</label><select id="academic-year" value={yearId} onChange={e=>setYearId(e.target.value)} required className="cbe-field">{academicYears.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
          <div><label htmlFor="grade" className="mb-2 block text-xs font-semibold">Grade</label><select id="grade" value={grade} onChange={e=>setGrade(e.target.value)} className="cbe-field">{Array.from({length:9},(_,i)=>i+1).map(g=><option key={g} value={g}>Grade {g}</option>)}</select></div>
          <div><label htmlFor="stream" className="mb-2 block text-xs font-semibold">Stream</label><input id="stream" value={stream} onChange={e=>setStream(e.target.value)} required maxLength={12} className="cbe-field" placeholder="A" /></div>
          {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
          <button disabled={saving || !yearId} className="cbe-button cbe-button-primary w-full">{saving ? "Saving…" : "Create class"}</button>
        </form>}
      </section> : null}
      <section className="cbe-panel overflow-hidden">
        <div className="border-b border-[var(--line)] p-5"><p className="cbe-eyebrow">Class register</p><h2 className="mt-2 text-lg font-semibold">Classes and streams</h2><p className="mt-1 text-xs text-[var(--muted)]">{initialClasses.length} class groups configured</p></div>
        {initialClasses.length ? <div className="divide-y divide-[var(--line)]">{initialClasses.map(item=><div key={item.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-semibold">{item.display_name}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.year_name ?? "Academic year"} · Grade {item.grade_level}</p></div><span className="rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--success)]">Active</span></div>)}</div> : <div className="p-8 text-center"><p className="text-sm font-semibold">No classes yet</p><p className="mt-1 text-xs text-[var(--muted)]">Create your first class to start enrolling learners.</p></div>}
      </section>
    </div>
  );
}
