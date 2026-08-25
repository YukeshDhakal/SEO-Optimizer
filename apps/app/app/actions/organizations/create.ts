"use server";

import { createClient } from "@repo/auth/server";
import { redirect } from "next/navigation";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export interface CreateOrganizationState {
  error?: string;
}

export const createOrganization = async (
  _prevState: CreateOrganizationState,
  formData: FormData
): Promise<CreateOrganizationState> => {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Organization name is required." };
  }

  const slug = slugify(name);

  if (!slug) {
    return {
      error: "That name doesn't contain any usable characters for a URL.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization_with_owner", {
    org_name: name,
    org_slug: slug,
  });

  if (error) {
    // Postgres unique_violation on organizations.slug
    if (error.code === "23505") {
      return {
        error:
          "That name is already taken. Try a slightly different name.",
      };
    }

    return { error: "Couldn't create the organization. Please try again." };
  }

  redirect("/");
};
