"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Learner={id:string;admission_number:string;given_name:string;family_name:string};
type Area={id:string;name:string;code:string};
type Score={id:string;learner_id:string;learning_area_id:string;score:number};

export function MarkEntryGrid({assessmentId,learners,areas,scores,allowedAreaIds,canEnter}:{
 assessmentId:string;learners:Learner[];areas:Area[];scores:Score[];allowedAreaIds:string[];canEnter:boolean;
}){
 const router=useRouter();
 const saved=useMemo(()=>new Map(scores.map(s=>[s.learner_id+":"+s.learning_area_id,s])),[scores]);
 const [values,setValues]=useState<Record<string,string>>({});
 const [reasons,setReasons]=useState<Record<string,string>>({});
 const [saving,setSaving]=useState<Record<string,boolean>>({});
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [success,setSuccess]=useState<Record<string,boolean>>({});

 function key(learnerId:string,areaId:string){return learnerId+":"+areaId;}
 function valueFor(learner:Learner,area:Area){const k=key(learner.id,area.id);return values[k]??(saved.get(k)?.score.toString()??"");}

 async function save(learner:Learner,area:Area){
  const k=key(learner.id,area.id);const raw=valueFor(learner,area);const score=Number(raw);
  setErrors(old=>({...old,[k]:""}));setSuccess(old=>({...old,[k]:false}));
  if(raw.trim()===""||!Number.isFinite(score)||score<0||score>100){setErrors(old=>({...old,[k]:"Enter a score from 0 to 100."}));return;}
  const old=saved.get(k);
  if(old&&Number(old.score)===score){setSuccess(old=>({...old,[k]:true}));return;}
  if(old&&(reasons[k]??"").trim().length<3){setErrors(old=>({...old,[k]:"Add a reason for this correction."}));return;}
  setSaving(old=>({...old,[k]:true}));
  try{
   const supabase=createClient();
   const {error}=await supabase.rpc("save_assessment_score",{
    p_assessment_id:assessmentId,p_learner_id:learner.id,p_learning_area_id:area.id,p_score:score,p_reason:old?(reasons[k]??"").trim():null
   });
   if(error)throw error;
   setSuccess(old=>({...old,[k]:true}));setReasons(old=>({...old,[k]:""}));router.refresh();
  }catch(cause){setErrors(old=>({...old,[k]:cause instanceof Error?cause.message:"Could not save this mark."}));}
  finally{setSaving(old=>({...old,[k]:false}));}
 }

 return <div className="cbe-panel overflow-hidden">
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-5"><div><p className="cbe-eyebrow">Mark entry</p><h2 className="mt-2 text-lg font-semibold">Learner results</h2><p className="mt-1 text-xs text-[var(--muted)]">Scores are captured out of 100. Existing marks require a correction reason when changed.</p></div><span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-strong)]">{scores.length} marks saved</span></div>
  {learners.length===0?<div className="p-8 text-center text-sm text-[var(--muted)]">No active learners are enrolled in this class.</div>:areas.length===0?<div className="p-8 text-center text-sm text-[var(--muted)]">No learning areas are assigned to your account for this assessment.</div>:<div className="overflow-x-auto">
   <table className="w-full min-w-[760px] text-left text-xs">
    <thead className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-wide text-[var(--muted)]"><tr><th className="sticky left-0 bg-[var(--surface-subtle)] px-4 py-3">Learner</th><th className="px-3 py-3">Admission</th>{areas.map(a=><th key={a.id} className="min-w-[170px] px-3 py-3">{a.name}</th>)}</tr></thead>
    <tbody className="divide-y divide-[var(--line)]">{learners.map(learner=><tr key={learner.id}>
     <td className="sticky left-0 bg-white px-4 py-3 font-semibold">{learner.given_name} {learner.family_name}</td><td className="px-3 py-3 text-[var(--muted)]">{learner.admission_number}</td>
     {areas.map(area=>{const k=key(learner.id,area.id);const old=saved.get(k);const editable=canEnter&&(allowedAreaIds.length===0||allowedAreaIds.includes(area.id));return <td key={area.id} className="px-3 py-3 align-top">
      {editable?<div className="space-y-1.5"><div className="flex gap-1"><input aria-label={learner.given_name+" "+area.name+" score"} type="number" min="0" max="100" step="0.01" value={valueFor(learner,area)} onChange={e=>setValues(v=>({...v,[k]:e.target.value}))} className="cbe-field min-h-9 w-20 px-2 py-1 text-xs"/><button type="button" disabled={saving[k]} onClick={()=>void save(learner,area)} className="cbe-button cbe-button-secondary min-h-9 px-2 py-1 text-[10px]">{saving[k]?"…":"Save"}</button></div>
       {old&&Number(valueFor(learner,area))!==Number(old.score)?<input aria-label="Correction reason" value={reasons[k]??""} onChange={e=>setReasons(r=>({...r,[k]:e.target.value}))} className="cbe-field min-h-8 px-2 py-1 text-[10px]" placeholder="Reason for correction"/>:null}
       {errors[k]?<p className="max-w-[160px] text-[10px] text-red-600">{errors[k]}</p>:success[k]?<p className="text-[10px] text-emerald-700">Saved</p>:null}
      </div>:<span className="font-semibold tabular-nums">{old?old.score:"—"}</span>}
     </td>})}
    </tr>)}</tbody>
   </table>
  </div>}
 </div>;
}
