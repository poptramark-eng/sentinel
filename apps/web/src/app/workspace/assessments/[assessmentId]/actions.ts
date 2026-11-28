"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { requireChildDataProcessing } from "../../../../lib/child-data";

async function getWorkflowContext(formData: FormData) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  await requireChildDataProcessing(supabase);
  const assessmentId = String(formData.get("assessment_id") ?? "");
  if (!assessmentId) redirect("/workspace/assessments");
  return { supabase, assessmentId };
}

export async function saveAssessmentScore(formData: FormData) {
  const { supabase, assessmentId } = await getWorkflowContext(formData);
  const learnerId = String(formData.get("learner_id") ?? "");
  const learningAreaId = String(formData.get("learning_area_id") ?? "");
  const rawScore = String(formData.get("score") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!learnerId || !learningAreaId || rawScore === "") redirect("/workspace/assessments");
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

export async function submitAssessment(formData: FormData) {
  const { supabase, assessmentId } = await getWorkflowContext(formData);
  const { error } = await supabase.rpc("submit_assessment", { p_assessment_id: assessmentId });
  if (error) redirect(`/workspace/assessments/${assessmentId}?error=Submission%20blocked.%20Complete%20every%20required%20mark%20and%20confirm%20your%20class%20assignment.`);
  redirect(`/workspace/assessments/${assessmentId}?submitted=1`);
}

export async function reviewAssessment(formData: FormData) {
  const { supabase, assessmentId } = await getWorkflowContext(formData);
  const notes = String(formData.get("notes") ?? "").trim();
  const { error } = await supabase.rpc("review_assessment", { p_assessment_id: assessmentId, p_notes: notes || null });
  if (error) redirect(`/workspace/assessments/${assessmentId}?error=Assessment%20could%20not%20be%20marked%20reviewed.`);
  redirect(`/workspace/assessments/${assessmentId}?reviewed=1`);
}

export async function approveAssessment(formData: FormData) {
  const { supabase, assessmentId } = await getWorkflowContext(formData);
  const notes = String(formData.get("notes") ?? "").trim();
  const { error } = await supabase.rpc("approve_assessment", { p_assessment_id: assessmentId, p_notes: notes || null });
  if (error) redirect(`/workspace/assessments/${assessmentId}?error=Assessment%20could%20not%20be%20approved.`);
  redirect(`/workspace/assessments/${assessmentId}?approved=1`);
}

export async function publishAssessment(formData: FormData) {
  const { supabase, assessmentId } = await getWorkflowContext(formData);
  const { error } = await supabase.rpc("publish_assessment", { p_assessment_id: assessmentId });
  if (error) redirect(`/workspace/assessments/${assessmentId}?error=Assessment%20could%20not%20be%20published.`);
  redirect(`/workspace/assessments/${assessmentId}?published=1`);
}

export async function returnAssessmentForCorrection(formData: FormData) {
  const { supabase, assessmentId } = await getWorkflowContext(formData);
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) redirect(`/workspace/assessments/${assessmentId}?error=Provide%20a%20correction%20reason.`);
  const { error } = await supabase.rpc("return_assessment_for_correction", { p_assessment_id: assessmentId, p_reason: reason });
  if (error) redirect(`/workspace/assessments/${assessmentId}?error=Assessment%20could%20not%20be%20returned%20for%20correction.`);
  redirect(`/workspace/assessments/${assessmentId}?returned=1`);
}
