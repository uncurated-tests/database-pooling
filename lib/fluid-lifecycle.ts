import { waitUntil } from "@vercel/functions";

// Import types from actual database packages
import type { Pool as PgPoolType } from "pg";
import type { Pool as MySQL2PoolType } from "mysql2/promise";
import type { Pool as MariaDBPoolType } from "mariadb";
import type { MongoClient as MongoDBClientType } from "mongodb";
import type { Redis as IoRedisType } from "ioredis";
import type { Client as CassandraClientType } from "cassandra-driver";

// Note: Our interfaces are simplified versions that only include the properties
// needed for lifecycle observation. They are compatible subsets of the actual types.

// Type assertions to verify our interfaces are proper subtypes of the imported types
// This ensures that real database instances can be used where our interfaces are expected
const _pgSubtypeCheck = (pool: PgPoolType): PgPool => pool;
const _mysql2SubtypeCheck = (pool: MySQL2PoolType): MySQL2Pool => pool;
const _mariadbSubtypeCheck = (pool: MariaDBPoolType): MariaDBPool => pool;
const _mongoSubtypeCheck = (client: MongoDBClientType): MongoDBPool => client;
const _ioredisSubtypeCheck = (redis: IoRedisType): RedisPool => redis;
const _cassandraSubtypeCheck = (client: CassandraClientType): CassandraPool =>
  client;

// Note: Different database pools support different observation patterns:
// - PostgreSQL (pg), MySQL2, MariaDB: pool.on('release') events
// - MSSQL: beforeConnect callback for connection lifecycle
// - MongoDB: Various connection pool events (connectionCheckedOut/In)
// - Redis (ioredis): connection events (ready, end)
// - OracleDB: sessionCallback and pool statistics

// Based on pg.Pool
interface PgPool {
  options?: {
    idleTimeoutMillis?: number | null; // From pg.PoolConfig
  };
  on?: (event: "release", listener: (...args: any[]) => void) => void; // pg.Pool extends EventEmitter
}

// Based on mysql2.Pool
interface MySQLPool {
  config?: {
    connectionConfig?: {
      idleTimeout?: number; // From mysql2.PoolOptions
    };
  };
  on?: (event: "release", listener: (...args: any[]) => void) => void; // mysql2.Pool extends EventEmitter
}

// Based on mysql2/promise.Pool
interface MySQL2Pool {
  config?: {
    idleTimeout?: number; // From mysql2.PoolOptions
  };
  on?: (event: "release", listener: (...args: any[]) => void) => void; // Pool extends EventEmitter
}

// Based on mariadb.Pool
interface MariaDBPool {
  config?: {
    idleTimeout?: number; // From mariadb.PoolConfig
  };
  on?: (event: "release", listener: (...args: any[]) => void) => void; // Pool extends EventEmitter
}

// Based on mongodb.MongoClient
interface MongoDBPool {
  options?: {
    maxIdleTimeMS?: number; // From MongoClientOptions
  };
  on?: (
    event:
      | "connectionCheckedOut"
      | "connectionCheckedIn"
      | "connectionPoolCreated"
      | "connectionPoolClosed"
      | "connectionCreated"
      | "connectionReady"
      | "connectionClosed",
    listener: (...args: any[]) => void
  ) => void; // MongoClient extends EventEmitter
}

// Based on ioredis.Redis
interface RedisPool {
  options?: any; // RedisOptions is complex, simplified here
  on?: (
    event: "ready" | "end" | "error" | "connect",
    listener: (...args: any[]) => void
  ) => void; // Redis extends EventEmitter
  status?: string; // From Redis.status
}

interface SQLitePool {
  idleTimeout?: number;
}

// Based on cassandra-driver.Client
interface CassandraPool {
  connect?: (callback?: (err?: Error) => void) => Promise<void>;
  execute?: (query: string, params?: any[], options?: any) => Promise<any>;
}

type DbPool =
  | PgPool
  | MySQLPool
  | MySQL2Pool
  | MariaDBPool
  | MongoDBPool
  | RedisPool
  | SQLitePool
  | CassandraPool;

