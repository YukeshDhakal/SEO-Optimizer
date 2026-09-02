import type { Metadata } from "next";
import { Suspense } from "react";
import { DeleteAccountPanel } from "./delete-account-panel";
import { IdentityManager } from "./identity-manager";
import { ProfilePanel } from "./profile-panel";

export const metadata: Metadata = {
  title: "Account",
};

const AccountPage = () => (
  <div className="flex flex-1 flex-col gap-5 p-6">
    <div>
      <h1 className="font-display text-3xl tracking-tight">ACCOUNT</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        Your profile, how you sign in, and account-level settings.
      </p>
    </div>
    <div className="flex max-w-lg flex-col gap-6">
      <ProfilePanel />
      <Suspense fallback={null}>
        <IdentityManager />
      </Suspense>
      <DeleteAccountPanel />
    </div>
  </div>
);

export default AccountPage;
