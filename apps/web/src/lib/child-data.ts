import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function isChildDataProcessingEnabled(supabase: ServerSupabaseClient): Promise<boolean> {
  if (process.env.NODE_ENV === "production" && process.env.CHILD_DATA_PROCESSING_ENABLED !== "true") {
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
