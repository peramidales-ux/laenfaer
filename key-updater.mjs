import "dotenv/config";
import pg from "pg";
import net from "net";

const { Pool } = pg;

const SOURCES = [
  "https://github.com/igareck/vpn-configs-for-russia/raw/refs/heads/main/Vless-Reality-White-Lists-Rus-Mobile.txt",
  "https://github.com/zieng2/wl/raw/refs/heads/main/vless_lite.txt",
  "https://github.com/whoahaow/rjsxrd/raw/refs/heads/main/githubmirror/bypass/bypass-1.txt",
  "https://github.com/whoahaow/rjsxrd/raw/refs/heads/main/githubmirror/bypass/bypass-2.txt",
  "https://github.com/whoahaow/rjsxrd/raw/refs/heads/main/githubmirror/bypass/bypass-3.txt",
  "https://github.com/whoahaow/rjsxrd/raw/refs/heads/main/githubmirror/bypass/bypass-4.txt",
];

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const TCP_TIMEOUT_MS = 4000;
const HTTP_TIMEOUT_MS = 8000;
const CONCURRENCY = 15;

// Free proxies to simulate mobile operator traffic
const PROXIES = [
  // SOCKS5 proxies - will be rotated
];

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

function extractFlag(fragment) {
  // Try regional indicator symbols first (two chars U+1F1E6..U+1F1FF)
  const match = fragment.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u);
  if (match) return match[0];

  // Try text-based country names -> flag mapping
  const countryMap = {
    "russia": "\u{1F1F7}\u{1F1FA}", "rus": "\u{1F1F7}\u{1F1FA}", "\u0420\u043E\u0441\u0441\u0438\u044F": "\u{1F1F7}\u{1F1FA}",
    "germany": "\u{1F1E9}\u{1F1EA}", "de": "\u{1F1E9}\u{1F1EA}", "\u0413\u0435\u0440\u043C\u0430\u043D\u0438\u044F": "\u{1F1E9}\u{1F1EA}",
    "netherlands": "\u{1F1F3}\u{1F1F1}", "nl": "\u{1F1F3}\u{1F1F1}", "\u041D\u0438\u0434\u0435\u0440\u043B\u0430\u043D\u0434\u044B": "\u{1F1F3}\u{1F1F1}",
    "finland": "\u{1F1EB}\u{1F1EE}", "fi": "\u{1F1EB}\u{1F1EE}", "\u0424\u0438\u043D\u043B\u044F\u043D\u0434\u0438\u044F": "\u{1F1EB}\u{1F1EE}",
    "france": "\u{1F1EB}\u{1F1F7}", "fr": "\u{1F1EB}\u{1F1F7}", "\u0424\u0440\u0430\u043D\u0446\u0438\u044F": "\u{1F1EB}\u{1F1F7}",
    "estonia": "\u{1F1EA}\u{1F1FA}", "ee": "\u{1F1EA}\u{1F1FA}", "\u042D\u0441\u0442\u043E\u043D\u0438\u044F": "\u{1F1EA}\u{1F1FA}",
    "sweden": "\u{1F1F8}\u{1F1EA}", "se": "\u{1F1F8}\u{1F1EA}", "\u0428\u0432\u0435\u0446\u0438\u044F": "\u{1F1F8}\u{1F1EA}",
    "norway": "\u{1F1F3}\u{1F1F4}", "no": "\u{1F1F3}\u{1F1F4}", "\u041D\u043E\u0440\u0432\u0435\u0433\u0438\u044F": "\u{1F1F3}\u{1F1F4}",
    "uk": "\u{1F1EC}\u{1F1E7}", "gb": "\u{1F1EC}\u{1F1E7}", "\u0412\u0435\u043B\u0438\u043A\u043E\u0431\u0440\u0438\u0442\u0430\u043D\u0438\u044F": "\u{1F1EC}\u{1F1E7}",
    "switzerland": "\u{1F1E8}\u{1F1ED}", "ch": "\u{1F1E8}\u{1F1ED}", "\u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0438\u044F": "\u{1F1E8}\u{1F1ED}",
    "usa": "\u{1F1FA}\u{1F1F8}", "us": "\u{1F1FA}\u{1F1F8}", "\u0421\u0428\u0410": "\u{1F1FA}\u{1F1F8}",
    "japan": "\u{1F1EF}\u{1F1F5}", "jp": "\u{1F1EF}\u{1F1F5}",
    "singapore": "\u{1F1F8}\u{1F1EC}", "sg": "\u{1F1F8}\u{1F1EC}",
    "poland": "\u{1F1F5}\u{1F1F1}", "pl": "\u{1F1F5}\u{1F1F1}", "\u041F\u043E\u043B\u044C\u0448\u0430": "\u{1F1F5}\u{1F1F1}",
    "kazakhstan": "\u{1F1F0}\u{1F1FF}", "kz": "\u{1F1F0}\u{1F1FF}", "\u041A\u0430\u0437\u0430\u0445\u0441\u0442\u0430\u043D": "\u{1F1F0}\u{1F1FF}",
    "latvia": "\u{1F1F1}\u{1F1FB}", "lv": "\u{1F1F1}\u{1F1FB}",
    "lithuania": "\u{1F1F1}\u{1F1F9}", "lt": "\u{1F1F1}\u{1F1F9}",
    "ukraine": "\u{1F1FA}\u{1F1E6}", "ua": "\u{1F1FA}\u{1F1E6}", "\u0423\u043A\u0440\u0430\u0438\u043D\u0430": "\u{1F1FA}\u{1F1E6}",
    "belarus": "\u{1F1E7}\u{1F1FE}", "by": "\u{1F1E7}\u{1F1FE}",
  };

  const lower = fragment.toLowerCase();
  for (const [key, flag] of Object.entries(countryMap)) {
    if (lower.includes(key)) return flag;
  }

  return "";
}

