
import {
  Html,
  Head,
  Main,
  NextScript,
} from "next/document";

import type {
  DocumentProps,
} from "next/document";

/* =========================================
   KICKSTREET CUSTOM DOCUMENT
========================================= */

export default function Document(
  _props: DocumentProps
) {
  return (
    <Html lang="en">
      <Head />

      <body className="bg-white text-black antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
