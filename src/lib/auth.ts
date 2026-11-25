
import jwt, {
  type JwtPayload,
  type SignOptions,
} from "jsonwebtoken";

import bcrypt from "bcryptjs";

/* =========================================
   AUTHENTICATION CONFIGURATION
========================================= */

const BCRYPT_SALT_ROUNDS = 12;

const JWT_EXPIRY:
  SignOptions["expiresIn"] = "7d";

const JWT_ALGORITHM = "HS256" as const;

const MIN_JWT_SECRET_BYTES = 32;

const MAX_PASSWORD_BYTES = 72;

const MIN_PASSWORD_LENGTH = 8;

const MAX_PASSWORD_LENGTH = 128;

const MAX_TOKEN_LENGTH = 8192;

const USER_ID_REGEX =
  /^[a-f\d]{24}$/i;

const BCRYPT_HASH_REGEX =
  /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

/* =========================================
   TYPES
========================================= */

export type UserRole =
  | "user"
  | "admin";

export type AuthTokenPayload =
  JwtPayload & {
    id: string;
    role: UserRole;
  };

/* =========================================
   JWT SECRET
========================================= */

function getJWTSecret(): string {
  const secret =
    process.env.JWT_SECRET;

  if (
    typeof secret !== "string" ||
    Buffer.byteLength(
      secret,
      "utf8"
    ) < MIN_JWT_SECRET_BYTES
  ) {
    throw new Error(
      "JWT_SECRET must contain at least 32 bytes."
    );
  }

  return secret;
}

/* =========================================
   USER ROLE VALIDATION
========================================= */

function isValidUserRole(
  role: unknown
): role is UserRole {
  return (
    role === "user" ||
    role === "admin"
  );
}

/* =========================================
   USER ID VALIDATION
========================================= */

function validateUserId(
  id: unknown
): asserts id is string {
  if (
    typeof id !== "string" ||
    !USER_ID_REGEX.test(id)
  ) {
    throw new Error(
      "Invalid user ID."
    );
  }
}

/* =========================================
   PASSWORD VALIDATION
========================================= */

function validatePasswordInput(
  password: unknown
): asserts password is string {
  if (
    typeof password !== "string" ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new Error(
      "Password must contain 8 to 128 characters."
    );
  }

  /*
   * Existing project password policy:
   * at least one letter and one digit.
   */
  if (
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new Error(
      "Password must contain at least one letter and one number."
    );
  }

  /*
   * bcrypt processes at most
   * 72 bytes of password input.
   */
  if (
    Buffer.byteLength(
      password,
      "utf8"
    ) > MAX_PASSWORD_BYTES
  ) {
    throw new Error(
      "Password must not exceed 72 UTF-8 bytes."
    );
  }
}

/* =========================================
   BCRYPT HASH VALIDATION
========================================= */

function isValidBcryptHash(
  value: unknown
): value is string {
  if (
    typeof value !== "string"
  ) {
    return false;
  }

  const match =
    BCRYPT_HASH_REGEX.exec(value);

  if (!match) {
    return false;
  }

  const cost =
    Number(match[1]);

  return (
    Number.isInteger(cost) &&
    cost >= 4 &&
    cost <= 31
  );
}

/* =========================================
   GENERATE JWT
========================================= */

export const generateToken = (
  id: string,
  role: string
): string => {
  validateUserId(id);

  if (!isValidUserRole(role)) {
    throw new Error(
      "Invalid user role."
    );
  }

  const secret =
    getJWTSecret();

  return jwt.sign(
    {
      id,
      role,
    },
    secret,
    {
      algorithm:
        JWT_ALGORITHM,

      expiresIn:
        JWT_EXPIRY,
    }
  );
};

/* =========================================
   VERIFY JWT
========================================= */

export const verifyToken = (
  token: string
): AuthTokenPayload => {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    token.trim() !== token
  ) {
    throw new Error(
      "Invalid authentication token."
    );
  }

  const secret =
    getJWTSecret();

  const decoded =
    jwt.verify(
      token,
      secret,
      {
        algorithms: [
          JWT_ALGORITHM,
        ],
      }
    );

  if (
    typeof decoded === "string" ||
    !decoded ||
    !USER_ID_REGEX.test(
      String(decoded.id ?? "")
    ) ||
    !isValidUserRole(
      decoded.role
    )
  ) {
    throw new Error(
      "Invalid token payload."
    );
  }

  /*
   * Reject tokens without a valid
   * expiration or issued-at claim.
   */
  if (
    typeof decoded.iat !== "number" ||
    !Number.isSafeInteger(decoded.iat) ||
    typeof decoded.exp !== "number" ||
    !Number.isSafeInteger(decoded.exp) ||
    decoded.exp <= decoded.iat
  ) {
    throw new Error(
      "Invalid token lifetime."
    );
  }

  return decoded as AuthTokenPayload;
};

/* =========================================
   HASH PASSWORD
========================================= */

export const hashPassword = async (
  password: string
): Promise<string> => {
  validatePasswordInput(password);

  const hashed =
    await bcrypt.hash(
      password,
      BCRYPT_SALT_ROUNDS
    );

  if (!isValidBcryptHash(hashed)) {
    throw new Error(
      "Password hashing failed."
    );
  }

  return hashed;
};

/* =========================================
   COMPARE PASSWORD
========================================= */

export const comparePassword = async (
  password: string,
  hashed: string
): Promise<boolean> => {
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    typeof hashed !== "string" ||
    !isValidBcryptHash(hashed)
  ) {
    return false;
  }

  if (
    Buffer.byteLength(
      password,
      "utf8"
    ) > MAX_PASSWORD_BYTES
  ) {
    return false;
  }

  try {
    return await bcrypt.compare(
      password,
      hashed
    );
  } catch {
    return false;
  }
};
