import { createClient } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateTenantSettings } from "../../actions/tenant-settings/mutate";
import { getCurrentOrganization } from "../../lib/organization";

export const metadata: Metadata = { title: "Settings" };

// Org-wide guardrail toggles (Phase 4 slice of tenant_settings — the full
// guardrail rollout, duplicate-content detection etc., is Phase 5).
const SettingsPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const canManage =
    organization.role === "owner" || organization.role === "admin";

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("*")
    .eq("organization_id", organization.id)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Settings</h1>
          <p className="text-muted-foreground text-sm">{organization.name}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings/audit">Audit log</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content generation</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateTenantSettings} className="flex flex-col gap-4">
            <input
              name="organization_id"
              type="hidden"
              value={organization.id}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                defaultChecked={settings?.require_approval ?? false}
                disabled={!canManage}
                name="require_approval"
                type="checkbox"
              />
              Require approval before a generated draft is written
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                defaultChecked={settings?.paused ?? false}
                disabled={!canManage}
                name="paused"
                type="checkbox"
              />
              Pause all content generation for this organization
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="max_posts_per_day">Max posts / day</Label>
                <Input
                  defaultValue={settings?.max_posts_per_day ?? ""}
                  disabled={!canManage}
                  id="max_posts_per_day"
                  name="max_posts_per_day"
                  type="number"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="max_posts_per_week">Max posts / week</Label>
                <Input
                  defaultValue={settings?.max_posts_per_week ?? ""}
                  disabled={!canManage}
                  id="max_posts_per_week"
                  name="max_posts_per_week"
                  type="number"
                />
              </div>
            </div>
            {canManage && (
              <Button className="self-start" type="submit">
                Save
              </Button>
            )}
          </form>
          {!canManage && (
            <p className="mt-2 text-muted-foreground text-xs">
              Only owners and admins can change these settings.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
