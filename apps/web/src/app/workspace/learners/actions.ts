"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";

export async function createLearner(formData: FormData) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("role").limit(1);
  if (!memberships?.length || memberships[0].role !== "school_admin") redirect("/workspace");
  const admission = String(formData.get("admission_number") ?? "").trim();
  const given = String(formData.get("given_name") ?? "").trim();
  const family = String(formData.get("family_name") ?? "").trim();
  const other = String(formData.get("other_names") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const classId = String(formData.get("class_id") ?? "");
  if (!admission || !given || !family || !classId) redirect("/workspace/learners?error=Complete%20the%20required%20fields");
  const { data: selectedClass } = await supabase.from("classes").select("academic_year_id").eq("id", classId).maybeSingle();
  if (!selectedClass?.academic_year_id) redirect("/workspace/learners?error=Choose%20a%20valid%20class");
  const { error } = await supabase.rpc("create_learner_with_enrollment", {
    p_admission_number: admission, p_given_name: given, p_family_name: family,
    p_academic_year_id: selectedClass.academic_year_id, p_class_id: classId, p_other_names: other || null, p_gender: gender,
  });
  if (error) redirect("/workspace/learners?error=Learner%20could%20not%20be%20created.%20Check%20the%20admission%20number.");
  revalidatePath("/workspace"); revalidatePath("/workspace/learners");
  redirect("/workspace/learners?saved=1");
}
