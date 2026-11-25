
import {
  withAuth,
} from "next-auth/middleware";

import {
  NextResponse,
} from "next/server";

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
    /* =====================================
       REQUEST DETAILS
    ===================================== */

    const token =
      req.nextauth.token;

    const pathname =
      req.nextUrl.pathname;

    /* =====================================
       ADMIN ROUTE PROTECTION
    ===================================== */

    if (
      pathname === "/admin" ||
      pathname.startsWith("/admin/")
    ) {
      /* ===================================
         INVALID SESSION
      =================================== */

      if (
        !token ||
        !isValidUserId(token.id) ||
        token.error ===
          "SessionInvalid"
      ) {
        const loginUrl =
          new URL(
            "/auth/login",
            req.url
          );

        loginUrl.searchParams.set(
          "callbackUrl",
          req.nextUrl.pathname +
            req.nextUrl.search
        );

        return NextResponse.redirect(
          loginUrl
        );
      }

      /* ===================================
         ADMIN ROLE REQUIRED
      =================================== */

      if (
        token.role !== "admin"
      ) {
        return NextResponse.redirect(
          new URL(
            "/",
            req.url
          )
        );
      }
    }

    /* =====================================
       ALLOW REQUEST
    ===================================== */

    return NextResponse.next();
  },
  {
    /* =====================================
       AUTHORIZATION CALLBACK
    ===================================== */

    callbacks: {
      authorized: ({
        token,
      }) => {
        return (
          !!token &&
          isValidUserId(token.id) &&
          token.error !==
            "SessionInvalid"
        );
      },
    },

    /* =====================================
       CUSTOM LOGIN PAGE
    ===================================== */

    pages: {
      signIn: "/auth/login",
    },

    /* =====================================
       NEXTAUTH SECRET
    ===================================== */

    secret:
      process.env.NEXTAUTH_SECRET,
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
