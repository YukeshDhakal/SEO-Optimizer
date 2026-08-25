import { createServerClient } from "@supabase/ssr";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { keys } from "./keys";

type AuthMiddlewareCallback = (
  userId: string | null,
  request: NextRequest,
  event: NextFetchEvent
) => Response | undefined | Promise<Response | undefined>;

// Supabase's SSR session-refresh middleware, composed the same way the
// previous Clerk `clerkMiddleware` was: call `authMiddleware(callback)` and
// the callback runs after the session cookie has been refreshed, receiving
// the (possibly null) authenticated user id instead of Clerk's `auth` object.
export const authMiddleware = (callback?: AuthMiddlewareCallback) => {
  return async (request: NextRequest, event: NextFetchEvent) => {
    let response = NextResponse.next({ request });
    const env = keys();

    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (callback) {
      const result = await callback(user?.id ?? null, request, event);

      if (result) {
        return result;
      }
    }

    return response;
  };
};
