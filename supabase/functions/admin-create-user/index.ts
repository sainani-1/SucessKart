import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CreatePayload = {
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  role?: "student" | "teacher" | "admin" | "instructor" | "verifier";
  core_subject?: string | null;
  invite?: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
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
      return new Response("Only admin users can create users.", { status: 403, headers: corsHeaders });
    }

    const body = (await req.json()) as CreatePayload;
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || crypto.randomUUID().slice(0, 12));
    const fullName = String(body.full_name || "").trim();
    const phone = String(body.phone || "").trim();
    const role = (String(body.role || "student").trim().toLowerCase() || "student") as
      | "student"
      | "teacher"
      | "admin"
      | "instructor"
      | "verifier";
    const coreSubject = body.core_subject ? String(body.core_subject).trim() : null;
    const isInvite = body.invite === true;

    if (!email || !fullName || !phone) {
      return new Response("email, full_name and phone are required.", {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (!isInvite && password.length < 6) {
      return new Response("password must be at least 6 characters.", {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (!["student", "teacher", "admin", "instructor", "verifier"].includes(role)) {
      return new Response("role must be student, teacher, instructor, verifier, or admin.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: !isInvite,
      user_metadata: {
        full_name: fullName,
        phone,
        role,
        core_subject: role === "teacher" ? coreSubject : null,
      },
    });

    if (createError || !created?.user?.id) {
      return new Response(createError?.message || "Failed to create auth user.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const newUserId = created.user.id;
    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        id: newUserId,
        auth_user_id: newUserId,
        email,
        full_name: fullName,
        phone,
        role,
        core_subject: role === "teacher" ? coreSubject : null,
        avatar_url: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (profileError) {
      await adminClient.auth.admin.deleteUser(newUserId, false);
      return new Response(profileError.message || "Failed to create profile row.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUserId,
        email,
        role,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return new Response(message, { status: 500, headers: corsHeaders });
  }
});

