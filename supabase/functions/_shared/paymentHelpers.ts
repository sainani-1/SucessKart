import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assignBalancedTeacherToStudent } from "./teacherAssignment.ts";

export const PREMIUM_MONTHS = 6;
export const LIFETIME_PREMIUM_DATE = "9999-12-31T23:59:59.000Z";
export const PREMIUM_PLAN_TYPES_KEY = "premium_plan_types";

export const normalizePlanTier = (value: string | null | undefined) =>
  value === "premium_plus" ? "premium_plus" : "premium";

export const parsePlanTypeMap = (rawValue: string | null | undefined) => {
  if (!rawValue) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {} as Record<string, string>;
    return Object.entries(parsed).reduce((acc, [userId, planType]) => {
      const normalizedUserId = String(userId || "").trim();
      if (!normalizedUserId) return acc;
      acc[normalizedUserId] = normalizePlanTier(String(planType || ""));
      return acc;
    }, {} as Record<string, string>);
  } catch {
    return {} as Record<string, string>;
  }
};

export const savePlanTypeForUser = async (
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  planTier: string,
) => {
  const { data: existingSetting } = await adminClient
    .from("settings")
    .select("value")
    .eq("key", PREMIUM_PLAN_TYPES_KEY)
    .maybeSingle();

  const planTypeMap = parsePlanTypeMap(existingSetting?.value);
  planTypeMap[userId] = normalizePlanTier(planTier);

  const { error } = await adminClient
    .from("settings")
    .upsert(
      {
        key: PREMIUM_PLAN_TYPES_KEY,
        value: JSON.stringify(planTypeMap),
      },
      { onConflict: "key" },
    );

  if (error) throw error;
};

export const addMonthsFrom = (baseDateIso: string | null | undefined, months: number) => {
  const baseDate = baseDateIso && new Date(baseDateIso) > new Date() ? new Date(baseDateIso) : new Date();
  baseDate.setMonth(baseDate.getMonth() + months);
  return baseDate.toISOString();
};

export const addDaysFrom = (baseDateIso: string | null | undefined, days: number) => {
  const baseDate = baseDateIso && new Date(baseDateIso) > new Date() ? new Date(baseDateIso) : new Date();
  baseDate.setDate(baseDate.getDate() + days);
  return baseDate.toISOString();
};

export const rewardReferralIfEligible = async (
  adminClient: ReturnType<typeof createClient>,
  referredUserId: string,
  paymentId: string,
  now: string,
) => {
  const { data: referral } = await adminClient
    .from("referrals")
    .select("id, referrer_user_id, reward_days, status")
    .eq("referred_user_id", referredUserId)
    .in("status", ["joined", "qualified"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!referral?.referrer_user_id) return;

  const { data: referrerProfile } = await adminClient
    .from("profiles")
    .select("premium_until")
    .eq("id", referral.referrer_user_id)
    .maybeSingle();

  const rewardDays = Number(referral.reward_days || 7);
  const rewardedPremiumUntil = addDaysFrom(referrerProfile?.premium_until, rewardDays);

  await adminClient
    .from("profiles")
    .update({ premium_until: rewardedPremiumUntil })
    .eq("id", referral.referrer_user_id);

  await adminClient
    .from("referrals")
    .update({
      status: "rewarded",
      qualified_payment_id: paymentId,
      rewarded_at: now,
      updated_at: now,
    })
    .eq("id", referral.id);
};

const loadPaymentContactConfig = async (adminClient: ReturnType<typeof createClient>) => {
  const { data } = await adminClient
    .from("settings")
    .select("key, value")
    .in("key", ["payment_admin_email", "support_contact_email", "payment_request_admin_email_enabled"]);

  const settingsMap = Object.fromEntries((data || []).map((item) => [item.key, item.value]));
  return {
    paymentAdminEmail: String(settingsMap.payment_admin_email || settingsMap.support_contact_email || "").trim(),
    paymentRequestAdminEmailEnabled: settingsMap.payment_request_admin_email_enabled !== "false",
  };
};

const sendEmailIfConfigured = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("PAYMENT_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL");
  if (!resendApiKey || !fromEmail || !to) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      html,
    }),
  });
};

const upsertAdminNotification = async (
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) => {
  try {
    const { error } = await adminClient.from("admin_notifications").insert(payload);
    if (error && String(error.message || "").includes("target_user_id")) {
      const { target_user_id, ...fallback } = payload as Record<string, unknown>;
      const marker = target_user_id ? `[target_user_id:${target_user_id}] ` : "";
      await adminClient.from("admin_notifications").insert({
        ...fallback,
        content:
          marker && !String(fallback.content || "").includes("[target_user_id:")
            ? `${marker}${String(fallback.content || "")}`
            : fallback.content,
      });
    }
  } catch {
    // Notifications should never block payment flows.
  }
};

