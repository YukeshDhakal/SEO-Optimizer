import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { currentUser } from "@repo/auth/server";
import { redirect } from "next/navigation";

const title = "Welcome back";
const description = "Enter your details to sign in.";
const SignIn = dynamic(() =>
  import("@repo/auth/components/sign-in").then((mod) => mod.SignIn)
);

export const metadata: Metadata = createMetadata({ title, description });

interface SignInPageProps {
  readonly searchParams?: Promise<{ next?: string | string[] }>;
}

const safeNextUrl = (next: string | string[] | undefined) => {
  const value = typeof next === "string" ? next : "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
};

const SignInPage = async ({ searchParams }: SignInPageProps) => {
  if (await currentUser()) {
    redirect("/");
  }

  const { next } = (await searchParams) ?? {};
  return <SignIn nextUrl={safeNextUrl(next)} />;
};

export default SignInPage;
