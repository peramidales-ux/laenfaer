import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const SOURCES = [
  "https://github.com/igareck/vpn-configs-for-russia/raw/refs/heads/main/Vless-Reality-White-Lists-Rus-Mobile.txt",
  "https://github.com/zieng2/wl/raw/refs/heads/main/vless_lite.txt",
  "https://github.com/whoahaow/rjsxrd/raw/refs/heads/main/githubmirror/bypass/bypass-1.txt",
  "https://github.com/whoahaow/rjsxrd/raw/refs/heads/main/githubmirror/bypass/bypass-2.txt",
  "https://github.com/whoahaow/rjsxrd/raw/refs/heads/main/githubmirror/bypass/bypass-3.txt",
  "https://github.com/whoahaow/rjsxrd/raw/refs/heads/main/githubmirror/bypass/bypass-4.txt",
];

const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function extractSni(vlessLine) {
  const qIdx = vlessLine.indexOf("?");
  if (qIdx === -1) return null;
  const query = vlessLine.substring(qIdx + 1);
  const hashIdx = query.indexOf("#");
  const params = hashIdx !== -1 ? query.substring(0, hashIdx) : query;
  for (const part of params.split("&")) {
    const [key, ...rest] = part.split("=");
    const val = rest.join("=");
    if (key === "sni" || key === "host") {
      return decodeURIComponent(val);
    }
  }
  return null;
}

function getBaseKey(vlessLine) {
  const qIdx = vlessLine.indexOf("?");
  const main = qIdx !== -1 ? vlessLine.substring(0, qIdx) : vlessLine;
  return main;
}

async function fetchKeys() {
  const results = await Promise.allSettled(
    SOURCES.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.text();
    })
  );

  const allLines = [];
  let fetched = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      fetched++;
      for (const line of r.value.split("\n")) {
        allLines.push(line.trim());
      }
    } else {
      failed++;
      console.error("[key-updater] Failed to fetch:", r.reason?.message);
    }
  }
  console.log(`[key-updater] Fetched from ${fetched}/${SOURCES.length} sources, ${allLines.length} raw lines`);

  const vlessLines = allLines.filter((l) => l.startsWith("vless://"));
  console.log(`[key-updater] ${vlessLines.length} vless lines total`);

  const seen = new Set();
  const filtered = [];
  for (const line of vlessLines) {
    const sni = extractSni(line);
    if (!sni || !sni.endsWith(".ru")) continue;
    const base = getBaseKey(line);
    if (seen.has(base)) continue;
    seen.add(base);
    filtered.push(line);
  }

  console.log(`[key-updater] ${filtered.length} unique keys with .ru SNI`);

  return filtered.map((line, i) => {
    const hashIdx = line.lastIndexOf("#");
    const base = hashIdx !== -1 ? line.substring(0, hashIdx) : line;
    return `${base}#⚡LTE/4G⚡LAENFAER ${i + 1}`;
  });
}

async function updateDb(pool, keys) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM premium_keys");

    for (const key of keys) {
      await client.query("INSERT INTO premium_keys (key) VALUES ($1)", [key]);
    }

    if (keys.length > 0) {
      const firstKey = keys[0];
      await client.query(
        `UPDATE subscriptions SET key = $1, updated_at = now()
         WHERE tariff NOT LIKE '%free%'
           AND tariff NOT LIKE '%3days%'
           AND tariff NOT LIKE '%7days%'
           AND expires_at > now()`,
        [firstKey]
      );
    }

    await client.query("COMMIT");
    console.log(`[key-updater] DB updated: ${keys.length} premium keys, subscribers refreshed`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function run(pool) {
  try {
    const keys = await fetchKeys();
    if (keys.length === 0) {
      console.warn("[key-updater] No keys after filtering, skipping DB update");
      return;
    }
    await updateDb(pool, keys);
  } catch (e) {
    console.error("[key-updater] Error during update:", e.message);
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[key-updater] DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });
console.log("[key-updater] Starting key updater service");

await run(pool);
setInterval(() => run(pool), UPDATE_INTERVAL_MS);
