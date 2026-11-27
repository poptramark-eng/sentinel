"use server";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

async function requireSchoolAdmin() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  if (error || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("school_id,role").limit(1);
  const membership = memberships?.[0];
  if (!membership || membership.role !== "school_admin") redirect("/workspace");
  return { supabase, schoolId: membership.school_id };
}

export async function createAcademicYear(formData: FormData) {
  const { supabase } = await requireSchoolAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "");
  if (name.length < 2 || !startsOn || !endsOn || endsOn < startsOn) redirect("/workspace/settings?error=Check%20the%20academic%20year%20details");
  const { error } = await supabase.rpc("create_academic_year_with_terms", { p_name: name, p_starts_on: startsOn, p_ends_on: endsOn });
  if (error) redirect("/workspace/settings?error=Academic%20year%20could%20not%20be%20created");
redirect("/workspace/settings?saved=year");
}

export async function createClass(formData: FormData) {
  const { supabase, schoolId } = await requireSchoolAdmin();
  const yearId = String(formData.get("academic_year_id") ?? "");
  const grade = Number(formData.get("grade_level"));
  const stream = String(formData.get("stream") ?? "A").trim().toUpperCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!yearId || !Number.isInteger(grade) || grade < 1 || grade > 9 || !displayName || displayName.length > 80) redirect("/workspace/settings?error=Check%20the%20class%20details");
  const { error } = await supabase.from("classes").insert({ school_id: schoolId, academic_year_id: yearId, grade_level: grade, stream: stream || "A", display_name: displayName, is_active: true });
  if (error) redirect("/workspace/settings?error=Class%20could%20not%20be%20created.%20Check%20for%20duplicates.");
redirect("/workspace/settings?saved=class");
}

export async function createLearningArea(formData: FormData) {
  const { supabase, schoolId } = await requireSchoolAdmin();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const rawGrade = String(formData.get("grade_level") ?? "");
  const grade = rawGrade ? Number(rawGrade) : null;
  if (!code || code.length > 30 || name.length < 2 || name.length > 120 || (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 9))) redirect("/workspace/settings?error=Check%20the%20learning%20area%20details");
  const { error } = await supabase.from("learning_areas").insert({ school_id: schoolId, code, name, grade_level: grade, is_active: true });
  if (error) redirect("/workspace/settings?error=Learning%20area%20could%20not%20be%20created.%20Check%20for%20duplicate%20codes.");
redirect("/workspace/settings?saved=area");
}
