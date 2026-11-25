
import type {
  AppProps,
} from "next/app";

import Head from "next/head";

import {
  useRouter,
} from "next/router";

import {
  SessionProvider,
} from "next-auth/react";

import {
  Toaster,
} from "react-hot-toast";

import {
  CartProvider,
} from "@/context/CartContext";

import Footer from "@/components/Footer";

import "@/styles/globals.css";

/* =========================================
   TYPES
========================================= */

type AppPageProps = AppProps["pageProps"] & {
  session?: React.ComponentProps<
    typeof SessionProvider
  >["session"];
};

/* =========================================
   ROUTE HELPERS
========================================= */

function isRouteOrChild(
  pathname: string,
  route: string
): boolean {
  return (
    pathname === route ||
    pathname.startsWith(
      `${route}/`
    )
  );
}

/* =========================================
   KICKSTREET GLOBAL APPLICATION
========================================= */

export default function App({
  Component,
  pageProps,
}: AppProps) {
  const router =
    useRouter();

  /* =====================================
     NEXTAUTH SESSION
  ===================================== */

  const {
    session,
    ...restPageProps
  } = pageProps as AppPageProps;

  /* =====================================
     ROUTE DETECTION
  ===================================== */

  const isAdminPage =
    isRouteOrChild(
      router.pathname,
      "/admin"
    );

  const isAuthPage =
    isRouteOrChild(
      router.pathname,
      "/auth"
    );

  /* =====================================
     FOOTER VISIBILITY
  ===================================== */

  const showFooter =
    !isAdminPage &&
    !isAuthPage;

  /* =====================================
     APPLICATION RENDER
  ===================================== */

  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={true}
    >
      {/* =================================
          GLOBAL HEAD
      ================================= */}

      <Head>
        <title>
          KICKSTREET | Heat For Your Feet
        </title>

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />

        <meta
          name="theme-color"
          content="#000000"
        />

        <link
          rel="icon"
          href="/KickStreetLogo.png"
          type="image/png"
        />

        <link
          rel="apple-touch-icon"
          href="/KickStreetLogo.png"
        />
      </Head>

      {/* =================================
          GLOBAL CART PROVIDER
      ================================= */}

      <CartProvider>
        {/* =============================
            GLOBAL TOAST NOTIFICATIONS
        ============================= */}

        <Toaster
          position="top-center"
          reverseOrder={false}
          gutter={10}
          containerStyle={{
            top: 20,
            left: 16,
            right: 16,
            zIndex: 99999,
          }}
          toastOptions={{
            duration: 4000,

            className:
              "kickstreet-toast",

            style: {
              background: "#000000",
              color: "#ffffff",

              borderRadius: "12px",

              fontSize: "12px",
              fontWeight: "800",

              textTransform:
                "uppercase",

              letterSpacing:
                "0.08em",

              padding: "14px 18px",

              width: "100%",
              maxWidth: "350px",

              border:
                "1px solid rgba(255,255,255,0.1)",

              boxShadow:
                "0 25px 50px -12px rgba(0,0,0,0.5)",
            },

            success: {
              iconTheme: {
                primary: "#ea580c",
                secondary: "#ffffff",
              },
            },

            error: {
              style: {
                background: "#000000",

                borderLeft:
                  "4px solid #dc2626",
              },
            },
          }}
        />

        {/* =============================
            GLOBAL APPLICATION WRAPPER
        ============================= */}

        <div
          id="app-root"
          className="
            antialiased
            selection:bg-orange-600
            selection:text-white
            min-h-screen
            w-full
            max-w-full
            flex
            flex-col
          "
        >
          {/* =========================
              CURRENT PAGE
          ========================= */}

          <Component
            {...restPageProps}
          />

          {/* =========================
              GLOBAL FOOTER
          ========================= */}

          {showFooter && (
            <Footer />
          )}
        </div>
      </CartProvider>
    </SessionProvider>
  );
}
