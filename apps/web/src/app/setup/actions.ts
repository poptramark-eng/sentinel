"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export async function bootstrapSchool(formData: FormData) {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims?.sub) redirect("/login");

  const schoolName = String(formData.get("school_name") ?? "").trim();
  if (schoolName.length < 2 || schoolName.length > 160) {
    redirect("/setup?error=Enter%20a%20valid%20school%20name");
  }

  const { error } = await supabase.rpc("bootstrap_school", {
    school_name: schoolName,
    school_code: String(formData.get("school_code") ?? "").trim() || null,
    school_county: String(formData.get("county") ?? "").trim() || null,
    school_sub_county: String(formData.get("sub_county") ?? "").trim() || null,
    school_phone: String(formData.get("phone") ?? "").trim() || null,
    school_email: String(formData.get("contact_email") ?? "").trim() || null,
  });

  if (error) redirect("/setup?error=School%20setup%20could%20not%20be%20completed");
  revalidatePath("/workspace");
  redirect("/workspace");
}
