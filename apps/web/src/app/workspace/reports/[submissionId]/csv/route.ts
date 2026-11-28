import { createClient } from "../../../../../lib/supabase/server";
import { isChildDataProcessingEnabled } from "../../../../../lib/child-data";
import { assessmentSnapshotToCsv, type AssessmentReportSnapshot } from "../../../../../lib/assessment-report";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await params;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: memberships } = await supabase.from("school_memberships").select("role").limit(1);
  if (memberships?.[0]?.role !== "school_admin") {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await isChildDataProcessingEnabled(supabase))) {
    return new Response("Child-data processing is disabled", { status: 403 });
  }

  const { data: submission, error } = await supabase
    .from("assessment_submissions")
    .select("id,version,status,snapshot")
    .eq("id", submissionId)
    .eq("status", "published")
    .maybeSingle();

  if (error || !submission) {
    return new Response("Published report not found", { status: 404 });
  }

  const snapshot = submission.snapshot as unknown as AssessmentReportSnapshot;
  const csv = assessmentSnapshotToCsv(snapshot);
  const safeTitle = snapshot.assessment.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "assessment";
  const filename = `${safeTitle}-v${submission.version}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
