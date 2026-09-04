"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useActionState } from "react";
import {
  type BillingActionState,
  createCheckoutSession,
  createPortalSession,
} from "../../../actions/billing/checkout";

const initialState: BillingActionState = {};

// A successful submit always redirects (to Stripe Checkout / the Billing
// Portal) — `useActionState` here exists only to surface the error case
// (unconfigured Stripe, missing price, not an admin) inline, same pattern
// `NewSiteForm`/`ConnectWordPressForm` already use.
export const ChoosePlanForm = ({
  planId,
  planName,
}: {
  planId: string;
  planName: string;
}) => {
  const [state, formAction, isPending] = useActionState(
    createCheckoutSession,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input name="plan_id" type="hidden" value={planId} />
      <Button disabled={isPending} size="sm" type="submit">
        {isPending ? "Redirecting…" : `Choose ${planName}`}
      </Button>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
    </form>
  );
};

export const ManageBillingForm = () => {
  const [state, formAction, isPending] = useActionState(
    createPortalSession,
    initialState
  );

  return (
    <form action={formAction}>
      <Button disabled={isPending} type="submit" variant="outline">
        {isPending ? "Redirecting…" : "Manage billing"}
      </Button>
      {state.error && (
        <p className="mt-1 text-destructive text-xs">{state.error}</p>
      )}
    </form>
  );
};
