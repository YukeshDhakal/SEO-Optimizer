import { analytics } from "@repo/analytics/server";
import { database } from "@repo/database";
import { parseError } from "@repo/observability/error";
import { log } from "@repo/observability/log";
import type { Stripe } from "@repo/payments";
import { stripe } from "@repo/payments";
import { NextResponse } from "next/server";
import { env } from "@/env";

// Phase 6: replaces the Clerk-era stub — organizations.stripe_customer_id
// (Phase 1) now exists, so this is a real lookup via the service-role
// client rather than an always-undefined placeholder.
const getOrgFromCustomerId = async (
  customerId: string
): Promise<{ id: string } | undefined> => {
  const { data } = await database
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data ?? undefined;
};

const customerIdOf = (
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | undefined => {
  if (!customer) {
    return undefined;
  }
  return typeof customer === "string" ? customer : customer.id;
};

const handleCheckoutSessionCompleted = async (
  data: Stripe.Checkout.Session
) => {
  const customerId = customerIdOf(data.customer);
  if (!customerId) {
    return;
  }

  const org = await getOrgFromCustomerId(customerId);
  if (!org) {
    return;
  }

  analytics?.capture({
    event: "Organization Subscribed",
    distinctId: org.id,
  });
};

const handleSubscriptionScheduleCanceled = async (
  data: Stripe.SubscriptionSchedule
) => {
  const customerId = customerIdOf(data.customer);
  if (!customerId) {
    return;
  }

  const org = await getOrgFromCustomerId(customerId);
  if (!org) {
    return;
  }

  analytics?.capture({
    event: "Organization Unsubscribed",
    distinctId: org.id,
  });
};

// Maps a Stripe subscription status to this app's own narrower
// `subscriptions.status` check constraint ('active'|'past_due'|'canceled'|
// 'incomplete') — Stripe has more states (trialing, incomplete_expired,
// unpaid, paused) than this app distinguishes yet; fold the ones that
// functionally mean "not currently payable/active" into the closest
// existing bucket rather than widening the DB constraint for states this
// app doesn't act on differently yet.
const mapSubscriptionStatus = (
  status: Stripe.Subscription.Status
): "active" | "past_due" | "canceled" | "incomplete" => {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "incomplete";
  }
};

// Upserts `subscriptions` and mirrors the payable/not-payable distinction
// onto `organizations.status` — the field the cron dispatcher (Phase 6's
// past_due gate) and every other guardrail already read, so this is the
// single write that actually changes autonomous-publishing behavior.
const syncSubscription = async (subscription: Stripe.Subscription) => {
  const customerId = customerIdOf(subscription.customer);
  if (!customerId) {
    return;
  }

  const org = await getOrgFromCustomerId(customerId);
  if (!org) {
    log.warn(`Stripe webhook: no organization found for customer ${customerId}`);
    return;
  }

  const status = mapSubscriptionStatus(subscription.status);
  const priceId = subscription.items.data[0]?.price?.id;

  let planId: string | null = null;
  if (priceId) {
    const { data: plan } = await database
      .from("plans")
      .select("id")
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    planId = plan?.id ?? null;
  }

  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  await database.from("subscriptions").upsert(
    {
      organization_id: org.id,
      stripe_subscription_id: subscription.id,
      plan_id: planId,
      status,
      current_period_end: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  await database
    .from("organizations")
    .update({ status: status === "past_due" ? "past_due" : "active" })
    .eq("id", org.id);
};

const handleSubscriptionDeleted = async (subscription: Stripe.Subscription) => {
  const customerId = customerIdOf(subscription.customer);
  if (!customerId) {
    return;
  }
  const org = await getOrgFromCustomerId(customerId);
  if (!org) {
    return;
  }
  await database
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("organization_id", org.id);
  // Deliberately not `suspended` — a canceled subscription still leaves the
  // org able to sign in and manage settings; the quota check
  // (`checkQuota`) already treats "no active plan" as unrestricted rather
  // than blocking, per its own documented tradeoff, so nothing else needs
  // to change here yet.
};

const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice) => {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) {
    return;
  }
  const org = await getOrgFromCustomerId(customerId);
  if (!org) {
    return;
  }
  await database.from("organizations").update({ status: "past_due" }).eq("id", org.id);
  await database
    .from("subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("organization_id", org.id);
};

const handleInvoicePaymentSucceeded = async (invoice: Stripe.Invoice) => {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) {
    return;
  }
  const org = await getOrgFromCustomerId(customerId);
  if (!org) {
    return;
  }
  // Only clear a *past_due* org back to active — never overwrite
  // `suspended` (a stronger, presumably manually-applied state) just
  // because one invoice happened to succeed.
  const { data: currentOrg } = await database
    .from("organizations")
    .select("status")
    .eq("id", org.id)
    .maybeSingle();
  if (currentOrg?.status === "past_due") {
    await database.from("organizations").update({ status: "active" }).eq("id", org.id);
  }
  await database
    .from("subscriptions")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("organization_id", org.id);
};

export const POST = async (request: Request): Promise<Response> => {
  if (!(stripe && env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ message: "Not configured", ok: false });
  }

  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      throw new Error("missing stripe-signature header");
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      }
      case "subscription_schedule.canceled": {
        await handleSubscriptionScheduleCanceled(event.data.object);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await syncSubscription(event.data.object);
        break;
      }
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event.data.object);
        break;
      }
      case "invoice.payment_failed": {
        await handleInvoicePaymentFailed(event.data.object);
        break;
      }
      // invoice.paid is the more complete signal (also fires for $0
      // invoices and some non-card payment paths that don't always emit
      // payment_succeeded) - handle both with the same idempotent logic so
      // whichever arrives first (or both) leaves the org in the right
      // state.
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      }
      default: {
        log.warn(`Unhandled event type ${event.type}`);
      }
    }

    await analytics?.shutdown();

    return NextResponse.json({ result: event, ok: true });
  } catch (error) {
    const message = parseError(error);

    log.error(message);

    return NextResponse.json(
      {
        message: "something went wrong",
        ok: false,
      },
      { status: 500 }
    );
  }
};
