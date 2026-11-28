"use server";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { requireChildDataProcessing } from "../../../../lib/child-data";

export async function saveAssessmentScore(formData: FormData) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  await requireChildDataProcessing(supabase);
  const assessmentId = String(formData.get("assessment_id") ?? "");
  const learnerId = String(formData.get("learner_id") ?? "");
  const learningAreaId = String(formData.get("learning_area_id") ?? "");
  const rawScore = String(formData.get("score") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!assessmentId || !learnerId || !learningAreaId || rawScore === "") redirect("/workspace/assessments");
  const score = Number(rawScore);
  if (!Number.isFinite(score) || score < 0 || score > 100) redirect(`/workspace/assessments/${assessmentId}?error=Enter%20a%20mark%20between%200%20and%20100`);
  const { error } = await supabase.rpc("save_assessment_score", {
    p_assessment_id: assessmentId,
    p_learner_id: learnerId,
    p_learning_area_id: learningAreaId,
    p_score: score,
    p_reason: reason || null,
  });
  if (error) redirect(`/workspace/assessments/${assessmentId}?error=Mark%20not%20saved.%20Check%20your%20assignment%20and%20correction%20reason.`);

  redirect(`/workspace/assessments/${assessmentId}?saved=1`);
}
