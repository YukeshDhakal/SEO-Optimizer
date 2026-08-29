import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

// See sign-in.test.tsx for why currentUser() needs mocking here.
vi.mock("@repo/auth/server", () => ({
  currentUser: vi.fn(() => Promise.resolve(null)),
}));

import Page from "../app/(unauthenticated)/sign-up/[[...sign-up]]/page";

test("Sign Up Page", async () => {
  const { container } = render(
    await Page({ searchParams: Promise.resolve({}) })
  );
  expect(container).toBeDefined();
});
