"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../../lib/supabase/server";

export async function createAssessment(formData: FormData) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("assessment_type") ?? "");
  const yearId = String(formData.get("academic_year_id") ?? "");
  const termId = String(formData.get("term_id") ?? "") || null;
  const classId = String(formData.get("class_id") ?? "");
  const date = String(formData.get("assessment_date") ?? "") || null;
  const learningAreaIds = formData.getAll("learning_area_ids").map(String).filter(Boolean);
  if (title.length < 2 || !["formative", "summative"].includes(type) || !yearId || !classId || learningAreaIds.length === 0) redirect("/workspace/assessments/new?error=Complete%20all%20required%20fields");
  const { data, error } = await supabase.rpc("create_assessment_with_areas", {
    p_title: title, p_assessment_type: type, p_assessment_date: date,
    p_academic_year_id: yearId, p_term_id: termId, p_class_id: classId, p_learning_area_ids: learningAreaIds,
  });
  if (error || !data) redirect("/workspace/assessments/new?error=Assessment%20could%20not%20be%20created");
  revalidatePath("/workspace");
  revalidatePath("/workspace/assessments");
  redirect(`/workspace/assessments/${data}`);
}
