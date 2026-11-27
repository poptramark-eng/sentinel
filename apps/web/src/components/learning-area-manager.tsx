"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Area = { id: string; code: string; name: string; grade_level: number | null };

export function LearningAreaManager({ schoolId, areas, canManage }: { schoolId: string; areas: Area[]; canManage: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [grade, setGrade] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("learning_areas").insert({
        school_id: schoolId, name: name.trim(), code: code.trim().toUpperCase(),
        grade_level: grade ? Number(grade) : null,
      });
      if (insertError) throw insertError;
      setName(""); setCode(""); setGrade(""); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this learning area.");
    } finally { setSaving(false); }
  }

  return <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
    {canManage ? <section className="cbe-panel h-fit p-5">
      <p className="cbe-eyebrow">Curriculum setup</p><h2 className="mt-2 text-lg font-semibold">Add learning area</h2>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div><label htmlFor="area-name" className="mb-2 block text-xs font-semibold">Learning area name</label><input id="area-name" value={name} onChange={e => setName(e.target.value)} required className="cbe-field" placeholder="e.g. Mathematics" /></div>
        <div><label htmlFor="area-code" className="mb-2 block text-xs font-semibold">Short code</label><input id="area-code" value={code} onChange={e => setCode(e.target.value)} required maxLength={20} className="cbe-field" placeholder="e.g. MAT" /></div>
        <div><label htmlFor="area-grade" className="mb-2 block text-xs font-semibold">Grade <span className="font-normal text-[var(--subtle)]">Optional · blank means shared</span></label><select id="area-grade" value={grade} onChange={e => setGrade(e.target.value)} className="cbe-field"><option value="">All applicable grades</option>{Array.from({ length: 9 }, (_, i) => i + 1).map(g => <option key={g} value={g}>Grade {g}</option>)}</select></div>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
        <button disabled={saving} className="cbe-button cbe-button-primary w-full">{saving ? "Saving…" : "Add learning area"}</button>
        <p className="text-xs leading-5 text-[var(--subtle)]">Use the school’s approved curriculum. No competency-level boundaries or learning areas are pre-filled from guesses.</p>
      </form>
    </section> : null}
    <section className="cbe-panel overflow-hidden">
      <div className="border-b border-[var(--line)] p-5"><p className="cbe-eyebrow">Curriculum catalogue</p><h2 className="mt-2 text-lg font-semibold">Learning areas</h2><p className="mt-1 text-xs text-[var(--muted)]">{areas.length} configured</p></div>
      {areas.length ? <div className="divide-y divide-[var(--line)]">{areas.map(area => <div key={area.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-semibold">{area.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{area.code}</p></div><span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)]">{area.grade_level ? "Grade " + area.grade_level : "Shared"}</span></div>)}</div> : <div className="p-8 text-center"><p className="text-sm font-semibold">No learning areas configured</p><p className="mt-1 text-xs text-[var(--muted)]">Add the learning areas used by this school.</p></div>}
    </section>
  </div>;
}
