
import NextAuth, {
  type NextAuthOptions,
} from "next-auth";

import CredentialsProvider from
  "next-auth/providers/credentials";

import dbConnect from "@/lib/db";
import User from "@/models/User";

import {
  comparePassword,
} from "@/lib/auth";

/* =========================================
   CONSTANTS
========================================= */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_ID_REGEX =
  /^[a-f\d]{24}$/i;

const SESSION_MAX_AGE =
  7 * 24 * 60 * 60;

const SESSION_UPDATE_AGE =
  24 * 60 * 60;

const MAX_PASSWORD_BYTES = 72;

/* =========================================
   TYPES
========================================= */

type UserRole =
  | "user"
  | "admin";

type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
};

type SessionError =
  | "SessionInvalid"
  | "SessionUnavailable";

/* =========================================
   HELPERS
========================================= */

function normalizeEmail(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const email =
    value.trim().toLowerCase();

  if (
    email.length === 0 ||
    email.length > 254 ||
    !EMAIL_REGEX.test(email)
  ) {
    return null;
  }

  return email;
}

function isValidPasswordInput(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(
      value,
      "utf8"
    ) <= MAX_PASSWORD_BYTES
  );
}

function isValidUserId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    USER_ID_REGEX.test(value)
  );
}

function normalizeRole(
  value: unknown
): UserRole {
  return value === "admin"
    ? "admin"
    : "user";
}

/* =========================================
   INVALIDATE JWT IDENTITY
========================================= */

function invalidateToken<
  T extends {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    role?: unknown;
    phone?: unknown;
    error?: unknown;
  }
>(
  token: T,
  reason: SessionError
): T {
  return {
    ...token,
    id: "",
    name: "",
    email: "",
    role: "user",
    phone: "",
    error: reason,
  };
}

/* =========================================
   NEXTAUTH CONFIGURATION
========================================= */

