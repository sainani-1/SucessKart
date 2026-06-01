import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const distance = (a: number[], b: number[]) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return Number.POSITIVE_INFINITY;
  return Math.sqrt(a.reduce((total, value, index) => total + Math.pow((Number(value) || 0) - (Number(b[index]) || 0), 2), 0));
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase service configuration." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const descriptor = Array.isArray(body?.descriptor) ? body.descriptor.map(Number) : [];
    const redirectTo = String(body?.redirectTo || "");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Enter a valid email address." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (descriptor.length !== 128) {
      return new Response(JSON.stringify({ error: "Face scan is invalid. Please try again." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, email, face_auth_enabled, face_descriptor")
      .ilike("email", email)
      .maybeSingle();

    if (error) throw error;
    if (!profile?.id || !profile.face_auth_enabled || !Array.isArray(profile.face_descriptor)) {
      return new Response(JSON.stringify({ error: "No face login account found for this email." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const score = distance(descriptor, profile.face_descriptor as number[]);
    if (score > 0.52) {
      return new Response(JSON.stringify({ error: "Face did not match this email account." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (linkError) throw linkError;

    return new Response(JSON.stringify({
      ok: true,
      actionLink: linkData?.properties?.action_link || "",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Face login failed.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
