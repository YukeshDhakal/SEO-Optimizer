import { currentUser } from "@repo/auth/server";
import { redirect } from "next/navigation";
import { Header } from "../components/header";

interface SearchPageProperties {
  searchParams: Promise<{
    q: string;
  }>;
}

export const generateMetadata = async ({
  searchParams,
}: SearchPageProperties) => {
  const { q } = await searchParams;

  return {
    title: `${q} - Search results`,
    description: `Search results for ${q}`,
  };
};

// NOTE: the demo `database.page` search was dropped with the Prisma stub
// schema — Phase 1's real schema (content_topics, posts, etc.) will give
// this something real to search.
const SearchPage = async ({ searchParams }: SearchPageProperties) => {
  const { q } = await searchParams;
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (!q) {
    redirect("/");
  }

  return (
    <>
      <Header page="Search" pages={["Building Your Application"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" />
      </div>
    </>
  );
};

export default SearchPage;
