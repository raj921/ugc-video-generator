import dns from "node:dns/promises";
import net from "node:net";

const USER_AGENT = "ResultUGCStudio/1.0";

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 8500
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function isRedirectStatus(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

export async function fetchPublicHtml(
  startUrl: string
): Promise<Response> {
  let currentUrl = startUrl;

  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    await assertPublicHttpUrl(currentUrl);

    const response = await fetchWithTimeout(currentUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": USER_AGENT,
      },
      redirect: "manual",
    });

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");

      if (!location) {
        throw new Error("Redirect missing location header");
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error("Too many redirects");
}

export async function assertPublicHttpUrl(url: string): Promise<void> {
  const parsed = new URL(url);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Local URLs are not allowed");
  }

  if (isPrivateIp(hostname)) {
    throw new Error("Private URLs are not allowed");
  }

  const records = await dns.lookup(hostname, { all: true }).catch(() => []);

  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error("Private URLs are not allowed");
    }
  }
}

export function isPrivateIp(value: string): boolean {
  const version = net.isIP(value);

  if (version === 4) {
    const [a, b] = value.split(".").map(Number);

    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }

  if (version === 6) {
    const normalized = value.toLowerCase();

    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }

  return false;
}

export function isPubliclyReachableOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);

    if (!["http:", "https:"].includes(parsed.protocol)) return false;

    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "localhost" || hostname.endsWith(".local")) return false;

    return !isPrivateIp(hostname);
  } catch {
    return false;
  }
}
