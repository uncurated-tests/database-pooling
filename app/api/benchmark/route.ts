import { getPoolMetrics, query, transaction } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL,
});
const connectPromise = redis.connect();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const instanceId = nanoid(6);
let concurrency = 0;
const deployment = process.env.VERCEL_URL || "local";

function getRedisKey() {
  return `pooling-benchmark:${deployment}`;
}

let maxInFunctionConcurrency = 0;
export async function GET(request: NextRequest) {
  await connectPromise;
  const sleepMs = request.nextUrl.searchParams.get("sleepMs");
  const runInTransaction = Boolean(
    request.nextUrl.searchParams.get("runInTransaction") || false
  );
  const redisConcurrency = await redis.incr(getRedisKey());
  const metrics = getPoolMetrics();

  const before = Date.now();
  const startConcurrency = ++concurrency;
  maxInFunctionConcurrency = Math.max(
    maxInFunctionConcurrency,
    startConcurrency
  );
  console.log("before", {
    redisConcurrency: redisConcurrency + 1,
    inFunctionConcurrency: startConcurrency,
    instanceId,
    poolMetrics: metrics,
    runInTransaction,
  });
  let success = false;
  let error = null;
  try {
    // Execute a simple query to fetch one user
    success = runInTransaction
      ? await transaction(async (client) => {
          return await runQuery(
            parseInt(sleepMs || "0"),
            async (text, params) => {
              const result = await client.query(text, params);
              return result.rows;
            }
          );
        })
      : await runQuery(parseInt(sleepMs || "0"), query);
  } catch (e) {
    console.error("DB error:", e);
    error = e;
  } finally {
    concurrency--;
  }
  const queryEnd = Date.now();
  const redisConcurrencyAfter = (await redis.decr(getRedisKey())) || 0;
  const data = {
    success,
    error,
    redisConcurrency: redisConcurrencyAfter,
    inFunctionConcurrency: startConcurrency,
    maxInFunctionConcurrency,
    instanceId,
    poolMetrics: metrics,
    runInTransaction,
    timing: {
      start: before,
      end: queryEnd,
      duration: queryEnd - before,
      artificialDelay: parseInt(sleepMs || "0"),
    },
  };
  console.log("query", data);
  return NextResponse.json(data, { status: error ? 500 : 200 });
}

async function runQuery(sleepMs: number, runQuery: typeof query) {
  try {
    const users = await runQuery(`
      SELECT id
      FROM users
      LIMIT 1
    `);
    if (sleepMs) {
      await sleep(sleepMs);
    }

    return users.length > 0;
  } catch (error) {
    console.error("Error running query:", error);
    return false;
  }
}
