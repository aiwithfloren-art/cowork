import { lookup } from "dns/promises";

/**
 * Safe HTTP client for LLM-composed requests. Guards against:
 *   - SSRF to private/loopback IPs
 *   - Non-http(s) schemes (file://, ftp://, data:, javascript:)
 *   - Oversized responses (default 2MB cap)
 *   - Runaway durations (default 20s timeout)
 *
 * Does NOT guard against credential echoing — callers must strip tokens
 * from the response body before feeding to the LLM if the endpoint is
 * known to reflect auth headers.
 */

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_REDIRECTS = 3;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
  "169.254.169.254", // AWS/GCP/Azure IMDS
]);

function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // IPv6 unique-local
  if (ip.startsWith("fe80:")) return true; // IPv6 link-local
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1] ?? "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

async function assertSafeHost(urlStr: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Scheme "${url.protocol}" not allowed. Only http/https supported.`,
    );
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    throw new Error(`Host "${host}" is blocked (SSRF guard).`);
  }
  // If hostname is already an IP literal, check directly.
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host)) {
      throw new Error(`IP "${host}" is private (SSRF guard).`);
    }
    return;
  }
  // Otherwise resolve + check all A/AAAA records.
  try {
    const records = await lookup(host, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error(
          `Host "${host}" resolves to private IP ${r.address} (SSRF guard).`,
        );
      }
    }
  } catch (e) {
    if (e instanceof Error && /SSRF guard/.test(e.message)) throw e;
    // DNS failure — let fetch surface the error naturally
  }
}

export type SafeFetchOptions = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
};

export type SafeFetchResult = {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  final_url: string;
};

export async function safeFetch(
  opts: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = opts.url;
  let redirects = 0;

  while (true) {
    await assertSafeHost(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: opts.method.toUpperCase(),
        headers: opts.headers ?? {},
        body: opts.body,
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // Handle redirects manually so we can re-check the target host for SSRF.
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (redirects >= maxRedirects) {
        throw new Error("Too many redirects");
      }
      redirects++;
      const loc = res.headers.get("location") as string;
      currentUrl = new URL(loc, currentUrl).toString();
      continue;
    }

    // Read body with size cap.
    const reader = res.body?.getReader();
    let received = 0;
    let truncated = false;
    const chunks: Uint8Array[] = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          truncated = true;
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          break;
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const body = buf.toString("utf-8");

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    return {
      status: res.status,
      status_text: res.statusText,
      headers,
      body,
      truncated,
      final_url: currentUrl,
    };
  }
}
