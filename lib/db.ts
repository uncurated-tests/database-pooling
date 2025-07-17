import { Pool, PoolClient } from "pg";

// Set NODE_TLS_REJECT_UNAUTHORIZED to 0 to bypass SSL certificate validation
// This is a more aggressive approach for self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const sslConfig = {
  rejectUnauthorized: false,
  // Add additional SSL options for better compatibility
  ca: undefined, // Don't validate CA
  cert: undefined, // Don't require client cert
  key: undefined, // Don't require client key
  checkServerIdentity: () => undefined, // Skip server identity check
};

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: sslConfig,
  // Connection pool configuration
  max: 50, // Maximum number of clients in the pool
  idleTimeoutMillis: 5000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection
});

// Helper function to get a client from the pool
export async function getClient() {
  const client = await pool.connect();
  return client;
}

// Helper function to execute a query
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows;
}

// Helper function to execute a query and return a single row
export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

// Helper function to execute a query with a transaction
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to get pool status information
export function getPoolStatus() {
  return {
    totalCount: pool.totalCount, // Total number of clients in the pool
    idleCount: pool.idleCount, // Number of idle clients
    waitingCount: pool.waitingCount, // Number of queued requests waiting for a client
    maxSize: pool.options.max, // Maximum pool size
  };
}

// Helper function to get a simple pool size
export function getPoolSize() {
  return pool.totalCount;
}

// Helper function to get detailed pool metrics
export function getPoolMetrics() {
  const status = getPoolStatus();
  return {
    ...status,
    activeCount: status.totalCount - status.idleCount, // Active connections
    utilizationPercentage:
      ((status.totalCount - status.idleCount) / status.maxSize) * 100, // Pool utilization %
  };
}

// Export the pool for advanced usage
export default pool;
