
import {
  createHash,
  randomInt,
} from "node:crypto";

import nodemailer from "nodemailer";

import type {
  Transporter,
} from "nodemailer";

/* =========================================
   KICKSTREET EMAIL CONFIGURATION
========================================= */

const OTP_LENGTH = 6;

const OTP_EXPIRY_MINUTES = 5;

const OTP_EXPIRY_MS =
  OTP_EXPIRY_MINUTES * 60 * 1000;

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_REGEX =
  /^\d{6}$/;

const SMTP_CONNECTION_TIMEOUT = 10000;

const SMTP_GREETING_TIMEOUT = 10000;

const SMTP_SOCKET_TIMEOUT = 20000;

/* =========================================
   TYPES
========================================= */

type EmailPurpose =
  | "verification"
  | "password-reset";

type EmailTemplate = {
  subject: string;
  heading: string;
  description: string;
  footerMessage: string;
};

type EmailCredentials = {
  user: string;
  pass: string;
};

/* =========================================
   SMTP TRANSPORT CACHE
========================================= */

let cachedTransporter:
  | Transporter
  | null = null;

let cachedTransportKey:
  | string
  | null = null;

/* =========================================
   EMAIL VALIDATION
========================================= */

function normalizeEmail(
  value: unknown
): string {
  if (typeof value !== "string") {
    throw new Error(
      "Invalid email address."
    );
  }

  const email =
    value.trim().toLowerCase();

  if (
    email.length === 0 ||
    email.length > 254 ||
    !EMAIL_REGEX.test(email)
  ) {
    throw new Error(
      "Invalid email address."
    );
  }

  return email;
}

/* =========================================
   SMTP CREDENTIALS
========================================= */

function getEmailCredentials():
  EmailCredentials {
  const user =
    process.env.EMAIL_USER?.trim();

  const pass =
    process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error(
      "Email service is not configured. Set EMAIL_USER and EMAIL_PASS."
    );
  }

  return {
    user: normalizeEmail(user),
    pass,
  };
}

/* =========================================
   TRANSPORT FINGERPRINT
========================================= */

function getTransportKey(
  credentials: EmailCredentials
): string {
  /*
   * Avoid storing a second plaintext
   * copy of the SMTP password as
   * the transport cache key.
   *
   * The transporter itself still
   * holds credentials in memory.
   */

  return createHash("sha256")
    .update(
      JSON.stringify([
        credentials.user,
        credentials.pass,
      ])
    )
    .digest("hex");
}

/* =========================================
   SMTP TRANSPORTER
========================================= */

function getTransporter():
  Transporter {
  const credentials =
    getEmailCredentials();

  const transportKey =
    getTransportKey(credentials);

  if (
    cachedTransporter &&
    cachedTransportKey === transportKey
  ) {
    return cachedTransporter;
  }

  /*
   * Close previous connection pool
   * if SMTP credentials changed.
   */

  if (cachedTransporter) {
    cachedTransporter.close();

    cachedTransporter = null;
    cachedTransportKey = null;
  }

  const transporter =
    nodemailer.createTransport({
      host: "smtp.gmail.com",

      port: 465,

      secure: true,

      auth: {
        user: credentials.user,
        pass: credentials.pass,
      },

      connectionTimeout:
        SMTP_CONNECTION_TIMEOUT,

      greetingTimeout:
        SMTP_GREETING_TIMEOUT,

      socketTimeout:
        SMTP_SOCKET_TIMEOUT,

      pool: true,

      maxConnections: 2,

      maxMessages: 50,
    });

  cachedTransporter =
    transporter;

  cachedTransportKey =
    transportKey;

  return transporter;
}

/* =========================================
   SECURE OTP GENERATION
========================================= */

export function generateOTP(): string {
  /*
   * crypto.randomInt() uses a
   * cryptographically secure source.
   *
   * Range:
   * 100000 to 999999
   */

  const minimum =
    10 ** (OTP_LENGTH - 1);

  const maximum =
    10 ** OTP_LENGTH;

  return String(
    randomInt(
      minimum,
      maximum
    )
  );
}

/* =========================================
   OTP EXPIRY
========================================= */

export function getOTPExpiry(): Date {
  return new Date(
    Date.now() + OTP_EXPIRY_MS
  );
}

/* =========================================
   OTP VALIDATION
========================================= */

function validateOTP(
  value: unknown
): string {
  if (
    typeof value !== "string" ||
    !OTP_REGEX.test(value)
  ) {
    throw new Error(
      "OTP must contain exactly 6 digits."
    );
  }

  return value;
}

/* =========================================
   EMAIL TEMPLATE CONFIGURATION
========================================= */

function getEmailTemplate(
  purpose: EmailPurpose
): EmailTemplate {
  if (
    purpose === "password-reset"
  ) {
    return {
      subject:
        "KickStreet | Password Reset Code",

      heading:
        "Reset Your Password",

      description:
        "We received a request to reset " +
        "your KickStreet account password. " +
        "Use the verification code below " +
        "to continue.",

      footerMessage:
        "If you did not request a password " +
        "reset, you can safely ignore this " +
        "email. Do not share this code.",
    };
  }

  return {
    subject:
      "KickStreet | Verify Your Email",

    heading:
      "Welcome to KickStreet!",

    description:
      "Thank you for joining KickStreet. " +
      "Use the verification code below " +
      "to verify your email address.",

    footerMessage:
      "If you did not create a KickStreet " +
      "account, you can safely ignore " +
      "this email. Do not share this code.",
  };
}

/* =========================================
   HTML EMAIL TEMPLATE
========================================= */

