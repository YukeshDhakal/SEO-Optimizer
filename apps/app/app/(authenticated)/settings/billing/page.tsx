import { createClient } from "@repo/auth/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { currentPeriodBounds } from "@repo/workflows";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../lib/organization";
import { ChoosePlanForm, ManageBillingForm } from "./billing-actions";

export const metadata: Metadata = { title: "Billing" };

const BillingPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();

  const [{ data: plans }, { data: subscription }] = await Promise.all([
    supabase.from("plans").select("*").order("monthly_post_quota", { ascending: true }),
    supabase
      .from("subscriptions")
      .select("*, plans(*)")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  const { periodStart } = currentPeriodBounds();
  const { data: usage } = await supabase
    .from("usage_counters")
    .select("posts_generated")
    .eq("organization_id", organization.id)
    .eq("period_start", periodStart.toISOString())
    .maybeSingle();

  const currentPlan = subscription?.plans ?? null;
  const postsUsed = usage?.posts_generated ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div>
        <h1 className="font-semibold text-2xl">Billing</h1>
        <p className="text-muted-foreground text-sm">{organization.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current plan</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            {currentPlan ? (
              <>
                <p className="font-medium">{currentPlan.name}</p>
                <p className="text-muted-foreground text-sm">
                  {postsUsed} / {currentPlan.monthly_post_quota} posts used this month · subscription{" "}
                  {subscription?.status ?? "active"}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No plan selected yet. This organization currently has an unlimited post quota by default
                (see the plans below).
              </p>
            )}
            {organization.status === "past_due" && (
              <p className="mt-1 text-destructive text-sm">
                Payment is past due — scheduled (autonomous) publishing is paused until this is resolved.
                Manual actions still work.
              </p>
            )}
          </div>
          {organization.stripe_customer_id && <ManageBillingForm />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plans</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(plans ?? []).map((plan) => (
            <div className="flex items-center justify-between rounded-md border p-3" key={plan.id}>
              <div>
                <p className="font-medium">{plan.name}</p>
                <p className="text-muted-foreground text-sm">
                  {plan.monthly_post_quota} posts/month · {plan.seats} seat{plan.seats === 1 ? "" : "s"}
                </p>
                {!plan.stripe_price_id && (
                  <p className="text-muted-foreground text-xs">
                    Not yet connected to a Stripe Price — checkout isn't available for this plan yet.
                  </p>
                )}
              </div>
              {currentPlan?.id === plan.id ? (
                <span className="text-muted-foreground text-sm">Current plan</span>
              ) : (
                <ChoosePlanForm planId={plan.id} planName={plan.name} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingPage;