function getIdleTimeout(dbPool: DbPool): number {
  // PostgreSQL (pg) - default: 10000ms
  if ("options" in dbPool && dbPool.options) {
    if ("idleTimeoutMillis" in dbPool.options) {
      return typeof dbPool.options.idleTimeoutMillis === "number"
        ? dbPool.options.idleTimeoutMillis
        : 10000;
    }

    // MongoDB - default: 0 (no timeout)
    if ("maxIdleTimeMS" in dbPool.options) {
      return typeof dbPool.options.maxIdleTimeMS === "number"
        ? dbPool.options.maxIdleTimeMS
        : 0;
    }

    // Redis - default: 5000ms (options structure varies, use default)
    if ("status" in dbPool) {
      return 5000;
    }

    // Cassandra - default: 30000ms (simplified options, use default)
    if ("connect" in dbPool && "execute" in dbPool) {
      return 30000;
    }
  }

  if ("config" in dbPool && dbPool.config) {
    // MySQL - default: 60000ms
    if ("connectionConfig" in dbPool.config && dbPool.config.connectionConfig) {
      return dbPool.config.connectionConfig.idleTimeout || 60000;
    }

    // MySQL2 & MariaDB - default: 60000ms
    if ("idleTimeout" in dbPool.config) {
      return typeof dbPool.config.idleTimeout === "number"
        ? dbPool.config.idleTimeout
        : 60000;
    }
  }

  // OracleDB - default: 60000ms
  if ("poolTimeout" in dbPool) {
    return typeof dbPool.poolTimeout === "number" ? dbPool.poolTimeout : 60000;
  }

  // SQLite - default: 0 (no timeout)
  if ("idleTimeout" in dbPool) {
    return typeof dbPool.idleTimeout === "number" ? dbPool.idleTimeout : 0;
  }

  // Generic fallback - 10000ms
  return 10000;
}

let idleTimeout: string | number | NodeJS.Timeout | null | undefined = null;
let idleTimeoutResolve: (value: void | PromiseLike<void>) => void = () => {};

const bootTime = Date.now();
const maximumDuration = 15 * 60 * 1000 - 1000; // 15 minutes - 1 second

function waitUntilIdleTimeout(dbPool: DbPool) {
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeoutResolve();
  }

  const promise = new Promise((resolve) => {
    idleTimeoutResolve = resolve;
  });

  // Don't wait longer than the maximum duration
  const waitTime = Math.min(
    getIdleTimeout(dbPool) + 100,
    maximumDuration - (Date.now() - bootTime)
  );
  idleTimeout = setTimeout(() => {
    idleTimeoutResolve?.();
    console.log("idle timeout expired");
  }, waitTime);

  try {
    waitUntil(promise);
  } catch (error) {
    // This will fail when the release event is triggered outside of request scope.
    // Nothing we can do in that case.
    console.warn(
      "Pool release event triggered outside of request scope",
      error
    );
  }
}

export function attachDatabasePool(dbPool: DbPool) {
  if (idleTimeout) {
    idleTimeoutResolve?.();
    clearTimeout(idleTimeout);
  }

  // PostgreSQL, MySQL2, MariaDB - Listen for release events
  if (
    "on" in dbPool &&
    dbPool.on &&
    "options" in dbPool &&
    "idleTimeoutMillis" in dbPool.options!
  ) {
    // This is PgPool
    const pgPool = dbPool as PgPool;
    pgPool.on!("release", () => {
      console.log("Client released from pool");
      waitUntilIdleTimeout(dbPool);
    });
  } else if (
    "on" in dbPool &&
    dbPool.on &&
    "config" in dbPool &&
    dbPool.config &&
    "connectionConfig" in dbPool.config
  ) {
    // This is MySQLPool
    const mysqlPool = dbPool as MySQLPool;
    mysqlPool.on!("release", () => {
      console.log("MySQL client released from pool");
      waitUntilIdleTimeout(dbPool);
    });
  } else if (
    "on" in dbPool &&
    dbPool.on &&
    "config" in dbPool &&
    dbPool.config &&
    "idleTimeout" in dbPool.config
  ) {
    // This is MySQL2Pool or MariaDBPool
    const mysql2Pool = dbPool as MySQL2Pool | MariaDBPool;
    mysql2Pool.on!("release", () => {
      console.log("MySQL2/MariaDB client released from pool");
      waitUntilIdleTimeout(dbPool);
    });
  }

  // MongoDB - Listen for connection pool events
  if (
    "on" in dbPool &&
    dbPool.on &&
    "options" in dbPool &&
    dbPool.options &&
    "maxIdleTimeMS" in dbPool.options
  ) {
    const mongoPool = dbPool as MongoDBPool;
    mongoPool.on!("connectionCheckedOut", () => {
      console.log("MongoDB connection checked out");
      waitUntilIdleTimeout(dbPool);
    });
  }

  // Redis - Listen for connection events
  if (
    "on" in dbPool &&
    dbPool.on &&
    "options" in dbPool &&
    dbPool.options &&
    "socket" in dbPool.options
  ) {
    const redisPool = dbPool as RedisPool;
    redisPool.on!("end", () => {
      console.log("Redis connection ended");
      waitUntilIdleTimeout(dbPool);
    });
  }
}