function buildEmailHTML(
  otp: string,
  template: EmailTemplate
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <meta
    name="color-scheme"
    content="light"
  />

  <title>${template.subject}</title>
</head>

<body
  style="
    margin: 0;
    padding: 0;
    background-color: #f4f5f7;
    font-family: Arial, Helvetica, sans-serif;
    color: #1f2937;
  "
>
  <table
    role="presentation"
    cellpadding="0"
    cellspacing="0"
    border="0"
    width="100%"
    style="
      width: 100%;
      background-color: #f4f5f7;
    "
  >
    <tr>
      <td
        align="center"
        style="padding: 32px 16px;"
      >
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          width="100%"
          style="
            width: 100%;
            max-width: 520px;
            background-color: #ffffff;
            border-radius: 12px;
          "
        >
          <!-- BRAND -->

          <tr>
            <td
              align="center"
              style="
                padding: 32px 24px 16px;
              "
            >
              <div
                style="
                  color: #ff6b00;
                  font-size: 28px;
                  font-weight: 800;
                  letter-spacing: 1px;
                "
              >
                KICKSTREET
              </div>
            </td>
          </tr>

          <!-- MAIN CONTENT -->

          <tr>
            <td
              style="
                padding: 8px 28px 24px;
              "
            >
              <h1
                style="
                  margin: 0 0 16px;
                  font-size: 24px;
                  line-height: 1.3;
                  text-align: center;
                  color: #111827;
                "
              >
                ${template.heading}
              </h1>

              <p
                style="
                  margin: 0 0 24px;
                  font-size: 15px;
                  line-height: 1.7;
                  color: #4b5563;
                  text-align: center;
                "
              >
                ${template.description}
              </p>

              <!-- OTP CODE -->

              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                width="100%"
              >
                <tr>
                  <td
                    align="center"
                    style="
                      padding: 22px 12px;
                      background-color: #ff6b00;
                      border-radius: 8px;
                      color: #ffffff;
                      font-size: 32px;
                      font-weight: 700;
                      letter-spacing: 6px;
                      font-family: monospace;
                    "
                  >
                    ${otp}
                  </td>
                </tr>
              </table>

              <!-- EXPIRY -->

              <p
                style="
                  margin: 24px 0 8px;
                  text-align: center;
                  font-size: 14px;
                  color: #374151;
                "
              >
                This code expires in
                <strong>
                  ${OTP_EXPIRY_MINUTES} minutes
                </strong>.
              </p>

              <p
                style="
                  margin: 0;
                  text-align: center;
                  font-size: 13px;
                  color: #6b7280;
                "
              >
                Never share this code
                with anyone.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->

          <tr>
            <td
              style="
                padding: 24px 28px;
                background-color: #f9fafb;
                border-top: 1px solid #e5e7eb;
                border-radius: 0 0 12px 12px;
              "
            >
              <p
                style="
                  margin: 0 0 12px;
                  font-size: 12px;
                  line-height: 1.6;
                  color: #6b7280;
                  text-align: center;
                "
              >
                ${template.footerMessage}
              </p>

              <p
                style="
                  margin: 0;
                  font-size: 12px;
                  color: #9ca3af;
                  text-align: center;
                "
              >
                &copy; ${new Date().getFullYear()}
                KickStreet. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/* =========================================
   PLAIN TEXT EMAIL
========================================= */

function buildEmailText(
  otp: string,
  template: EmailTemplate
): string {
  return [
    "KICKSTREET",
    "",
    template.heading,
    "",
    template.description,
    "",
    `Your verification code: ${otp}`,
    "",
    `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    "",
    template.footerMessage,
    "",
    "KickStreet Support",
  ].join("\n");
}

/* =========================================
   SHARED EMAIL SENDER
========================================= */

async function sendOTPMessage(
  email: string,
  otp: string,
  purpose: EmailPurpose
): Promise<void> {
  const recipient =
    normalizeEmail(email);

  const validOTP =
    validateOTP(otp);

  const credentials =
    getEmailCredentials();

  const transporter =
    getTransporter();

  const template =
    getEmailTemplate(purpose);

  try {
    const result =
      await transporter.sendMail({
        from: {
          name:
            "KickStreet Support",

          address:
            credentials.user,
        },

        to: recipient,

        subject:
          template.subject,

        text:
          buildEmailText(
            validOTP,
            template
          ),

        html:
          buildEmailHTML(
            validOTP,
            template
          ),

        headers: {
          "X-Auto-Response-Suppress":
            "All",
        },
      });

    /*
     * SMTP acceptance is not proof
     * of inbox delivery.
     *
     * It only confirms the receiving
     * SMTP service accepted the mail.
     */

    const accepted =
      Array.isArray(result.accepted)
        ? result.accepted.some(
            (address: unknown) =>
              typeof address === "string" &&
              address.toLowerCase() ===
                recipient
          )
        : false;

    if (!accepted) {
      throw new Error(
        "SMTP recipient was not accepted."
      );
    }
  } catch (error: unknown) {
    /*
     * Do not log OTPs, SMTP passwords
     * or recipient email addresses.
     */

    console.error(
      "KICKSTREET_EMAIL_DELIVERY_FAILED",
      {
        purpose,

        errorType:
          error instanceof Error
            ? error.name
            : "UnknownError",
      }
    );

    throw new Error(
      "Email delivery could not be confirmed."
    );
  }
}

/* =========================================
   REGISTRATION OTP EMAIL
========================================= */

export async function sendOTPEmail(
  email: string,
  otp: string
): Promise<void> {
  await sendOTPMessage(
    email,
    otp,
    "verification"
  );
}

/* =========================================
   PASSWORD RESET OTP EMAIL
========================================= */

export async function sendResetPasswordOTPEmail(
  email: string,
  otp: string
): Promise<void> {
  await sendOTPMessage(
    email,
    otp,
    "password-reset"
  );
}