export const notifyAdminOfPaymentEvent = async (
  adminClient: ReturnType<typeof createClient>,
  options: {
    userId: string;
    paymentId: string;
    eventType: "request_created" | "payment_success";
    planName: string;
    amount: number;
    paymentMethod: string;
    userEmail?: string | null;
    userName?: string | null;
    userPhone?: string | null;
    userUpiId?: string | null;
    userUpiName?: string | null;
    note?: string | null;
    status?: string | null;
  },
) => {
  const { paymentAdminEmail, paymentRequestAdminEmailEnabled } = await loadPaymentContactConfig(adminClient);
  const title =
    options.eventType === "payment_success" ? "Payment Success" : "Payment Request Created";
  const summary =
    options.eventType === "payment_success"
      ? `${options.userName || options.userEmail || "User"} completed ${options.planName} payment.`
      : `${options.userName || options.userEmail || "User"} started a ${options.planName} payment request.`;

  try {
    await upsertAdminNotification(adminClient, {
      title,
      content: `${summary} Amount: INR ${options.amount}. Method: ${options.paymentMethod}. Payment ID: ${options.paymentId}.`,
      type: options.eventType === "payment_success" ? "success" : "info",
      target_role: "admin",
      target_user_id: options.userId,
    });
  } catch {
    // Ignore notification failures.
  }

  if (options.eventType === "request_created" && !paymentRequestAdminEmailEnabled) return;
  if (!paymentAdminEmail) return;

  const detailRows = [
    ["User", options.userName || "-"],
    ["Email", options.userEmail || "-"],
    ["Phone", options.userPhone || "-"],
    ["Plan", options.planName],
    ["Amount", `INR ${options.amount}`],
    ["Method", options.paymentMethod],
    ["Status", options.status || (options.eventType === "payment_success" ? "success" : "pending")],
    ["User UPI ID", options.userUpiId || "-"],
    ["User UPI Name", options.userUpiName || "-"],
    ["Note", options.note || "-"],
    ["Payment ID", options.paymentId],
  ]
    .map(([label, value]) => `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0;"><strong>${label}</strong></td><td style="padding:6px 10px;border:1px solid #e2e8f0;">${value}</td></tr>`)
    .join("");

  try {
    await sendEmailIfConfigured({
      to: paymentAdminEmail,
      subject: `SucessKart ${title}: ${options.userEmail || options.userName || options.paymentId}`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:16px;color:#0f172a;">
          <h2 style="margin:0 0 12px;">${title}</h2>
          <p style="margin:0 0 16px;">${summary}</p>
          <table style="border-collapse:collapse;width:100%;max-width:720px;">${detailRows}</table>
        </div>
      `,
    });
  } catch {
    // Ignore email failures.
  }
};

export const notifyUserOfPaymentReview = async (options: {
  email?: string | null;
  userName?: string | null;
  planName: string;
  amount: number;
  paymentId: string;
  paymentTag?: string | null;
  status: "approved" | "rejected";
  note?: string | null;
}) => {
  if (!options.email) return;

  const title = options.status === "approved" ? "Payment Approved" : "Payment Rejected";
  const summary =
    options.status === "approved"
      ? `${options.planName} payment has been approved by SucessKart.`
      : `${options.planName} payment request was reviewed by SucessKart.`;

  const detailRows = [
    ["User", options.userName || "-"],
    ["Plan", options.planName],
    ["Amount", `INR ${options.amount}`],
    ["Payment ID", options.paymentId],
    ["Payment Tag", options.paymentTag || "-"],
    ["Status", options.status],
    ["Note", options.note || "-"],
  ]
    .map(([label, value]) => `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0;"><strong>${label}</strong></td><td style="padding:6px 10px;border:1px solid #e2e8f0;">${value}</td></tr>`)
    .join("");

  try {
    await sendEmailIfConfigured({
      to: options.email,
      subject: `SucessKart ${title}: ${options.planName}`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:16px;color:#0f172a;">
          <h2 style="margin:0 0 12px;">${title}</h2>
          <p style="margin:0 0 16px;">${summary}</p>
          <table style="border-collapse:collapse;width:100%;max-width:720px;">${detailRows}</table>
        </div>
      `,
    });
  } catch {
    // Ignore email failures.
  }
};

export const activatePaidPremium = async (
  adminClient: ReturnType<typeof createClient>,
  options: {
    userId: string;
    paymentId: string;
    profilePremiumUntil: string | null | undefined;
    planTier: string;
    planMonths: number;
    isLifetimeFree?: boolean;
  },
) => {
  const now = new Date().toISOString();
  const validUntil = options.isLifetimeFree
    ? LIFETIME_PREMIUM_DATE
    : addMonthsFrom(options.profilePremiumUntil, options.planMonths || PREMIUM_MONTHS);

  const { error: activationError } = await adminClient
    .from("profiles")
    .update({ premium_until: validUntil })
    .eq("id", options.userId);

  if (activationError) throw activationError;

  await savePlanTypeForUser(adminClient, options.userId, options.planTier);
  await assignBalancedTeacherToStudent(adminClient, options.userId);
  await rewardReferralIfEligible(adminClient, options.userId, options.paymentId, now);

  return { validUntil, now };
};
