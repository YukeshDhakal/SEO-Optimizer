import type { Metadata } from "next";
import { Suspense } from "react";
import { IdentityManager } from "./identity-manager";

export const metadata: Metadata = {
  title: "Account",
};

const AccountPage = () => (
  <div className="flex flex-1 flex-col gap-5 p-6">
    <div>
      <h1 className="font-display text-3xl tracking-tight">ACCOUNT</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        How you sign in to Quillrun — connected providers and your password.
      </p>
    </div>
    <div className="max-w-lg">
      <Suspense fallback={null}>
        <IdentityManager />
      </Suspense>
    </div>
  </div>
);

export default AccountPage;
