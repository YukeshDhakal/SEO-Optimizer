"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { useActionState, useRef, useState } from "react";
import {
  type CreateSiteConnectionState,
  createSiteConnection,
} from "../../actions/site-connections/create";

const initialState: CreateSiteConnectionState = {};

// Platform card copy matches the neobrutalism handoff's "WHERE SHOULD WE
// PUBLISH?" Connect screen exactly. The credentials step for whichever
// platform gets picked here already exists per-CMS (connect-wordpress-
// form.tsx, connect-shopify-form.tsx, connect-webflow-form.tsx, rendered
// on the site detail page once this row exists) — this form is just step
// one, name + platform, matching what createSiteConnection has always
// taken.
const PLATFORMS = [
  { id: "wordpress", label: "WordPress", detail: "REST API · application password" },
  { id: "webflow", label: "Webflow", detail: "CMS collection · site token" },
  { id: "shopify", label: "Shopify", detail: "Blog resource · admin API" },
  { id: "hosted_blog", label: "Hosted blog", detail: "We provide it · your domain" },
] as const;

export const NewSiteForm = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const [cmsType, setCmsType] = useState<string>(PLATFORMS[0].id);
  const [state, formAction, isPending] = useActionState(
    async (
      prevState: CreateSiteConnectionState,
      formData: FormData
    ): Promise<CreateSiteConnectionState> => {
      const result = await createSiteConnection(prevState, formData);
      if (!result.error) {
        formRef.current?.reset();
        setCmsType(PLATFORMS[0].id);
      }
      return result;
    },
    initialState
  );

  return (
    <div className="border-[3px] border-foreground bg-card p-6 shadow-[8px_8px_0_#111]">
      <div className="mb-4 flex items-center gap-3 font-bold text-xs uppercase tracking-[0.12em]">
        <span className="border-[3px] border-foreground bg-accent px-3 py-1">
          1 Name
        </span>
        <span className="border-[3px] border-foreground bg-primary px-3 py-1 text-primary-foreground">
          2 Connect a site
        </span>
      </div>
      <h2 className="font-display text-2xl tracking-tight">
        WHERE SHOULD WE PUBLISH?
      </h2>
      <p className="mt-1 max-w-xl text-muted-foreground text-sm">
        One adapter interface, your choice of CMS — published under your own
        domain. Pick a platform, then connect its credentials once the site
        is created.
      </p>

      <form action={formAction} className="mt-6 flex flex-col gap-5" ref={formRef}>
        <input name="cms_type" type="hidden" value={cmsType} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PLATFORMS.map((platform) => (
            <button
              className={cn(
                "flex flex-col gap-1.5 border-[3px] border-foreground p-4 text-left transition-transform hover:-translate-y-0.5",
                cmsType === platform.id
                  ? "bg-primary text-primary-foreground shadow-[5px_5px_0_#111]"
                  : "bg-background"
              )}
              key={platform.id}
              onClick={() => setCmsType(platform.id)}
              type="button"
            >
              <span className="font-bold text-base">{platform.label}</span>
              <span className="text-xs">{platform.detail}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="display_name">Name</Label>
            <Input
              id="display_name"
              name="display_name"
              placeholder="My blog"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="base_url">Site URL</Label>
            <Input
              id="base_url"
              name="base_url"
              placeholder="https://example.com"
              type="url"
            />
          </div>
        </div>

        {state.error && (
          <p className="font-medium text-destructive text-sm">{state.error}</p>
        )}
        <Button className="w-fit" disabled={isPending} type="submit">
          {isPending ? "Adding…" : "Add site"}
        </Button>
      </form>
    </div>
  );
};
