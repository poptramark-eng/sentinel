"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLockup } from "../../components/brand-lockup";
import { createClient } from "../../lib/supabase/client";

type AuthUser = { id: string; email?: string };

export default function SetupPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [stage, setStage] = useState<"account" | "school">("account");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [county, setCounty] = useState("");
  const [subCounty, setSubCounty] = useState("");
  const [phone, setPhone] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");

  useEffect(() => {
    let active = true;
    async function loadUser() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        if (data.user) {
          setUser({ id: data.user.id, email: data.user.email });
          setStage("school");
          const { data: membership } = await supabase.from("school_memberships").select("school_id").eq("status", "active").maybeSingle();
          if (membership) router.replace("/workspace");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to connect to the school service.");
      } finally {
        if (active) setChecking(false);
      }
    }
    void loadUser();
    return () => { active = false; };
  }, [router]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (signUpError) throw signUpError;
      if (data.session && data.user) {
        setUser({ id: data.user.id, email: data.user.email });
        setStage("school");
        setMessage("Account created. Complete your school profile to open the workspace.");
      } else {
        setMessage("Check your email to confirm your account. Once confirmed, sign in and return here to finish school setup.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not create your account.");
    } finally {
      setLoading(false);
    }
  }

  async function createSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: setupError } = await supabase.rpc("bootstrap_school", {
        school_name: schoolName.trim(),
        school_code: schoolCode.trim() || null,
        school_county: county.trim() || null,
        school_sub_county: subCounty.trim() || null,
        school_phone: phone.trim() || null,
        school_email: schoolEmail.trim() || null,
      });
      if (setupError) throw setupError;
      if (!data) throw new Error("School setup did not return a school identifier.");
      router.replace("/workspace");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not save the school profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between"><BrandLockup /><Link href="/login" className="text-sm font-semibold text-[var(--brand)]">Sign in</Link></div>
        <section className="mt-10 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-card)] sm:p-9">
          <p className="cbe-eyebrow">First-time setup</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">Start your school workspace.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">Create the first administrator account, then register the school profile. This installation is configured for one school; the data model keeps school ownership explicit for future expansion.</p>
          <div className="mt-7 flex items-center gap-3 text-xs font-semibold">
            <span className={stage === "account" ? "rounded-full bg-[var(--brand-soft)] px-3 py-2 text-[var(--brand-strong)]" : "rounded-full bg-[var(--surface-subtle)] px-3 py-2 text-[var(--muted)]"}>1 · Admin account</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
            <span className={stage === "school" ? "rounded-full bg-[var(--brand-soft)] px-3 py-2 text-[var(--brand-strong)]" : "rounded-full bg-[var(--surface-subtle)] px-3 py-2 text-[var(--muted)]"}>2 · School profile</span>
          </div>

          {checking ? <p className="mt-8 text-sm text-[var(--muted)]">Checking your account…</p> : null}
          {!checking && stage === "account" ? (
            <form onSubmit={createAccount} className="mt-8 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><label htmlFor="admin-name" className="mb-2 block text-sm font-medium">Administrator full name</label><input id="admin-name" required value={displayName} onChange={e=>setDisplayName(e.target.value)} className="cbe-field" placeholder="Full name" /></div>
              <div className="sm:col-span-2"><label htmlFor="admin-email" className="mb-2 block text-sm font-medium">Work email</label><input id="admin-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="cbe-field" placeholder="admin@school.ac.ke" /></div>
              <div className="sm:col-span-2"><label htmlFor="admin-password" className="mb-2 block text-sm font-medium">Password</label><input id="admin-password" type="password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} className="cbe-field" placeholder="At least 12 characters" /><p className="mt-1 text-xs text-[var(--subtle)]">Use a unique password with at least 12 characters.</p></div>
              <div className="sm:col-span-2"><button disabled={loading} className="cbe-button cbe-button-primary w-full">{loading ? "Creating account…" : "Create administrator account"}</button></div>
            </form>
          ) : null}

          {!checking && stage === "school" ? (
            <form onSubmit={createSchool} className="mt-8 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><label htmlFor="school-name" className="mb-2 block text-sm font-medium">School name</label><input id="school-name" required minLength={2} value={schoolName} onChange={e=>setSchoolName(e.target.value)} className="cbe-field" placeholder="Enter the official school name" /></div>
              <div><label htmlFor="school-code" className="mb-2 block text-sm font-medium">School code <span className="font-normal text-[var(--subtle)]">Optional</span></label><input id="school-code" value={schoolCode} onChange={e=>setSchoolCode(e.target.value)} className="cbe-field" placeholder="Official code" /></div>
              <div><label htmlFor="county" className="mb-2 block text-sm font-medium">County</label><input id="county" value={county} onChange={e=>setCounty(e.target.value)} className="cbe-field" placeholder="County" /></div>
              <div><label htmlFor="sub-county" className="mb-2 block text-sm font-medium">Sub-county</label><input id="sub-county" value={subCounty} onChange={e=>setSubCounty(e.target.value)} className="cbe-field" placeholder="Sub-county" /></div>
              <div><label htmlFor="school-phone" className="mb-2 block text-sm font-medium">School phone</label><input id="school-phone" value={phone} onChange={e=>setPhone(e.target.value)} className="cbe-field" placeholder="+254…" /></div>
              <div className="sm:col-span-2"><label htmlFor="school-email" className="mb-2 block text-sm font-medium">School email</label><input id="school-email" type="email" value={schoolEmail} onChange={e=>setSchoolEmail(e.target.value)} className="cbe-field" placeholder="office@school.ac.ke" /></div>
              <div className="sm:col-span-2"><button disabled={loading} className="cbe-button cbe-button-primary w-full">{loading ? "Setting up school…" : "Create school workspace"}</button></div>
            </form>
          ) : null}

          {message ? <p role="status" className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</p> : null}
          {error ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <p className="mt-7 border-t border-[var(--line)] pt-5 text-xs leading-5 text-[var(--subtle)]">Only the first authenticated user can initialise this school installation. Staff invitations and learner accounts are intentionally separate; learners do not sign in.</p>
        </section>
      </div>
    </main>
  );
}
