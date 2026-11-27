import {redirect} from "next/navigation";
import {WorkspaceShell} from "../../components/workspace-shell";
import {SignOutButton} from "../../components/sign-out-button";
import {AssessmentManager} from "../../components/assessment-manager";
import {createClient} from "../../lib/supabase/server";
export const dynamic="force-dynamic";
export default async function AssessmentsPage(){
 const supabase=await createClient();const {data:claims}=await supabase.auth.getClaims();if(!claims?.claims?.sub)redirect("/login");
 const userId=claims.claims.sub as string;const {data:membership}=await supabase.from("school_memberships").select("school_id,role").eq("user_id",userId).eq("status","active").maybeSingle();if(!membership)redirect("/setup");
 const [{data:years},{data:classes},{data:terms},{data:areas},{data:assessments}]=await Promise.all([
  supabase.from("academic_years").select("id,name").eq("school_id",membership.school_id).order("starts_on",{ascending:false}),
  supabase.from("classes").select("id,display_name,grade_level,academic_year_id").eq("school_id",membership.school_id).eq("is_active",true).order("grade_level"),
  supabase.from("terms").select("id,name,academic_year_id").eq("school_id",membership.school_id).order("term_number"),
  supabase.from("learning_areas").select("id,code,name,grade_level").eq("school_id",membership.school_id).eq("is_active",true).order("name"),
  supabase.from("assessments").select("id,title,assessment_type,status,assessment_date,class_id,academic_year_id").eq("school_id",membership.school_id).order("created_at",{ascending:false})
 ]);
 const classMap=new Map((classes??[]).map(c=>[c.id,c.display_name]));const yearMap=new Map((years??[]).map(y=>[y.id,y.name]));
 const mapped=(assessments??[]).map(a=>({...a,class_name:classMap.get(a.class_id)??"Class",year_name:yearMap.get(a.academic_year_id)??"Year"}));
 return <WorkspaceShell section="School workspace" title="Assessments" navigation={[
 {label:"Overview",href:"/workspace"},{label:"Learners",href:"/learners"},{label:"Classes",href:"/classes"},{label:"Assessments",href:"/assessments",active:true},{label:"Learning areas",href:"/school/learning-areas"},{label:"School settings",href:"/school/settings"}
 ]} actions={<SignOutButton/>}>
 <div className="mb-7"><p className="cbe-eyebrow">Academic performance</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Assessments</h1><p className="mt-2 text-sm text-[var(--muted)]">Create internal formative and summative assessments, then collect marks by learning area.</p></div>
 <AssessmentManager years={years??[]} classes={classes??[]} terms={terms??[]} areas={areas??[]} assessments={mapped} canManage={membership.role==="school_admin"}/>
 </WorkspaceShell>;
}
