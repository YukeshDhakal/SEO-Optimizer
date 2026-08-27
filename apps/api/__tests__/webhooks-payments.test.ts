import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit-tests the Stripe webhook handler's own branching/DB-write logic —
// not `stripe.webhooks.constructEvent`'s signature verification, which
// needs a real webhook secret and isn't this test's concern (same split
// the Phase 6 task description called out explicitly). `constructEvent` is
// mocked to just return whatever fabricated event each test hands it.
const state = vi.hoisted(() => {
  interface OrgRow {
    id: string;
    stripe_customer_id: string;
    status: string;
  }

  return {
    constructEventMock: vi.fn((body: string) => JSON.parse(body)),
    orgsByCustomerId: {} as Record<string, OrgRow>,
    orgUpdates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
    subscriptionUpserts: [] as Array<Record<string, unknown>>,
    subscriptionUpdates: [] as Array<{ organization_id: string; patch: Record<string, unknown> }>,
    planByPriceId: {} as Record<string, { id: string }>,
  };
});

vi.mock("@/env", () => ({ env: { STRIPE_WEBHOOK_SECRET: "whsec_test" } }));

vi.mock("@repo/payments", () => ({
  stripe: { webhooks: { constructEvent: state.constructEventMock } },
}));

vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: vi.fn(), shutdown: vi.fn(() => Promise.resolve()) },
}));

vi.mock("@repo/observability/error", () => ({ parseError: (e: unknown) => String(e) }));
vi.mock("@repo/observability/log", () => ({ log: { warn: vi.fn(), error: vi.fn() } }));

