import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  LIFETIME_PREMIUM_DATE,
  PREMIUM_MONTHS,
  activatePaidPremium,
  addMonthsFrom,
  normalizePlanTier,
  notifyAdminOfPaymentEvent,
} from "../_shared/paymentHelpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type OfferRow = {
  id: string;
  title: string | null;
  coupon_code?: string | null;
  coupon_name: string | null;
  applicable_plan?: string | null;
  discount_type: string | null;
  discount_value: number | string | null;
  is_lifetime_free: boolean | null;
  applies_to_all: boolean | null;
  valid_until: string | null;
  status?: string | null;
};

type CreateOrderPayload = {
  offer_id?: string | null;
  plan_tier?: string | null;
  coupon_code?: string | null;
  payment_tag?: string | null;
};

const pickLatestPlanForTier = (plans: any[], tier: string) => {
  return (plans || [])
    .filter((plan) => plan?.isActive && normalizePlanTier(plan?.tier) === tier)
    .sort((a, b) => {
      const aTime = new Date(a?.createdAt || 0).getTime();
      const bTime = new Date(b?.createdAt || 0).getTime();
      return bTime - aTime;
    })[0] ?? null;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ error: message }, status);

const parseMoney = (value: number) => Math.round(value * 100) / 100;
const escapeLikeValue = (value: string) => value.replace(/[,%]/g, "");

const resolveDiscount = (baseAmount: number, offer: OfferRow | null) => {
  if (!offer) {
    return {
      couponCode: null,
      discountAmount: 0,
      finalAmount: parseMoney(baseAmount),
      isLifetimeFree: false,
    };
  }

  const couponCode = String(offer.coupon_code || offer.title || offer.coupon_name || "").trim() || null;
  if (offer.is_lifetime_free || offer.discount_type === "lifetime_free") {
    return {
      couponCode,
      discountAmount: parseMoney(baseAmount),
      finalAmount: 0,
      isLifetimeFree: true,
    };
  }

  const rawValue = Number(offer.discount_value || 0);
  const discountAmount =
    offer.discount_type === "percent"
      ? parseMoney((baseAmount * Math.max(0, Math.min(rawValue, 100))) / 100)
      : parseMoney(Math.max(0, Math.min(rawValue, baseAmount)));

  return {
    couponCode,
    discountAmount,
    finalAmount: parseMoney(Math.max(0, baseAmount - discountAmount)),
    isLifetimeFree: false,
  };
};

const getOfferApplicablePlan = (offer: OfferRow | null) => {
  const value = String(offer?.applicable_plan || "both").trim();
  return value === "premium" || value === "premium_plus" ? value : "both";
};

