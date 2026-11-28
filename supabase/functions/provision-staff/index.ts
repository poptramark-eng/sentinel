import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://sentinel.poptramark.workers.dev",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function keyFromJson(name: string): string | undefined {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;
  try {
    const values = JSON.parse(raw) as Record<string, string>;
    return values.default;
  } catch {
    return undefined;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response(405, { error: "Method not allowed" });

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return response(401, { error: "Sign in is required." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? keyFromJson("SUPABASE_PUBLISHABLE_KEYS");
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? keyFromJson("SUPABASE_SECRET_KEYS");
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return response(503, { error: "Staff account provisioning is not configured." });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userResult.user) return response(401, { error: "Your session is invalid or expired." });

  const { data: membership, error: membershipError } = await userClient
    .from("school_memberships")
    .select("school_id, role, status")
    .eq("user_id", userResult.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError || !membership || membership.role !== "school_admin") {
    return response(403, { error: "Only the School Administrator can create staff accounts." });
  }

  let payload: { email?: unknown; displayName?: unknown; role?: unknown };
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "Invalid request body." });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response(400, { error: "Enter a valid staff email address." });
  }
  if (displayName.length < 2 || displayName.length > 120) {
    return response(400, { error: "Enter the staff member's name." });
  }
  const role = payload.role;
  if (role !== "class_teacher" && role !== "subject_teacher") {
    return response(400, { error: "Choose a valid teacher role." });
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const appOrigin = "https://sentinel.poptramark.workers.dev";
  const { data: invite, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { display_name: displayName } },
  });

  if (inviteError || !invite.user || !invite.properties?.hashed_token) {
    return response(409, { error: "The account could not be created. Check whether this email already has an account." });
  }

  const setupUrl = new URL("/auth/callback", appOrigin);
  setupUrl.searchParams.set("token_hash", invite.properties.hashed_token);
  setupUrl.searchParams.set("type", "invite");
  setupUrl.searchParams.set("next", "/login?invite=accepted");

  const { error: membershipInsertError } = await admin.from("school_memberships").insert({
    school_id: membership.school_id,
    user_id: invite.user.id,
    role,
    status: "active",
  });
  if (membershipInsertError) {
    await admin.auth.admin.deleteUser(invite.user.id);
    return response(500, { error: "The staff account could not be linked to this school." });
  }

  const { error: auditError } = await admin.from("audit_events").insert({
    school_id: membership.school_id,
    actor_id: userResult.user.id,
    action: "staff.account_invitation_created",
    entity_type: "user",
    entity_id: invite.user.id,
    details: { email, display_name: displayName, role, delivery: "manual_link" },
  });
  if (auditError) {
    await admin.from("school_memberships").delete().eq("school_id", membership.school_id).eq("user_id", invite.user.id);
    await admin.auth.admin.deleteUser(invite.user.id);
    return response(500, { error: "The invitation could not be recorded. No staff account was retained." });
  }

  return response(201, {
    email,
    displayName,
    role,
    actionLink: setupUrl.toString(),
    message: "Account created. Copy the one-time setup link and share it with the staff member using your usual secure channel. Sentinel has not sent an email or message.",
  });
});
