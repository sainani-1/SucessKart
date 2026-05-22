import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ error: message }, status);

const createAuthorizedClient = (supabaseUrl: string, anonKey: string, jwt: string) =>
  createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed.", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("PAYMENT_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return errorResponse("Missing Supabase environment variables.", 500);
  }

  if (!resendApiKey) {
    return errorResponse("RESEND_API_KEY is not configured.", 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Missing Authorization bearer token.", 401);
  }

  const jwt = authHeader.replace("Bearer ", "").trim();
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const authClient = createAuthorizedClient(supabaseUrl, anonKey, jwt);

  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user?.id) {
    return errorResponse("Invalid user session.", 401);
  }

  const { data: adminProfile } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (adminProfile?.role !== "admin") {
    return errorResponse("Admin access required.", 403);
  }

  let payload: { to?: string; subject?: string; html?: string };
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const to = String(payload.to || "").trim();
  const subject = String(payload.subject || "").trim();
  const html = String(payload.html || "").trim();

  if (!to || !subject || !html) {
    return errorResponse("to, subject, and html are required.", 400);
  }

  const validEmails = to.split(",").map((e) => e.trim()).filter(Boolean);
  if (validEmails.length === 0) {
    return errorResponse("At least one valid recipient email is required.", 400);
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `SkillPro <${fromEmail}>`,
        to: validEmails,
        subject,
        html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return errorResponse(result?.message || result?.error || "Failed to send email.", response.status);
    }

    return jsonResponse({ success: true, id: result?.id || null });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Failed to send email.", 500);
  }
});
