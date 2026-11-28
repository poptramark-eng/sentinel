"use server";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export async function assignTeacher(formData: FormData) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  const { data: memberships } = await supabase.from("school_memberships").select("role").limit(1);
  if (memberships?.[0]?.role !== "school_admin") redirect("/workspace");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const classId = String(formData.get("class_id") ?? "");
  const assignmentRole = String(formData.get("assignment_role") ?? "");
  const learningAreaId = String(formData.get("learning_area_id") ?? "") || null;

  if (!email || !classId || !["class_teacher", "subject_teacher"].includes(assignmentRole)) {
    redirect("/workspace/teachers?error=Complete%20the%20required%20fields");
  }
  if (assignmentRole === "class_teacher" && learningAreaId) {
    redirect("/workspace/teachers?error=Class%20teacher%20assignments%20do%20not%20use%20a%20learning%20area");
  }
  if (assignmentRole === "subject_teacher" && !learningAreaId) {
    redirect("/workspace/teachers?error=Choose%20a%20learning%20area%20for%20a%20subject%20teacher");
  }

  const { error } = await supabase.rpc("assign_teacher_by_email", {
    p_email: email,
    p_class_id: classId,
    p_assignment_role: assignmentRole,
    p_learning_area_id: learningAreaId,
  });
  if (error) {
    redirect("/workspace/teachers?error=Teacher%20could%20not%20be%20assigned.%20Confirm%20the%20account%20exists%20and%20is%20verified.");
  }
  redirect("/workspace/teachers?saved=1");
}
