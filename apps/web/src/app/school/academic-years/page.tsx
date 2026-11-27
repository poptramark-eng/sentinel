import { redirect } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { SignOutButton } from "../../../components/sign-out-button";
import { AcademicYearManager } from "../../../components/academic-year-manager";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AcademicYearsPage(){
 const supabase=await createClient();
 const {data:claims}=await supabase.auth.getClaims();
 if(!claims?.claims?.sub) redirect("/login");
 const userId=claims.claims.sub as string;
 const {data:membership}=await supabase.from("school_memberships").select("school_id,role").eq("user_id",userId).eq("status","active").maybeSingle();
 if(!membership) redirect("/setup");
 const {data:years}=await supabase.from("academic_years").select("id,name,starts_on,ends_on,is_current").eq("school_id",membership.school_id).order("starts_on",{ascending:false});
 return <WorkspaceShell section="School workspace" title="Academic years" navigation={[
  {label:"Overview",href:"/workspace"},{label:"Learners",href:"/learners"},{label:"Classes",href:"/classes"},{label:"Assessments",href:"/assessments"},{label:"Learning areas",href:"/school/learning-areas"},{label:"School settings",href:"/school/settings"}
 ]} actions={<SignOutButton/>}>
 <div className="mb-7"><p className="cbe-eyebrow">School configuration</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Academic years and terms</h1><p className="mt-2 text-sm text-[var(--muted)]">Set the school calendar used by classes, learner enrolments and assessments.</p></div>
 <AcademicYearManager years={years??[]} canManage={membership.role==="school_admin"}/>
 </WorkspaceShell>;
}