vi.mock("@repo/database", () => {
  const makeBuilder = (table: string) => {
    const ctx: {
      customerId?: string;
      orgId?: string;
      priceId?: string;
      column?: string;
      pendingUpdate?: Record<string, unknown>;
    } = {};
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((column: string, value: string) => {
      ctx.column = column;
      if (column === "stripe_customer_id") ctx.customerId = value;
      if (column === "id" && table === "organizations") ctx.orgId = value;
      if (column === "organization_id") ctx.orgId = value;
      if (column === "stripe_price_id") ctx.priceId = value;
      // `.update(patch).eq(col, val)` resolves the row only once `.eq` runs,
      // so the write is recorded here (not in `update`) using the patch
      // stashed by `update` below.
      if (ctx.pendingUpdate) {
        if (table === "organizations" && ctx.orgId) {
          state.orgUpdates.push({ id: ctx.orgId, patch: ctx.pendingUpdate });
        }
        if (table === "subscriptions" && ctx.orgId) {
          state.subscriptionUpdates.push({ organization_id: ctx.orgId, patch: ctx.pendingUpdate });
        }
        ctx.pendingUpdate = undefined;
      }
      return builder;
    });
    builder.maybeSingle = vi.fn(() => {
      if (table === "organizations" && ctx.customerId) {
        const org = state.orgsByCustomerId[ctx.customerId];
        return Promise.resolve({ data: org ? { id: org.id } : null, error: null });
      }
      if (table === "organizations" && ctx.orgId) {
        const org = Object.values(state.orgsByCustomerId).find((o) => o.id === ctx.orgId);
        return Promise.resolve({ data: org ? { status: org.status } : null, error: null });
      }
      if (table === "plans" && ctx.priceId) {
        const plan = state.planByPriceId[ctx.priceId];
        return Promise.resolve({ data: plan ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    builder.update = vi.fn((patch: Record<string, unknown>) => {
      ctx.pendingUpdate = patch;
      return builder;
    });
    builder.upsert = vi.fn((row: Record<string, unknown>) => {
      state.subscriptionUpserts.push(row);
      return builder;
    });
    // `.update(...).eq(...)` needs `builder` to itself be awaitable —
    // vitest/JS `await` on a plain object with a `then` resolves like a
    // promise, same trick `dispatch-runs.test.ts`'s mock uses.
    builder.then = (resolve: (v: { data: null; error: null }) => unknown) =>
      resolve({ data: null, error: null });
    return builder;
  };

  return { database: { from: vi.fn((table: string) => makeBuilder(table)) } };
});

// Imported after the mocks above.
import { POST } from "../app/webhooks/payments/route";

const stripeEvent = (type: string, object: Record<string, unknown>) => ({
  type,
  data: { object },
});

const request = (event: unknown) =>
  new Request("https://example.com/webhooks/payments", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=fake" },
    body: JSON.stringify(event),
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.orgsByCustomerId = {};
  state.orgUpdates = [];
  state.subscriptionUpserts = [];
  state.subscriptionUpdates = [];
  state.planByPriceId = {};
  state.constructEventMock.mockImplementation((body: string) => JSON.parse(body));
});

describe("Stripe payments webhook", () => {
  it("returns 'not configured' without hitting the DB when STRIPE_WEBHOOK_SECRET is unset", async () => {
    vi.doMock("@/env", () => ({ env: { STRIPE_WEBHOOK_SECRET: undefined } }));
    vi.resetModules();
    const { POST: postWithNoSecret } = await import("../app/webhooks/payments/route");

    const response = await postWithNoSecret(request(stripeEvent("customer.subscription.updated", {})));
    const body = await response.json();

    expect(body).toEqual({ message: "Not configured", ok: false });
    expect(state.orgUpdates).toEqual([]);
  });

  it("customer.subscription.updated with status=active upserts an active subscription and sets the org active", async () => {
    state.orgsByCustomerId.cus_1 = { id: "org-1", stripe_customer_id: "cus_1", status: "active" };
    state.planByPriceId.price_growth = { id: "plan-growth" };

    const event = stripeEvent("customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      items: { data: [{ price: { id: "price_growth" }, current_period_end: 1_800_000_000 }] },
    });

    const response = await POST(request(event));
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(state.subscriptionUpserts).toEqual([
      expect.objectContaining({
        organization_id: "org-1",
        stripe_subscription_id: "sub_1",
        plan_id: "plan-growth",
        status: "active",
      }),
    ]);
    expect(state.orgUpdates).toEqual([{ id: "org-1", patch: { status: "active" } }]);
  });

  it("customer.subscription.updated with status=past_due sets the org past_due", async () => {
    state.orgsByCustomerId.cus_2 = { id: "org-2", stripe_customer_id: "cus_2", status: "active" };

    const event = stripeEvent("customer.subscription.updated", {
      id: "sub_2",
      customer: "cus_2",
      status: "past_due",
      items: { data: [{ current_period_end: 1_800_000_000 }] },
    });

    await POST(request(event));

    expect(state.orgUpdates).toEqual([{ id: "org-2", patch: { status: "past_due" } }]);
    expect(state.subscriptionUpserts).toEqual([
      expect.objectContaining({ organization_id: "org-2", status: "past_due" }),
    ]);
  });

  it("invoice.payment_failed sets the org and subscription to past_due", async () => {
    state.orgsByCustomerId.cus_3 = { id: "org-3", stripe_customer_id: "cus_3", status: "active" };

    const event = stripeEvent("invoice.payment_failed", { customer: "cus_3" });
    await POST(request(event));

    expect(state.orgUpdates).toEqual([{ id: "org-3", patch: { status: "past_due" } }]);
    expect(state.subscriptionUpdates).toEqual([
      { organization_id: "org-3", patch: expect.objectContaining({ status: "past_due" }) },
    ]);
  });

  it("invoice.payment_succeeded clears a past_due org back to active", async () => {
    state.orgsByCustomerId.cus_4 = { id: "org-4", stripe_customer_id: "cus_4", status: "past_due" };

    const event = stripeEvent("invoice.payment_succeeded", { customer: "cus_4" });
    await POST(request(event));

    expect(state.orgUpdates).toEqual([{ id: "org-4", patch: { status: "active" } }]);
  });

  it("invoice.payment_succeeded does not overwrite a suspended org back to active", async () => {
    state.orgsByCustomerId.cus_5 = { id: "org-5", stripe_customer_id: "cus_5", status: "suspended" };

    const event = stripeEvent("invoice.payment_succeeded", { customer: "cus_5" });
    await POST(request(event));

    // Only the subscription row (unconditionally synced to 'active' on a
    // successful invoice) should update - `organizations.status` must stay
    // untouched since it's not 'past_due'.
    expect(state.orgUpdates).toEqual([]);
    expect(state.subscriptionUpdates).toEqual([
      { organization_id: "org-5", patch: expect.objectContaining({ status: "active" }) },
    ]);
  });

  it("customer.subscription.deleted marks the subscription canceled without touching organizations.status", async () => {
    state.orgsByCustomerId.cus_6 = { id: "org-6", stripe_customer_id: "cus_6", status: "active" };

    const event = stripeEvent("customer.subscription.deleted", { id: "sub_6", customer: "cus_6" });
    await POST(request(event));

    expect(state.subscriptionUpdates).toEqual([
      { organization_id: "org-6", patch: expect.objectContaining({ status: "canceled" }) },
    ]);
    expect(state.orgUpdates).toEqual([]);
  });

  it("ignores events for a customer with no matching organization", async () => {
    const event = stripeEvent("invoice.payment_failed", { customer: "cus_unknown" });
    const response = await POST(request(event));
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(state.orgUpdates).toEqual([]);
  });

  it("returns ok for an unhandled event type without writing anything", async () => {
    const event = stripeEvent("charge.refunded", {});
    const response = await POST(request(event));
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(state.orgUpdates).toEqual([]);
    expect(state.subscriptionUpserts).toEqual([]);
  });
});