function getBaseKey(vlessLine) {
  const qIdx = vlessLine.indexOf("?");
  return qIdx !== -1 ? vlessLine.substring(0, qIdx) : vlessLine;
}

function extractHostPort(vlessLine) {
  const match = vlessLine.match(/^vless:\/\/[^@]+@([^:]+):(\d+)/);
  if (!match) return null;
  return { host: match[1], port: parseInt(match[2], 10) };
}

function checkTcp(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (alive) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(alive);
    };
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function checkViaHttp(sni) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const res = await fetch(`https://${sni}/`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function checkKey(key) {
  const hp = extractHostPort(key);
  if (!hp) return { key, alive: false, method: "no-host" };

  const tcpOk = await checkTcp(hp.host, hp.port);
  if (!tcpOk) return { key, alive: false, method: "tcp-fail" };

  const sni = extractSni(key);
  if (sni) {
    const httpOk = await checkViaHttp(sni);
    return { key, alive: httpOk, method: httpOk ? "http+tcp" : "tcp-only" };
  }

  return { key, alive: true, method: "tcp" };
}

async function checkKeys(keys) {
  const results = [];
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const batch = keys.slice(i, i + CONCURRENCY);
    const checks = await Promise.all(batch.map((k) => checkKey(k)));
    results.push(...checks);
    const checked = Math.min(i + CONCURRENCY, keys.length);
    const aliveSoFar = results.filter((r) => r.alive).length;
    console.log(`[key-updater] Checked ${checked}/${keys.length}, alive: ${aliveSoFar}`);
  }
  return results;
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
  for (const r of results) {
    if (r.status === "fulfilled") {
      fetched++;
      for (const line of r.value.split("\n")) {
        allLines.push(line.trim());
      }
    } else {
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

  const checked = await checkKeys(filtered);

  const alive = checked.filter((c) => c.alive);
  const dead = checked.filter((c) => !c.alive).length;
  console.log(`[key-updater] Alive: ${alive.length}, Dead: ${dead}`);

  const methodStats = {};
  for (const c of alive) {
    methodStats[c.method] = (methodStats[c.method] || 0) + 1;
  }
  console.log(`[key-updater] Methods: ${JSON.stringify(methodStats)}`);

  return alive.map((c, i) => {
    const line = c.key;
    const hashIdx = line.lastIndexOf("#");
    const base = hashIdx !== -1 ? line.substring(0, hashIdx) : line;
    const fragment = hashIdx !== -1 ? decodeURIComponent(line.substring(hashIdx + 1)) : "";
    const flag = extractFlag(fragment);
    const flagPart = flag ? ` ${flag}` : "";
    return `${base}#⚡LTE/4G⚡LAENFAER${flagPart} ${i + 1}`;
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
      console.warn("[key-updater] No working keys found, skipping DB update");
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
console.log("[key-updater] Starting key updater service (TCP + HTTP check)");

await run(pool);
setInterval(() => run(pool), UPDATE_INTERVAL_MS);
