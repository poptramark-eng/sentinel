"use server";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";

export async function createAssessment(formData: FormData) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("assessment_type") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  const date = String(formData.get("assessment_date") ?? "") || null;
  const learningAreaIds = formData.getAll("learning_area_ids").map(String).filter(Boolean);
  if (title.length < 2 || !["formative", "summative"].includes(type) || !classId || learningAreaIds.length === 0) redirect("/workspace/assessments/new?error=Complete%20all%20required%20fields");
  const { data: selectedClass } = await supabase.from("classes").select("academic_year_id").eq("id", classId).maybeSingle();
  if (!selectedClass?.academic_year_id) redirect("/workspace/assessments/new?error=Choose%20a%20valid%20class");
  const { data, error } = await supabase.rpc("create_assessment_with_areas", {
    p_title: title, p_assessment_type: type, p_assessment_date: date,
    p_academic_year_id: selectedClass.academic_year_id, p_term_id: null, p_class_id: classId, p_learning_area_ids: learningAreaIds,
  });
  if (error || !data) redirect("/workspace/assessments/new?error=Assessment%20could%20not%20be%20created");

  redirect(`/workspace/assessments/${data}`);
}