const isOfferApplicableToPlan = (offer: OfferRow | null, planTier: string) => {
  const applicablePlan = getOfferApplicablePlan(offer);
  return applicablePlan === "both" || applicablePlan === planTier;
};

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
  const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
  const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

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

  let payload: CreateOrderPayload = {};
  try {
    payload = (await req.json()) as CreateOrderPayload;
  } catch {
    payload = {};
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, full_name, email, phone, premium_until")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return errorResponse("User profile not found.", 404);
  }

  const { data: configRows } = await adminClient
    .from("settings")
    .select("key, value")
    .in("key", [
      "premium_cost",
      "premium_plus_cost",
      "public_plans",
      "payment_gateway_mode",
      "skillpro_upi_id",
      "payment_admin_phone",
    ]);

  const config = Object.fromEntries((configRows || []).map((row) => [row.key, row.value]));
  const fallbackPremiumCost = parseMoney(Number.parseFloat(String(config.premium_cost ?? "199")) || 199);
  const fallbackPremiumPlusCost = parseMoney(
    Number.parseFloat(String(config.premium_plus_cost ?? "")) || Math.max(fallbackPremiumCost + 100, 299),
  );
  const configuredGatewayMode = String(config.payment_gateway_mode || "razorpay").trim() === "skillpro_upi"
    ? "skillpro_upi"
    : "razorpay";
  const configuredUpiId = String(config.skillpro_upi_id || "").trim();
  const configuredPaymentPhone = String(config.payment_admin_phone || "").trim();
  const configuredPaymentAddress = configuredPaymentPhone || configuredUpiId;

  const selectedPlanTier = normalizePlanTier(payload.plan_tier);
  let selectedPlanLabel = selectedPlanTier === "premium_plus" ? "Premium Plus" : "Premium";
  let selectedPlanCode = selectedPlanTier === "premium_plus" ? "premium_plus_6months" : "premium_6months";
  let selectedPlanMonths = PREMIUM_MONTHS;
  let baseAmount = selectedPlanTier === "premium_plus" ? fallbackPremiumPlusCost : fallbackPremiumCost;

  try {
    const publicPlans = config.public_plans ? JSON.parse(config.public_plans) : [];
    if (Array.isArray(publicPlans)) {
      const selectedPlan = pickLatestPlanForTier(publicPlans, selectedPlanTier);
      if (selectedPlan) {
        selectedPlanLabel = String(selectedPlan.name || selectedPlanLabel);
        selectedPlanCode = String(selectedPlan.id || selectedPlanCode);
        selectedPlanMonths = Number(selectedPlan.periodMonths || PREMIUM_MONTHS) || PREMIUM_MONTHS;
        const publicPlanCost = Number(selectedPlan.cost);
        if (configuredGatewayMode !== "skillpro_upi" && Number.isFinite(publicPlanCost) && publicPlanCost > 0) {
          baseAmount = parseMoney(publicPlanCost);
        }
      }
    }
  } catch {
    // Keep fallback plan configuration if public plans cannot be parsed.
  }

  let selectedOffer: OfferRow | null = null;
  const couponCode = String(payload.coupon_code || "").trim();
  if (payload.offer_id || couponCode) {
    let offer: OfferRow | null = null;
    let offerError: Error | null = null;

    if (payload.offer_id) {
      const result = await adminClient
        .from("offers")
        .select("id, title, coupon_code, coupon_name, applicable_plan, discount_type, discount_value, is_lifetime_free, applies_to_all, valid_until, status")
        .eq("id", payload.offer_id)
        .maybeSingle();
      offer = result.data;
      offerError = result.error;
    } else {
      const sanitizedCode = escapeLikeValue(couponCode);
      const result = await adminClient
        .from("offers")
        .select("id, title, coupon_code, coupon_name, applicable_plan, discount_type, discount_value, is_lifetime_free, applies_to_all, valid_until, status")
        .or(`coupon_code.ilike.${sanitizedCode},title.ilike.${sanitizedCode},coupon_name.ilike.${sanitizedCode}`)
        .limit(1)
        .maybeSingle();
      offer = result.data;
      offerError = result.error;
    }

    if (offerError || !offer) {
      return errorResponse("Selected coupon was not found.", 404);
    }

    const isExpired = Boolean(offer.valid_until && new Date(offer.valid_until) < new Date());
    if (offer.status === "expired" || isExpired) {
      return errorResponse("Selected coupon has expired.", 400);
    }
    if (!isOfferApplicableToPlan(offer, selectedPlanTier)) {
      return errorResponse("This coupon is not valid for the selected plan.", 400);
    }

    if (!offer.applies_to_all) {
      const { data: assignment } = await adminClient
        .from("offer_assignments")
        .select("offer_id")
        .eq("offer_id", offer.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!assignment) {
        return errorResponse("This coupon is not assigned to your account.", 403);
      }
    }

    const { data: redemption } = await adminClient
      .from("offer_redemptions")
      .select("id, status")
      .eq("offer_id", offer.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (redemption?.status === "redeemed") {
      return errorResponse("This coupon has already been redeemed.", 409);
    }

    selectedOffer = offer;
  }

  const discount = resolveDiscount(baseAmount, selectedOffer);
  if (!selectedOffer && discount.finalAmount <= 0) {
    return errorResponse("Selected plan amount is invalid. Ask admin to configure a price greater than zero before activating premium.", 400);
  }
  const manualUpiNote = "SucessKart payment";
  const validUntil = discount.isLifetimeFree
    ? LIFETIME_PREMIUM_DATE
    : addMonthsFrom(profile.premium_until, selectedPlanMonths);

    if (configuredGatewayMode !== "skillpro_upi" && discount.finalAmount <= 0 && configuredGatewayMode !== "skillpro_upi") {
    const { data: payment, error: paymentError } = await adminClient
      .from("payments")
      .insert({
        user_id: user.id,
        plan_code: selectedPlanCode,
        gateway: "coupon",
        status: "success",
        base_amount: baseAmount,
        discount_amount: discount.discountAmount,
        final_amount: discount.finalAmount,
        amount: discount.finalAmount,
        currency: "INR",
        coupon_offer_id: selectedOffer?.id ?? null,
        coupon_code: discount.couponCode,
        valid_until: validUntil,
        paid_at: new Date().toISOString(),
        metadata: {
          plan_label: `${selectedPlanLabel} Access - ${selectedPlanMonths} Months`,
          plan_tier: selectedPlanTier,
          plan_months: selectedPlanMonths,
          coupon_name: selectedOffer?.coupon_name ?? null,
          coupon_type: selectedOffer?.discount_type ?? null,
          is_lifetime_free: discount.isLifetimeFree,
          payment_note: manualUpiNote,
          payment_method: "coupon",
        },
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      return errorResponse(paymentError?.message || "Failed to create payment.", 500);
    }

    try {
      await activatePaidPremium(adminClient, {
        userId: user.id,
        paymentId: payment.id,
        profilePremiumUntil: profile.premium_until,
        planTier: selectedPlanTier,
        planMonths: selectedPlanMonths,
        isLifetimeFree: discount.isLifetimeFree,
      });
    } catch (error) {
      await adminClient
        .from("payments")
        .update({
          status: "failed",
          failure_reason: error instanceof Error ? error.message : "Premium activation failed.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      return errorResponse("Payment was recorded but premium activation failed.", 500);
    }

    if (selectedOffer?.id) {
      const now = new Date().toISOString();
      await adminClient.from("offer_redemptions").upsert(
        {
          offer_id: selectedOffer.id,
          user_id: user.id,
          payment_id: payment.id,
          status: "redeemed",
          discount_amount: discount.discountAmount,
          final_amount: discount.finalAmount,
          redeemed_at: now,
          updated_at: now,
        },
        { onConflict: "offer_id,user_id" },
      );
    }

    await notifyAdminOfPaymentEvent(adminClient, {
      userId: user.id,
      paymentId: payment.id,
      eventType: "payment_success",
      planName: selectedPlanLabel,
      amount: discount.finalAmount,
      paymentMethod: "coupon",
      userEmail: profile.email || user.email || null,
      userName: profile.full_name || null,
      userPhone: profile.phone || null,
      note: manualUpiNote,
      status: "success",
    });

    return jsonResponse({
      mode: "coupon",
      status: "success",
      payment_id: payment.id,
      base_amount: baseAmount,
      discount_amount: discount.discountAmount,
      final_amount: discount.finalAmount,
      valid_until: validUntil,
      is_lifetime_free: discount.isLifetimeFree,
    });
  }

  if (configuredGatewayMode === "skillpro_upi") {
    if (!configuredPaymentAddress) {
      return errorResponse("SucessKart payment destination is not configured.", 500);
    }

    const paymentTag = String(payload.payment_tag || "").trim() || null;
    const requestStatus = "created";
    const { data: payment, error: paymentError } = await adminClient
      .from("payments")
      .insert({
        user_id: user.id,
        plan_code: selectedPlanCode,
        gateway: "skillpro_upi",
        status: requestStatus,
        base_amount: baseAmount,
        discount_amount: discount.discountAmount,
        final_amount: discount.finalAmount,
        amount: discount.finalAmount,
        currency: "INR",
        coupon_offer_id: selectedOffer?.id ?? null,
        coupon_code: discount.couponCode,
        valid_until: validUntil,
        gateway_ref: null,
        metadata: {
          plan_label: `${selectedPlanLabel} Access - ${selectedPlanMonths} Months`,
          plan_tier: selectedPlanTier,
          plan_months: selectedPlanMonths,
          coupon_name: selectedOffer?.coupon_name ?? null,
          coupon_type: selectedOffer?.discount_type ?? null,
          is_lifetime_free: false,
          payment_note: manualUpiNote,
          payment_method: "skillpro_upi",
          payment_request_state: "request_sent",
          payment_tag: paymentTag,
          admin_approval_required: true,
        },
      })
      .select("id, status")
      .single();

    if (paymentError || !payment) {
      return errorResponse(paymentError?.message || "Failed to create payment request.", 500);
    }

    await notifyAdminOfPaymentEvent(adminClient, {
      userId: user.id,
      paymentId: payment.id,
      eventType: "request_created",
      planName: selectedPlanLabel,
      amount: discount.finalAmount,
      paymentMethod: configuredPaymentPhone ? "skillpro_upi_number" : "skillpro_upi",
      userEmail: profile.email || user.email || null,
      userName: profile.full_name || null,
      userPhone: profile.phone || null,
      note: paymentTag ? `${manualUpiNote} ${paymentTag}` : manualUpiNote,
      status: payment.status,
    });

    const noteWithTag = paymentTag ? `${manualUpiNote} ${paymentTag}` : manualUpiNote;
    const upiLink = `upi://pay?pa=${encodeURIComponent(configuredPaymentAddress)}&pn=${encodeURIComponent("SucessKart")}&am=${encodeURIComponent(String(discount.finalAmount))}&cu=INR&tn=${encodeURIComponent(noteWithTag)}`;

    return jsonResponse({
      mode: "skillpro_upi",
      payment_id: payment.id,
      amount: discount.finalAmount,
      currency: "INR",
      status: payment.status,
      approval_status: "waiting_admin_approval",
      payment_tag: paymentTag,
      upi_link: upiLink,
      plan_tier: selectedPlanTier,
      valid_until: validUntil,
    });
  }

  const { data: payment, error: paymentError } = await adminClient
    .from("payments")
    .insert({
      user_id: user.id,
      plan_code: selectedPlanCode,
      gateway: "razorpay",
      status: "created",
      base_amount: baseAmount,
      discount_amount: discount.discountAmount,
      final_amount: discount.finalAmount,
      amount: discount.finalAmount,
      currency: "INR",
      coupon_offer_id: selectedOffer?.id ?? null,
      coupon_code: discount.couponCode,
      valid_until: validUntil,
      metadata: {
        plan_label: `${selectedPlanLabel} Access - ${selectedPlanMonths} Months`,
        plan_tier: selectedPlanTier,
        plan_months: selectedPlanMonths,
        coupon_name: selectedOffer?.coupon_name ?? null,
        coupon_type: selectedOffer?.discount_type ?? null,
        is_lifetime_free: false,
        payment_note: manualUpiNote,
        payment_method: "razorpay",
      },
    })
    .select("id")
    .single();

  if (paymentError || !payment) {
    return errorResponse(paymentError?.message || "Failed to create payment.", 500);
  }

  if (!razorpayKeyId || !razorpayKeySecret) {
    await adminClient
      .from("payments")
      .update({
        status: "failed",
        failure_reason: "Razorpay environment variables are missing.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    return errorResponse("Payment gateway is not configured.", 500);
  }

  const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
  const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(discount.finalAmount * 100),
      currency: "INR",
      receipt: `payment_${payment.id}`,
      notes: {
        payment_id: payment.id,
        user_id: user.id,
        coupon_code: discount.couponCode || "",
        plan_tier: selectedPlanTier,
      },
    }),
  });

  const razorpayOrder = await razorpayResponse.json();
  if (!razorpayResponse.ok || !razorpayOrder?.id) {
    await adminClient
      .from("payments")
      .update({
        status: "failed",
        failure_reason: razorpayOrder?.error?.description || "Failed to create Razorpay order.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    return errorResponse(
      razorpayOrder?.error?.description || "Failed to create Razorpay order.",
      razorpayResponse.status || 500,
    );
  }

  await adminClient
    .from("payments")
    .update({
      gateway_order_id: razorpayOrder.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

    return jsonResponse({
      mode: "razorpay",
      key_id: razorpayKeyId,
      payment_id: payment.id,
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency || "INR",
      base_amount: baseAmount,
      discount_amount: discount.discountAmount,
      final_amount: discount.finalAmount,
      coupon_code: discount.couponCode,
      valid_until: validUntil,
      plan_tier: selectedPlanTier,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unexpected payment function error.", 500);
  }
});
