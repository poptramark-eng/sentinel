"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Year = { id: string; name: string; starts_on: string; ends_on: string; is_current: boolean };

export function AcademicYearManager({ years, canManage }: { years: Year[]; canManage: boolean }) {
  const router = useRouter();
  const [name,setName]=useState(String(new Date().getFullYear()));
  const [starts,setStarts]=useState("");
  const [ends,setEnds]=useState("");
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError("");setSaving(true);
    try{
      const supabase=createClient();
      const {error:rpcError}=await supabase.rpc("create_academic_year_with_terms",{p_name:name.trim(),p_starts_on:starts,p_ends_on:ends});
      if(rpcError) throw rpcError;
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not create the academic year.");}
    finally{setSaving(false);}
  }

  return <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
    {canManage?<section className="cbe-panel h-fit p-5"><p className="cbe-eyebrow">Academic calendar</p><h2 className="mt-2 text-lg font-semibold">Add academic year</h2><form onSubmit={submit} className="mt-5 space-y-4">
      <div><label htmlFor="year-name" className="mb-2 block text-xs font-semibold">Year name</label><input id="year-name" value={name} onChange={e=>setName(e.target.value)} required className="cbe-field" placeholder="2027" /></div>
      <div><label htmlFor="year-start" className="mb-2 block text-xs font-semibold">Start date</label><input id="year-start" type="date" value={starts} onChange={e=>setStarts(e.target.value)} required className="cbe-field" /></div>
      <div><label htmlFor="year-end" className="mb-2 block text-xs font-semibold">End date</label><input id="year-end" type="date" value={ends} onChange={e=>setEnds(e.target.value)} required min={starts||undefined} className="cbe-field" /></div>
      {error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>:null}
      <button disabled={saving} className="cbe-button cbe-button-primary w-full">{saving?"Saving…":"Create year and terms"}</button>
      <p className="text-xs leading-5 text-[var(--subtle)]">Three term records are created automatically. You can set term dates in a later step.</p>
    </form></section>:null}
    <section className="cbe-panel overflow-hidden"><div className="border-b border-[var(--line)] p-5"><p className="cbe-eyebrow">Academic calendar</p><h2 className="mt-2 text-lg font-semibold">Academic years</h2></div>
      {years.length?<div className="divide-y divide-[var(--line)]">{years.map(y=><div key={y.id} className="flex items-center justify-between gap-3 p-5"><div><p className="text-sm font-semibold">{y.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{y.starts_on} – {y.ends_on}</p></div>{y.is_current?<span className="rounded-full bg-[var(--success-soft)] px-3 py-1 text-[10px] font-semibold text-[var(--success)]">Current</span>:<span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-[10px] font-semibold text-[var(--muted)]">Archived / upcoming</span>}</div>)}</div>:<div className="p-8 text-center text-sm text-[var(--muted)]">No academic year has been configured.</div>}
    </section>
  </div>;
}
