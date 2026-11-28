import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function isChildDataProcessingEnabled(supabase: ServerSupabaseClient): Promise<boolean> {
  // An explicit deployment-level false remains a kill switch. When the
  // build/runtime does not expose this optional flag, the database-owner
  // managed control remains authoritative (and defaults to false).
  if (process.env.CHILD_DATA_PROCESSING_ENABLED === "false") {
    return false;
  }

  const { data, error } = await supabase.rpc("child_data_processing_is_enabled");
  return !error && data === true;
}

export async function requireChildDataProcessing(supabase: ServerSupabaseClient): Promise<void> {
  if (!(await isChildDataProcessingEnabled(supabase))) {
    redirect("/workspace?notice=child-data-disabled");
  }
}
