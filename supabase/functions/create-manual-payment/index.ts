import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type ManualPaymentPayload = {
  plan_code: string;
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  currency: string;
  coupon_offer_id?: string | null;
  coupon_code?: string | null;
  metadata: Record<string, unknown>;
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
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return errorResponse("Method not allowed.", 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return errorResponse("Missing Supabase environment variables.", 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Missing Authorization bearer token.", 401);
    }

    const jwt = authHeader.replace("Bearer ", "").trim();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createAuthorizedClient(supabaseUrl, anonKey, jwt);

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user?.id) {
      return errorResponse("Invalid user session.", 401);
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return errorResponse("User profile not found.", 404);
    }

    let payload: ManualPaymentPayload;
    try {
      payload = (await req.json()) as ManualPaymentPayload;
    } catch {
      return errorResponse("Invalid request body.", 400);
    }

    if (!payload.plan_code || !payload.metadata?.transaction_id) {
      return errorResponse("plan_code and metadata.transaction_id are required.", 400);
    }

    const { data: payment, error: paymentError } = await adminClient
      .from("payments")
      .insert({
        user_id: user.id,
        plan_code: payload.plan_code,
        gateway: "manual",
        status: "pending",
        base_amount: payload.base_amount,
        discount_amount: payload.discount_amount,
        final_amount: payload.final_amount,
        amount: payload.final_amount,
        currency: payload.currency || "INR",
        coupon_offer_id: payload.coupon_offer_id || null,
        coupon_code: payload.coupon_code || null,
        metadata: payload.metadata,
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      return errorResponse(paymentError?.message || "Failed to create manual payment record.", 500);
    }

    const userName = profile.full_name || "User";
    const userEmail = profile.email || "";
    const userPhone = profile.phone || "-";
    const transactionId = String(payload.metadata.transaction_id || "").trim();
    const screenshotUrl = String(payload.metadata.screenshot_url || "").trim();
    const coupCode = String(payload.coupon_code || payload.metadata.coupon_code || "").trim() || "-";
    const coupName = String(payload.metadata.coupon_name || "").trim() || "-";
    const planLabel = String(payload.metadata.plan_label || payload.plan_code || "Premium");
    const now = new Date();
    const createdDate = now.toLocaleString("en-IN", { day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: true });

    const notifPayload = {
      title: "Manual Payment Submitted",
      content: `${userName} (${userEmail}) submitted a manual payment response for ${String(payload.metadata.plan_label || payload.plan_code)}. Amount: ₹${payload.final_amount}. TX ID: ${transactionId}.`,
      type: "payment_manual",
      metadata: {
        payment_id: payment.id,
        plan_code: payload.plan_code,
        final_amount: payload.final_amount,
        transaction_id: transactionId,
        gateway: "manual",
      },
    };

    const { error: notifError } = await adminClient.rpc("send_notification", {
      p_user_id: user.id,
      p_title: notifPayload.title,
      p_content: notifPayload.content,
      p_type: notifPayload.type,
      p_metadata: notifPayload.metadata,
    });

    if (notifError) {
      console.warn("Failed to send payment notification:", notifError);
    }

    let adminEmail = String(payload.metadata.admin_email || "").trim();
    if (!adminEmail) {
      const { data: manualEmailSetting } = await adminClient
        .from("settings")
        .select("value")
        .eq("key", "manual_payment_admin_email")
        .maybeSingle();
      if (manualEmailSetting?.value) {
        adminEmail = String(manualEmailSetting.value).trim();
      }
    }
    if (!adminEmail) {
      const { data: emailSetting } = await adminClient
        .from("settings")
        .select("value")
        .eq("key", "payment_admin_email")
        .maybeSingle();
      if (emailSetting?.value) {
        adminEmail = String(emailSetting.value).trim();
      }
    }
    if (adminEmail) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("PAYMENT_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
      if (resendApiKey) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `SucessKart <${fromEmail}>`,
              to: [adminEmail],
              subject: `SucessKart - Manual Payment Response from ${userName}`,
              html: `
                <div style="font-family:Inter, Arial, sans-serif; max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;">
                  <div style="background:linear-gradient(135deg,#1e293b,#334155); padding:24px 32px; text-align:center;">
                    <h1 style="color:#ffffff; margin:0; font-size:20px; font-weight:700;">Manual Payment Response</h1>
                    <p style="color:#94a3b8; margin:6px 0 0; font-size:14px;">A new payment response has been submitted</p>
                  </div>
                  <div style="padding:24px 32px;">
                    <div style="background:#f8fafc; border-radius:8px; padding:16px; margin-bottom:20px;">
                      <h2 style="font-size:13px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.1em; margin:0 0 12px;">User Information</h2>
                      <table style="width:100%; border-collapse:collapse; font-size:14px;">
                        <tr><td style="padding:6px 0; color:#64748b; width:100px;">Name</td><td style="padding:6px 0; color:#0f172a; font-weight:600;">${userName}</td></tr>
                        <tr><td style="padding:6px 0; color:#64748b;">Email</td><td style="padding:6px 0; color:#0f172a;">${userEmail}</td></tr>
                        <tr><td style="padding:6px 0; color:#64748b;">Phone</td><td style="padding:6px 0; color:#0f172a;">${userPhone}</td></tr>
                      </table>
                    </div>
                    <div style="background:#f8fafc; border-radius:8px; padding:16px; margin-bottom:20px;">
                      <h2 style="font-size:13px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.1em; margin:0 0 12px;">Payment Details</h2>
                      <table style="width:100%; border-collapse:collapse; font-size:14px;">
                        <tr><td style="padding:5px 0; color:#64748b; width:140px;">Gateway</td><td style="padding:5px 0; color:#0f172a;">Manual</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Plan</td><td style="padding:5px 0; color:#0f172a;">${planLabel}</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Base Amount</td><td style="padding:5px 0; color:#0f172a;">Rs ${payload.base_amount}</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Coupon Discount</td><td style="padding:5px 0; color:#0f172a;">Rs ${payload.discount_amount}</td></tr>
                        <tr><td style="padding:5px 0; border-top:1px solid #e2e8f0; color:#0f172a; font-weight:600;">Paid Amount</td><td style="padding:5px 0; border-top:1px solid #e2e8f0; color:#059669; font-weight:700; font-size:16px;">Rs ${payload.final_amount}</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Status</td><td style="padding:5px 0;"><span style="display:inline-block; background:#fef3c7; color:#92400e; padding:2px 10px; border-radius:999px; font-size:12px; font-weight:600;">Pending</span></td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Transaction ID</td><td style="padding:5px 0; color:#0f172a; font-family:monospace;">${transactionId}</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Payment ID</td><td style="padding:5px 0; color:#0f172a; font-family:monospace;">${payment.id}</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Created</td><td style="padding:5px 0; color:#0f172a;">${createdDate}</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Paid At</td><td style="padding:5px 0; color:#64748b;">-</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Coupon Code</td><td style="padding:5px 0; color:#0f172a; font-family:monospace;">${coupCode}</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Coupon Name</td><td style="padding:5px 0; color:#0f172a;">${coupName}</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Payment App</td><td style="padding:5px 0; color:#64748b;">-</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Payment Tag</td><td style="padding:5px 0; color:#64748b;">-</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">User UPI ID</td><td style="padding:5px 0; color:#64748b;">-</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">User UPI Name</td><td style="padding:5px 0; color:#64748b;">-</td></tr>
                        <tr><td style="padding:5px 0; color:#64748b;">Payment Note</td><td style="padding:5px 0; color:#64748b;">-</td></tr>
                      </table>
                    </div>
                    ${screenshotUrl ? `
                    <div style="background:#f8fafc; border-radius:8px; padding:16px; margin-bottom:20px; text-align:center;">
                      <h2 style="font-size:13px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.1em; margin:0 0 12px;">Payment Screenshot</h2>
                      <a href="${screenshotUrl}" target="_blank" style="display:inline-block; background:#3b82f6; color:#ffffff; padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:600;">View Screenshot</a>
                    </div>
                    ` : ""}
                    <div style="text-align:center; margin-top:8px;">
                      <a href="${Deno.env.get("APP_URL") || "https://SucessKart.app"}/app/admin/payment-responses" target="_blank" style="display:inline-block; background:#1e293b; color:#ffffff; padding:12px 32px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:600;">Review in Admin Panel</a>
                    </div>
                  </div>
                  <div style="background:#f8fafc; padding:16px 32px; text-align:center; border-top:1px solid #e2e8f0;">
                    <p style="color:#94a3b8; font-size:12px; margin:0;">SucessKart &bull; This is an automated notification from the payment system.</p>
                  </div>
                </div>
              `,
            }),
          });
        } catch (emailErr) {
          console.error("Admin email notification failed:", emailErr);
        }
      }
    }

    return jsonResponse({
      success: true,
      payment_id: payment.id,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
});
