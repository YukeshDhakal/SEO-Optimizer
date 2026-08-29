import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { currentUser } from "@repo/auth/server";
import { redirect } from "next/navigation";

const title = "Create an account";
const description = "Enter your details to get started.";
const SignUp = dynamic(() =>
  import("@repo/auth/components/sign-up").then((mod) => mod.SignUp)
);

export const metadata: Metadata = createMetadata({ title, description });

interface SignUpPageProps {
  readonly searchParams?: Promise<{ next?: string | string[] }>;
}

const safeNextUrl = (next: string | string[] | undefined) => {
  const value = typeof next === "string" ? next : "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
};

const SignUpPage = async ({ searchParams }: SignUpPageProps) => {
  if (await currentUser()) {
    redirect("/");
  }

  const { next } = (await searchParams) ?? {};
  return <SignUp nextUrl={safeNextUrl(next)} />;
};

export default SignUpPage;
