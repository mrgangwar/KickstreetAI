
import {
  withAuth,
} from "next-auth/middleware";

import { NextResponse } from "next/server";

/* =========================================
   CONSTANTS
========================================= */

const USER_ID_REGEX =
  /^[a-f\d]{24}$/i;

/* =========================================
   HELPERS
========================================= */

function isValidUserId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    USER_ID_REGEX.test(value)
  );
}

/* =========================================
   AUTHENTICATION MIDDLEWARE
========================================= */

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        return !!token && isValidUserId(token.id) && token.error !== "SessionInvalid";
      },
    },
    pages: {
      signIn: "/auth/login",
    },
    secret: process.env.NEXTAUTH_SECRET,
  }
);

/* =========================================
   MIDDLEWARE MATCHER
========================================= */

/*
 * Protect only admin pages.
 *
 * Customer authentication remains
 * the responsibility of the relevant
 * pages and API endpoints.
 *
 * Every sensitive admin API must
 * independently verify:
 *
 * 1. The user is authenticated.
 * 2. The user account still exists.
 * 3. The user is verified.
 * 4. The current database role is admin.
 */

export const config = {
  matcher: [
    "/admin/:path*",
  ],
};
