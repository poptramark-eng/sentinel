import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getChildDataProcessingMode(supabase: ServerSupabaseClient): Promise<"all" | "synthetic_only" | "disabled"> {
  const { data, error } = await supabase.rpc("child_data_processing_mode");
  if (error || (data !== "all" && data !== "synthetic_only")) return "disabled";
  return data;
}

export async function isChildDataProcessingEnabled(supabase: ServerSupabaseClient): Promise<boolean> {
  return (await getChildDataProcessingMode(supabase)) !== "disabled";
}

export async function requireChildDataProcessing(supabase: ServerSupabaseClient): Promise<void> {
  if (!(await isChildDataProcessingEnabled(supabase))) {
    redirect("/workspace?notice=child-data-disabled");
  }
}
