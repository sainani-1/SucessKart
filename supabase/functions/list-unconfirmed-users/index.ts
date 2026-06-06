import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing required Supabase environment variables.", {
        status: 500,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Missing Authorization bearer token.", {
        status: 401,
        headers: corsHeaders,
      });
    }
    const callerJwt = authHeader.replace("Bearer ", "").trim();

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerData, error: callerError } = await adminClient.auth.getUser(callerJwt);
    if (callerError || !callerData?.user?.id) {
      return new Response("Invalid admin session token.", { status: 401, headers: corsHeaders });
    }

    const callerId = callerData.user.id;
    const { data: callerProfile, error: roleError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", callerId)
      .maybeSingle();

    if (roleError || !callerProfile || callerProfile.role !== "admin") {
      return new Response("Only admin users can list unconfirmed users.", { status: 403, headers: corsHeaders });
    }

    const { data: users, error: usersError } = await adminClient.auth.admin.listUsers();

    if (usersError) {
      return new Response(usersError.message || "Failed to list users.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const unconfirmed = (users?.users || [])
      .filter((u) => !u.email_confirmed_at && !u.confirmed_at)
      .map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        phone: u.phone,
        user_metadata: u.user_metadata,
        last_sign_in_at: u.last_sign_in_at,
      }));

    return new Response(JSON.stringify({ users: unconfirmed, total: unconfirmed.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return new Response(message, { status: 500, headers: corsHeaders });
  }
});
