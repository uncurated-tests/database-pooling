import { getPoolMetrics, query, transaction } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "redis";

const redis = createClient();
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

export async function GET(request: NextRequest) {
  await connectPromise;
  const sleepMs = request.nextUrl.searchParams.get("sleepMs");
  const runInTransaction = Boolean(
    request.nextUrl.searchParams.get("runInTransaction") || false
  );
  const redisConcurrency = parseInt((await redis.get(getRedisKey())) || "0");
  const metrics = getPoolMetrics();
  console.log("before metrics", metrics, redisConcurrency);
  const before = Date.now();
  const startConcurrency = concurrency + 1;
  const success = runInTransaction
    ? await transaction(async (client) => {
        return await runQuery(
          parseInt(sleepMs || "0"),
          async (text, params) => {
            const result = await client.query(text, params);
            return result.rows;
          },
          redis
        );
      })
    : await runQuery(parseInt(sleepMs || "0"), query, redis);
  const queryEnd = Date.now();

  const data = {
    success,
    redisConcurrency: redisConcurrency + 1,
    inFunctionConcurrency: startConcurrency,
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
  return NextResponse.json(data);
}

async function runQuery(
  sleepMs: number,
  runQuery: typeof query,
  redis: ReturnType<typeof createClient>
) {
  try {
    // Execute a simple query to fetch one user
    concurrency++;
    await redis.incr(getRedisKey());
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
  } finally {
    concurrency--;
    await redis.decr(getRedisKey());
  }
}
