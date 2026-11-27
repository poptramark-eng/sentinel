"use client";

import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="cbe-button cbe-button-secondary min-h-9 px-3 text-xs"
    >
      Sign out
    </button>
  );
}
