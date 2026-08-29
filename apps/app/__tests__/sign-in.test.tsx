import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

// The page is now an async Server Component (checks currentUser() for the
// signed-in inverse guard before rendering) - mock it out rather than hit
// a real Supabase client, and call the page function directly since RTL's
// render() can't invoke an async component on its own.
vi.mock("@repo/auth/server", () => ({
  currentUser: vi.fn(() => Promise.resolve(null)),
}));

import Page from "../app/(unauthenticated)/sign-in/[[...sign-in]]/page";

test("Sign In Page", async () => {
  const { container } = render(
    await Page({ searchParams: Promise.resolve({}) })
  );
  expect(container).toBeDefined();
});