export const authOptions: NextAuthOptions = {
  /* =====================================
     SECRET
  ===================================== */

  secret:
    process.env.NEXTAUTH_SECRET,

  /* =====================================
     SESSION CONFIGURATION
  ===================================== */

  session: {
    strategy: "jwt",

    maxAge: SESSION_MAX_AGE,

    updateAge: SESSION_UPDATE_AGE,
  },

  jwt: {
    maxAge: SESSION_MAX_AGE,
  },

  /* =====================================
     CREDENTIALS PROVIDER
  ===================================== */

  providers: [
    CredentialsProvider({
      name: "Credentials",

      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder:
            "you@example.com",
        },

        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(
        credentials
      ): Promise<AuthenticatedUser | null> {
        /* VALIDATE INPUT */

        const email =
          normalizeEmail(
            credentials?.email
          );

        const password =
          credentials?.password;

        if (
          !email ||
          !isValidPasswordInput(password)
        ) {
          return null;
        }

        /* CONNECT DATABASE */

        await dbConnect();

        /* FIND VERIFIED USER */

        const user =
          await User.findOne({
            email,
            isVerified: true,
          }).select(
            "_id name email phone role isVerified +password"
          );

        if (!user) {
          return null;
        }

        /* VALIDATE PASSWORD HASH */

        if (
          typeof user.password !==
            "string" ||
          user.password.length === 0
        ) {
          return null;
        }

        const isPasswordValid =
          await comparePassword(
            password,
            user.password
          );

        if (!isPasswordValid) {
          return null;
        }

        /* NORMALIZE IDENTITY */

        const userId =
          String(user._id);

        const userEmail =
          normalizeEmail(
            user.email
          );

        if (
          !isValidUserId(userId) ||
          !userEmail
        ) {
          return null;
        }

        return {
          id: userId,

          name:
            typeof user.name ===
            "string"
              ? user.name.trim()
              : "",

          email: userEmail,

          role:
            normalizeRole(
              user.role
            ),

          phone:
            typeof user.phone ===
            "string"
              ? user.phone.trim()
              : "",
        };
      },
    }),
  ],

  /* =====================================
     CALLBACKS
  ===================================== */

  callbacks: {
    /* ===================================
       JWT CALLBACK
    =================================== */

    async jwt({
      token,
      user,
    }) {
      /* INITIAL LOGIN */

      if (user) {
        const authenticatedUser =
          user as typeof user & {
            role?: UserRole;
            phone?: string;
          };

        if (
          !isValidUserId(user.id) ||
          !normalizeEmail(user.email)
        ) {
          return invalidateToken(
            token,
            "SessionInvalid"
          );
        }

        token.id = user.id;

        token.name =
          typeof user.name ===
          "string"
            ? user.name
            : "";

        token.email =
          normalizeEmail(
            user.email
          );

        token.role =
          normalizeRole(
            authenticatedUser.role
          );

        token.phone =
          typeof authenticatedUser.phone ===
          "string"
            ? authenticatedUser.phone
            : "";

        delete token.error;

        return token;
      }

      /* =================================
         EXISTING SESSION VALIDATION
      ================================= */

      if (
        !isValidUserId(token.id)
      ) {
        return invalidateToken(
          token,
          "SessionInvalid"
        );
      }

      try {
        await dbConnect();

        const currentUser =
          await User.findOne({
            _id: token.id,
            isVerified: true,
          })
            .select(
              "_id name email phone role"
            )
            .lean();

        if (!currentUser) {
          return invalidateToken(
            token,
            "SessionInvalid"
          );
        }

        const currentEmail =
          normalizeEmail(
            currentUser.email
          );

        if (!currentEmail) {
          return invalidateToken(
            token,
            "SessionInvalid"
          );
        }

        /* REFRESH IDENTITY */

        token.id =
          String(currentUser._id);

        token.name =
          typeof currentUser.name ===
          "string"
            ? currentUser.name.trim()
            : "";

        token.email =
          currentEmail;

        token.role =
          normalizeRole(
            currentUser.role
          );

        token.phone =
          typeof currentUser.phone ===
          "string"
            ? currentUser.phone.trim()
            : "";

        delete token.error;

        return token;
      } catch (error: unknown) {
        console.error(
          "NEXTAUTH_SESSION_REVALIDATION_ERROR:",
          error instanceof Error
            ? error.name
            : "UnknownError"
        );

        /*
         * Fail closed when database
         * validation is unavailable.
         *
         * The JWT remains signed, but
         * the exposed session identity
         * is not authenticated.
         */
        return invalidateToken(
          token,
          "SessionUnavailable"
        );
      }
    },

    /* ===================================
       SESSION CALLBACK
    =================================== */

    async session({
      session,
      token,
    }) {
      if (!session.user) {
        return session;
      }

      const sessionUser =
        session.user as typeof session.user & {
          id?: string;
          role?: UserRole;
          phone?: string;
        };

      const email =
        normalizeEmail(
          token.email
        );

      /* INVALID SESSION */

      if (
        token.error ||
        !isValidUserId(token.id) ||
        !email
      ) {
        sessionUser.id = "";
        sessionUser.name = "";
        sessionUser.email = "";
        sessionUser.role = "user";
        sessionUser.phone = "";

        return session;
      }

      /* VALID SESSION */

      sessionUser.id =
        token.id;

      sessionUser.role =
        normalizeRole(
          token.role
        );

      sessionUser.phone =
        typeof token.phone ===
        "string"
          ? token.phone
          : "";

      sessionUser.name =
        typeof token.name ===
        "string"
          ? token.name
          : "";

      sessionUser.email =
        email;

      return session;
    },
  },

  /* =====================================
     CUSTOM AUTH PAGES
  ===================================== */

  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },

  /* =====================================
     COOKIE SECURITY
  ===================================== */

  useSecureCookies:
    process.env.NODE_ENV ===
    "production",

  /* =====================================
     DEBUG
  ===================================== */

  debug: false,
};

/* =========================================
   NEXTAUTH HANDLER
========================================= */

export default NextAuth(
  authOptions
);
