import { fetchPublicHtml } from "./net";
import type { SiteContext } from "./types";

export async function fetchSiteContext(url: string): Promise<SiteContext> {
  try {
    const response = await fetchPublicHtml(url);

    if (!response.ok) {
      throw new Error(`Site returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      throw new Error("URL did not return HTML");
    }

    const html = (await response.text()).slice(0, 350_000);
    const finalUrl = response.url || url;

    return {
      url: finalUrl,
      title: decodeHtml(
        extractTag(html, "title") || extractMeta(html, "og:title")
      ),
      description: decodeHtml(
        extractMeta(html, "description") || extractMeta(html, "og:description")
      ),
      image: absolutizeUrl(
        extractMeta(html, "og:image") || extractMeta(html, "twitter:image"),
        finalUrl
      ),
      text: decodeHtml(stripHtml(html)).slice(0, 1800),
    };
  } catch (error) {
    return {
      url,
      title: "",
      description: "",
      image: "",
      text: "",
      error: error instanceof Error ? error.message : "Could not read site",
    };
  }
}

export function extractTag(html: string, tag: string): string {
  const match = html.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  );

  return match?.[1]?.trim() || "";
}

export function extractMeta(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match) return match[1].trim();
  }

  return "";
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function absolutizeUrl(maybeUrl: string, base: string): string {
  if (!maybeUrl) return "";

  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return "";
  }
}
