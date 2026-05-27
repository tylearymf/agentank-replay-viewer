import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const DEFAULT_PORT = 5177;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "cache-control": "no-store",
    ...headers
  });
  res.end(body);
}

function matchIdFromSource(value) {
  return (String(value || "").match(/\bmat_[A-Za-z0-9]+\b/) || [])[0] || "";
}

function officialAgentJsonUrl(matchId) {
  return new URL(`https://agentank.ai/api/matches/${matchId}/agent.json`);
}

function officialApiUrl(value) {
  const text = String(value || "").trim();
  const matchId = matchIdFromSource(text);
  if (matchId && !/^https?:\/\//i.test(text)) {
    return officialAgentJsonUrl(matchId);
  }

  const url = new URL(text);
  if (url.hostname === "agentank.ai" && matchId && !url.pathname.startsWith("/api/matches/")) {
    return officialAgentJsonUrl(matchId);
  }
  if (!/^https?:$/.test(url.protocol) || url.hostname !== "agentank.ai" || !url.pathname.startsWith("/api/matches/")) {
    throw new Error("Proxy only accepts agentank.ai match URLs.");
  }
  url.protocol = "https:";
  return url;
}

async function handleProxy(reqUrl, res) {
  const target = officialApiUrl(reqUrl.searchParams.get("url") || "");
  const response = await fetch(target, { headers: { accept: "application/json" } });
  const body = await response.text();
  send(res, response.status, body, {
    "access-control-allow-origin": "*",
    "content-type": response.headers.get("content-type") || "application/json; charset=utf-8"
  });
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function officialTankMatchesUrl(limit, offset) {
  const url = new URL("https://agentank.ai/api/agent/tank/matches");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  return url;
}

async function handleAgentTankMatches(reqUrl, req, res, fetchImpl) {
  const authorization = String(req.headers.authorization || "").trim();
  if (!/^Bearer\s+\S+/i.test(authorization)) {
    send(res, 401, "Tank key is required in the Authorization header.", {
      "content-type": "text/plain; charset=utf-8"
    });
    return;
  }

  const limit = clampInteger(reqUrl.searchParams.get("limit"), 50, 1, 50);
  const offset = clampInteger(reqUrl.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const response = await fetchImpl(officialTankMatchesUrl(limit, offset), {
    headers: {
      accept: "application/json",
      authorization
    }
  });
  const body = await response.text();
  send(res, response.status, body, {
    "access-control-allow-origin": "*",
    "content-type": response.headers.get("content-type") || "application/json; charset=utf-8"
  });
}

function safePublicPath(urlPathname) {
  const normalizedPathname = decodeURIComponent(urlPathname === "/" ? "/index.html" : urlPathname);
  const resolved = path.resolve(PUBLIC_DIR, "." + normalizedPathname);
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    throw new Error("Invalid static path.");
  }
  return resolved;
}

async function handleStatic(reqUrl, res) {
  const filePath = safePublicPath(reqUrl.pathname);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
    return;
  }
  const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  send(res, 200, await readFile(filePath), { "content-type": type });
}

export function createReplayViewerServer({ fetchImpl = fetch } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "OPTIONS") {
        send(res, 204, "", {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "accept, authorization, content-type"
        });
        return;
      }
      if (req.method !== "GET") {
        send(res, 405, "Method not allowed", { "content-type": "text/plain; charset=utf-8" });
        return;
      }
      if (reqUrl.pathname === "/official-replay-proxy") {
        await handleProxy(reqUrl, res);
        return;
      }
      if (reqUrl.pathname === "/agent-tank-matches") {
        await handleAgentTankMatches(reqUrl, req, res, fetchImpl);
        return;
      }
      await handleStatic(reqUrl, res);
    } catch (error) {
      const message = String(error.message || error);
      const status = message === "Not found" ? 404 : 500;
      send(res, status, message, { "content-type": "text/plain; charset=utf-8" });
    }
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

async function start() {
  const server = createReplayViewerServer();
  const requestedPort = Number(arg("port", process.env.PORT || String(DEFAULT_PORT)));
  let activePort = null;
  for (let port = requestedPort; port < requestedPort + 20; port += 1) {
    try {
      activePort = await listen(server, port);
      break;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }

  if (!activePort) {
    throw new Error(`No free port found from ${requestedPort} to ${requestedPort + 19}.`);
  }

  const localUrl = `http://127.0.0.1:${activePort}/`;
  const sampleMatch = "mat_6i5lPWY81tqAkHfge";
  console.log("");
  console.log("AgenTank replay viewer started");
  console.log(`Access URL: ${localUrl}`);
  console.log(`Sample replay: ${localUrl}?match=${sampleMatch}`);
  console.log("Stop server: Ctrl+C");
  console.log("");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await start();
}
