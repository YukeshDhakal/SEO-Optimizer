"use server";

import { createClient } from "@repo/auth/server";
import { stripe } from "@repo/payments";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { getCurrentOrganization } from "../../lib/organization";

export interface BillingActionState {
  error?: string;
}

// Creates (or reuses) a Stripe Customer for the org, starts a Checkout
// Session for the chosen plan, and redirects to Stripe's hosted page.
// Requires the plan to actually have a `stripe_price_id` filled in — every
// seeded plan starts with that column NULL (see the Phase 6 migration
// comment) until a real Stripe account exists and its Products/Prices are
// created and pasted in; this returns a clear error rather than calling
// Stripe with an empty price, which would just be a confusing 400 from
// their API instead.
export const createCheckoutSession = async (
  _prevState: BillingActionState,
  formData: FormData
): Promise<BillingActionState> => {
  if (!stripe) {
    return { error: "Billing isn't configured yet (no Stripe API key set)." };
  }

  const planId = String(formData.get("plan_id") ?? "");
  if (!planId) {
    return { error: "No plan selected." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }
  if (!(organization.role === "owner" || organization.role === "admin")) {
    return { error: "Only owners and admins can manage billing." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "Not signed in." };
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("id, name, stripe_price_id")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) {
    return { error: "Plan not found." };
  }
  if (!plan.stripe_price_id) {
    return {
      error: `"${plan.name}" isn't connected to a real Stripe Price yet — set plans.stripe_price_id first.`,
    };
  }

  let customerId = organization.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: organization.name,
      metadata: { organization_id: organization.id },
    });
    customerId = customer.id;

    const { error: updateError } = await supabase
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", organization.id);
    if (updateError) {
      return { error: "Couldn't save the new Stripe customer. Please try again." };
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/guardrails/billing?checkout=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/guardrails/billing?checkout=canceled`,
  });

  if (!session.url) {
    return { error: "Stripe didn't return a checkout URL. Please try again." };
  }

  redirect(session.url);
};

// Creates a Billing Portal session for self-serve plan changes/cancellation
// and redirects there — requires an existing Stripe customer (i.e. at
// least one prior checkout), otherwise there's nothing to manage yet.
export const createPortalSession = async (
  _prevState: BillingActionState,
  _formData: FormData
): Promise<BillingActionState> => {
  if (!stripe) {
    return { error: "Billing isn't configured yet (no Stripe API key set)." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }
  if (!(organization.role === "owner" || organization.role === "admin")) {
    return { error: "Only owners and admins can manage billing." };
  }
  if (!organization.stripe_customer_id) {
    return { error: "No billing account yet — choose a plan first." };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: organization.stripe_customer_id,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/guardrails/billing`,
  });

  redirect(session.url);
};
