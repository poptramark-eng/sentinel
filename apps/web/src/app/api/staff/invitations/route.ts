import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  let body: { email?: unknown; displayName?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { data, error } = await supabase.functions.invoke("provision-staff", {
    body: { email: body.email, displayName: body.displayName, role: body.role },
  });

  if (error || !data) {
    return NextResponse.json(
      { error: data?.error ?? "Staff account provisioning is temporarily unavailable." },
      { status: error?.context?.status ?? 502 },
    );
  }

  if (data.error) {
    return NextResponse.json({ error: data.error }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
