"use client";

import { createClient } from "@repo/auth/client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";

interface ProfileData {
  email: string;
  fullName: string;
  avatarUrl: string | null;
  joinedAt: string;
  orgName: string | null;
  role: string | null;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Reads/writes user_profiles directly against the live client session
// (RLS already scopes every row to auth.uid() = user_id, see the Phase 1
// migration), same posture as identity-manager.tsx - no server action
// needed for a plain field edit, only for the audit-logged security
// actions elsewhere on this page. The avatars bucket + its owner-scoped
// storage policies were provisioned in the same migration pass that
// added user_profiles' RLS.
export const ProfilePanel = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }

    const [{ data: profileRow }, { data: membership }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("full_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("organization_members")
        .select("role, organizations(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    setProfile({
      email: user.email ?? "",
      fullName: profileRow?.full_name ?? "",
      avatarUrl: profileRow?.avatar_url ?? null,
      joinedAt: user.created_at,
      orgName: membership?.organizations?.name ?? null,
      role: membership?.role ?? null,
    });
    setFullName(profileRow?.full_name ?? "");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setError(null);

    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image must be 2MB or smaller.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Use a PNG, JPEG, or WebP image.");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploading(false);
      return;
    }

    const extension = file.name.split(".").pop() ?? "png";
    const path = `${user.id}/avatar.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-bust so the new image shows immediately even though the path
    // is stable across re-uploads (upsert keeps the same filename).
    const bustedUrl = `${publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: bustedUrl })
      .eq("user_id", user.id);

    setUploading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refresh();
  };

  const handleSaveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNameSaved(false);
    setSavingName(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSavingName(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ full_name: fullName })
      .eq("user_id", user.id);

    setSavingName(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNameSaved(true);
    await refresh();
  };

  if (!profile) {
    return (
      <div className="border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111]">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111]">
      <h2 className="font-display text-lg tracking-tight">PROFILE</h2>
      <div className="mt-4 flex items-center gap-4">
        <Avatar className="size-16 rounded-none border-[3px] border-foreground">
          <AvatarImage
            className="rounded-none"
            src={profile.avatarUrl ?? undefined}
          />
          <AvatarFallback className="rounded-none font-display text-lg">
            {(profile.fullName || profile.email).charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <input
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
            ref={fileInputRef}
            type="file"
          />
          <Button
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            {uploading ? "Uploading…" : "Change photo"}
          </Button>
          <p className="mt-1 text-muted-foreground text-xs">
            PNG, JPEG, or WebP. Up to 2MB.
          </p>
        </div>
      </div>

      <form className="mt-5 flex flex-col gap-3" onSubmit={handleSaveName}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="full-name">Name</Label>
          <Input
            id="full-name"
            onChange={(event) => {
              setFullName(event.target.value);
              setNameSaved(false);
            }}
            value={fullName}
          />
        </div>
        <Button
          className="self-start"
          disabled={savingName || fullName === profile.fullName}
          size="sm"
          type="submit"
        >
          {savingName ? "Saving…" : "Save name"}
        </Button>
        {nameSaved && <p className="font-medium text-sm">Saved.</p>}
      </form>

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-foreground border-t-[3px] pt-4 text-sm">
        <dt className="font-bold">Email</dt>
        <dd className="text-muted-foreground">{profile.email}</dd>
        {profile.orgName && (
          <>
            <dt className="font-bold">Organization</dt>
            <dd className="text-muted-foreground">{profile.orgName}</dd>
          </>
        )}
        {profile.role && (
          <>
            <dt className="font-bold">Role</dt>
            <dd className="text-muted-foreground capitalize">{profile.role}</dd>
          </>
        )}
        <dt className="font-bold">Joined</dt>
        <dd className="text-muted-foreground">
          {new Date(profile.joinedAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </dd>
      </dl>

      {error && <p className="mt-3 font-medium text-destructive text-sm">{error}</p>}
    </div>
  );
};
