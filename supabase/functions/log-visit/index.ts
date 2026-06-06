import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function geoLookup(ip: string) {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { country: "", city: "", isp: "", latitude: "", longitude: "" };
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,isp,lat,lon,status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { country: "", city: "", isp: "", latitude: "", longitude: "" };
    const data = await res.json();
    if (data.status !== "success") return { country: "", city: "", isp: "", latitude: "", longitude: "" };
    return {
      country: data.country || "",
      city: data.city || "",
      isp: data.isp || "",
      latitude: String(data.lat || ""),
      longitude: String(data.lon || ""),
    };
  } catch {
    return { country: "", city: "", isp: "", latitude: "", longitude: "" };
  }
}

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
      return new Response(JSON.stringify({ error: "Missing env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userAgent = req.headers.get("user-agent") || body?.user_agent || "";
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || body?.ip_address
      || "";

    // Look up geo info from IP (no permission needed, server-side)
    const geo = await geoLookup(ipAddress);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error } = await supabase.from("visitor_logs").insert({
      ip_address: ipAddress,
      user_agent: userAgent,
      device_type: body?.device_type || "",
      browser: body?.browser || "",
      browser_version: body?.browser_version || "",
      os: body?.os || "",
      os_version: body?.os_version || "",
      referrer: body?.referrer || "",
      page_url: body?.page_url || "",
      country: geo.country || body?.country || "",
      city: geo.city || body?.city || "",
      isp: geo.isp || body?.isp || "",
      latitude: geo.latitude || body?.latitude || "",
      longitude: geo.longitude || body?.longitude || "",
      user_id: body?.user_id || null,
      username: body?.username || null,
      email: body?.email || null,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, ip: ipAddress, geo }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
