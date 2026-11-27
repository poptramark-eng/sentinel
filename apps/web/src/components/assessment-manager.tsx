"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Year={id:string;name:string};
type ClassOption={id:string;display_name:string;grade_level:number;academic_year_id:string};
type Term={id:string;name:string;academic_year_id:string};
type Area={id:string;code:string;name:string;grade_level:number|null};
type Assessment={id:string;title:string;assessment_type:string;status:string;assessment_date:string|null;class_name:string;year_name:string};

export function AssessmentManager({years,classes,terms,areas,assessments,canManage}:{years:Year[];classes:ClassOption[];terms:Term[];areas:Area[];assessments:Assessment[];canManage:boolean}){
 const router=useRouter();const [title,setTitle]=useState("");const [type,setType]=useState("formative");const [yearId,setYearId]=useState(years[0]?.id??"");const [classId,setClassId]=useState(classes.find(c=>c.academic_year_id===years[0]?.id)?.id??"");const [termId,setTermId]=useState("");const [date,setDate]=useState("");const [selected,setSelected]=useState<string[]>([]);const [error,setError]=useState("");const [saving,setSaving]=useState(false);
 const classOptions=classes.filter(c=>c.academic_year_id===yearId);
 const activeClass=classes.find(c=>c.id===classId);
 const areaOptions=useMemo(()=>areas.filter(a=>a.grade_level===null||a.grade_level===activeClass?.grade_level),[areas,activeClass?.grade_level]);
 const termOptions=terms.filter(t=>t.academic_year_id===yearId);

 function toggleArea(id:string){setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);}

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError("");setSaving(true);
  try{
   const supabase=createClient();
   const {data,error:rpcError}=await supabase.rpc("create_assessment_with_areas",{
    p_title:title.trim(),p_assessment_type:type,p_assessment_date:date||null,p_academic_year_id:yearId,
    p_term_id:termId||null,p_class_id:classId,p_learning_area_ids:selected
   });
   if(rpcError)throw rpcError;
   if(!data)throw new Error("Assessment was not created.");
   router.push("/assessments/"+data);router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not create the assessment.");}
  finally{setSaving(false);}
 }

 return <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
 {canManage?<section className="cbe-panel h-fit p-5"><p className="cbe-eyebrow">Internal assessment</p><h2 className="mt-2 text-lg font-semibold">Create assessment</h2>
 {years.length===0||classes.length===0||areas.length===0?<p className="mt-4 rounded-xl bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning)]">Configure an academic year, classes and learning areas before creating an assessment.</p>:<form onSubmit={submit} className="mt-5 space-y-4">
 <div><label htmlFor="assessment-title" className="mb-1.5 block text-xs font-semibold">Assessment name</label><input id="assessment-title" required value={title} onChange={e=>setTitle(e.target.value)} className="cbe-field" placeholder="e.g. Term 1 assessment"/></div>
 <div className="grid grid-cols-2 gap-3"><div><label htmlFor="assessment-type" className="mb-1.5 block text-xs font-semibold">Type</label><select id="assessment-type" value={type} onChange={e=>setType(e.target.value)} className="cbe-field"><option value="formative">Formative</option><option value="summative">Summative</option></select></div><div><label htmlFor="assessment-date" className="mb-1.5 block text-xs font-semibold">Date <span className="font-normal text-[var(--subtle)]">Optional</span></label><input id="assessment-date" type="date" value={date} onChange={e=>setDate(e.target.value)} className="cbe-field"/></div></div>
 <div><label htmlFor="assessment-year" className="mb-1.5 block text-xs font-semibold">Academic year</label><select id="assessment-year" value={yearId} onChange={e=>{setYearId(e.target.value);const next=classes.find(c=>c.academic_year_id===e.target.value);setClassId(next?.id??"");setTermId("");setSelected([]);}} className="cbe-field">{years.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
 <div><label htmlFor="assessment-class" className="mb-1.5 block text-xs font-semibold">Class / stream</label><select id="assessment-class" value={classId} onChange={e=>{setClassId(e.target.value);setSelected([]);}} className="cbe-field">{classOptions.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select></div>
 <div><label htmlFor="assessment-term" className="mb-1.5 block text-xs font-semibold">Term <span className="font-normal text-[var(--subtle)]">Optional</span></label><select id="assessment-term" value={termId} onChange={e=>setTermId(e.target.value)} className="cbe-field"><option value="">No term selected</option>{termOptions.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
 <fieldset><legend className="mb-2 text-xs font-semibold">Learning areas</legend><div className="grid gap-2 sm:grid-cols-2">{areaOptions.map(a=><label key={a.id} className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2.5 text-xs"><input type="checkbox" checked={selected.includes(a.id)} onChange={()=>toggleArea(a.id)} className="size-4 accent-[var(--brand)]"/><span>{a.name}</span></label>)}</div></fieldset>
 {error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>:null}
 <button disabled={saving||!classId||!yearId||selected.length===0} className="cbe-button cbe-button-primary w-full">{saving?"Creating…":"Create assessment and open marks"}</button>
 </form>}
 </section>:null}
 <section className="cbe-panel overflow-hidden"><div className="border-b border-[var(--line)] p-5"><p className="cbe-eyebrow">Assessment register</p><h2 className="mt-2 text-lg font-semibold">School assessments</h2><p className="mt-1 text-xs text-[var(--muted)]">{assessments.length} assessments</p></div>
 {assessments.length?<div className="divide-y divide-[var(--line)]">{assessments.map(a=><button key={a.id} onClick={()=>router.push("/assessments/"+a.id)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-[var(--surface-subtle)]"><div><p className="text-sm font-semibold">{a.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{a.class_name} · {a.year_name} · {a.assessment_type}</p></div><span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[10px] font-semibold capitalize text-[var(--brand-strong)]">{a.status}</span></button>)}</div>:<div className="p-8 text-center"><p className="text-sm font-semibold">No assessments yet</p><p className="mt-1 text-xs text-[var(--muted)]">Create an internal assessment for one of your classes.</p></div>}
 </section></div>;
}
