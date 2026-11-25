
import mongoose, {
  type Mongoose,
  type ConnectOptions,
} from "mongoose";

/* =========================================
   TYPES
========================================= */

type MongooseCache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

/* =========================================
   GLOBAL CONNECTION CACHE
========================================= */

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache:
    | MongooseCache
    | undefined;
}

/*
 * Reuse MongoDB connections across
 * Next.js API requests and development
 * hot reloads.
 *
 * This cache exists only within the
 * current Node.js process.
 */

const cached: MongooseCache =
  globalThis.mongooseCache ??
  {
    conn: null,
    promise: null,
  };

globalThis.mongooseCache = cached;

/* =========================================
   CONNECTION OPTIONS
========================================= */

const CONNECTION_OPTIONS: ConnectOptions = {
  /* Disable Mongoose command buffering */

  bufferCommands: false,

  /* Connection pool */

  maxPoolSize: 10,

  minPoolSize: 0,

  /* Connection timeouts */

  serverSelectionTimeoutMS: 10000,

  connectTimeoutMS: 10000,

  socketTimeoutMS: 45000,

  /* Idle connections */

  maxIdleTimeMS: 30000,

  /* Retry eligible writes */

  retryWrites: true,
};

/* =========================================
   ENVIRONMENT VALIDATION
========================================= */

function getMongoURI(): string {
  const uri =
    (process.env.MONGO_URI || process.env.MONGODB_URI)?.trim();

  if (!uri) {
    throw new Error(
      "MONGO_URI or MONGODB_URI is missing. Configure it in your environment."
    );
  }

  if (
    !uri.startsWith("mongodb://") &&
    !uri.startsWith("mongodb+srv://")
  ) {
    throw new Error(
      "MONGO_URI must start with mongodb:// or mongodb+srv://."
    );
  }

  return uri;
}

/* =========================================
   SAFE ERROR LOGGING
========================================= */

function logConnectionError(
  error: unknown
): void {
  /*
   * Avoid logging complete MongoDB
   * connection errors because they
   * may contain sensitive details.
   */

  const errorName =
    error instanceof Error
      ? error.name
      : "UnknownError";

  console.error(
    "MONGODB_CONNECTION_FAILED:",
    errorName
  );
}

/* =========================================
   CONNECTION STATE HELPERS
========================================= */

function isConnected(
  connection: Mongoose | null
): connection is Mongoose {
  return (
    connection !== null &&
    connection.connection.readyState === 1
  );
}

/* =========================================
   DATABASE CONNECTION
========================================= */

async function dbConnect(): Promise<Mongoose> {
  /* =====================================
     REUSE ACTIVE CONNECTION
  ===================================== */

  if (isConnected(cached.conn)) {
    return cached.conn;
  }

  /* =====================================
     CHECK MONGOOSE CONNECTION STATE
  ===================================== */

  const readyState =
    mongoose.connection.readyState;

  /*
   * Mongoose connection states:
   *
   * 0 = disconnected
   * 1 = connected
   * 2 = connecting
   * 3 = disconnecting
   */

  if (readyState === 1) {
    cached.conn = mongoose;

    cached.promise = null;

    return mongoose;
  }

  /* =====================================
     HANDLE STALE CACHE
  ===================================== */

  if (
    cached.conn &&
    !isConnected(cached.conn)
  ) {
    cached.conn = null;
  }

  /*
   * A promise can remain cached
   * after a successful connection
   * if older code created it.
   *
   * Clear it when the connection
   * is no longer connected and
   * Mongoose is not connecting.
   */

  if (
    readyState !== 2 &&
    cached.promise
  ) {
    cached.promise = null;
  }

  /* =====================================
     CREATE CONNECTION PROMISE
  ===================================== */

  if (!cached.promise) {
    const uri = getMongoURI();

    cached.promise = mongoose.connect(
      uri,
      CONNECTION_OPTIONS
    );
  }

  /* =====================================
     WAIT FOR CONNECTION
  ===================================== */

  try {
    const connection =
      await cached.promise;

    if (
      connection.connection.readyState !== 1
    ) {
      throw new Error(
        "MongoDB connection is not ready."
      );
    }

    /* ===================================
       SAVE ACTIVE CONNECTION
    =================================== */

    cached.conn = connection;

    /*
     * The active connection is now
     * stored in cached.conn.
     *
     * No need to keep the resolved
     * connection promise.
     */

    cached.promise = null;

    if (
      process.env.NODE_ENV ===
      "development"
    ) {
      console.info(
        "MongoDB connected successfully."
      );
    }

    return connection;
  } catch (error: unknown) {
    /* ===================================
       RESET CACHE AFTER FAILURE
    =================================== */

    cached.conn = null;

    cached.promise = null;

    logConnectionError(error);

    throw new Error(
      "Database connection unavailable."
    );
  }
}

export default dbConnect;
