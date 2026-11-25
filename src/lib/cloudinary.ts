
import "server-only";

import {
  v2 as cloudinary,
} from "cloudinary";

/* =========================================
   ENVIRONMENT VARIABLE TYPES
========================================= */

type CloudinaryEnvKey =
  | "CLOUDINARY_CLOUD_NAME"
  | "CLOUDINARY_API_KEY"
  | "CLOUDINARY_API_SECRET";

/* =========================================
   ENVIRONMENT VALIDATION
========================================= */

/**
 * Read and validate a required
 * Cloudinary environment variable.
 *
 * Credentials must never be exposed
 * through NEXT_PUBLIC_ variables.
 */
function getRequiredEnv(
  key: CloudinaryEnvKey
): string {
  const value =
    process.env[key]?.trim();

  if (!value) {
    throw new Error(
      `Cloudinary configuration error: ${key} is missing.`
    );
  }

  return value;
}

/* =========================================
   CLOUDINARY CONFIGURATION
========================================= */

/**
 * Configure the Cloudinary SDK
 * for server-side API routes.
 */
function configureCloudinary(): void {
  const cloudName =
    getRequiredEnv(
      "CLOUDINARY_CLOUD_NAME"
    );

  const apiKey =
    getRequiredEnv(
      "CLOUDINARY_API_KEY"
    );

  const apiSecret =
    getRequiredEnv(
      "CLOUDINARY_API_SECRET"
    );

  cloudinary.config({
    cloud_name: cloudName,

    api_key: apiKey,

    api_secret: apiSecret,

    // Always generate HTTPS URLs.
    secure: true,

    // Use Cloudinary's standard API.
    api_proxy: undefined,

    // Upload request timeout: 60 seconds.
    timeout: 60000,
  });
}

/* =========================================
   INITIALIZATION
========================================= */

/**
 * Next.js caches imported modules
 * within the Node.js process.
 *
 * Configuration runs when this
 * module is first evaluated.
 */
configureCloudinary();

/* =========================================
   EXPORT
========================================= */

export default cloudinary;
