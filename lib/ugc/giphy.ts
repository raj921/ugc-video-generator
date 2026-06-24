import { fetchWithTimeout } from "./net";
import { unique } from "./text";
import type { MediaSelection } from "./types";
import { requiredEnv } from "./env";

type GiphySticker = {
  title: string;
  url: string;
  images: {
    original?: { url: string; webp?: string; mp4?: string };
  };
};

type GiphySearchResponse = {
  data: GiphySticker[];
};

const GENERIC_TERMS = new Set([
  "happy",
  "love",
  "celebration",
  "nice",
  "good",
  "funny",
  "reaction",
  "lol",
  "wow",
  "omg",
  "yes",
  "cool",
]);

export async function getGiphySticker(
  query: string
): Promise<MediaSelection["sticker"]> {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !GENERIC_TERMS.has(word));

  const fallbackPool = shuffle([
    "Pedro Pascal",
    "surprised man",
    "side eye",
    "mind blown",
    "shocked face",
    "laughing man",
    "thumbs up",
    "eye roll",
    "confused",
    "shocked",
  ]);

  const attempts = unique([
    query,
    keywords[0],
    keywords.slice(0, 2).join(" "),
    ...fallbackPool,
  ]);

  const collected: GiphySticker[] = [];

  for (const attempt of attempts) {
    const params = new URLSearchParams({
      api_key: requiredEnv("GIPHY_API_KEY"),
      q: attempt,
      limit: "15",
      rating: "g",
      lang: "en",
      bundle: "sticker_layering",
    });

    const response = await fetchWithTimeout(
      `https://api.giphy.com/v1/stickers/search?${params}`
    );

    if (!response.ok) continue;

    const data = (await response.json()) as GiphySearchResponse;
    const usable = data.data.filter(
      (item) =>
        (item.images.original?.webp || item.images.original?.url) &&
        item.images.original?.mp4
    );

    if (usable.length === 0) continue;

    for (const item of usable) {
      collected.push(item);
    }

    // Rank what we have so far against the original keywords. If a strong
    // match appears, take it immediately; otherwise keep accumulating from
    // the broader fallback attempts.
    if (keywords.length > 0) {
      const ranked = rankByRelevance(collected, keywords);
      const best = ranked[0];

      if (best && best.score >= 2) {
        return toSticker(pickFromTop(ranked), query);
      }
    }
  }

  if (collected.length === 0) {
    throw new Error("No GIPHY sticker found");
  }

  // Final pass: pick from the most on-topic stickers, or a random one overall.
  if (keywords.length > 0) {
    const ranked = rankByRelevance(collected, keywords);
    if (ranked[0]?.score > 0) {
      return toSticker(pickFromTop(ranked), query);
    }
  }

  return toSticker(randomItem(collected), query);
}

type RankedSticker = { item: GiphySticker; score: number };

function rankByRelevance(
  stickers: GiphySticker[],
  keywords: string[]
): RankedSticker[] {
  return stickers
    .map((item) => ({
      item,
      score: relevanceScore(item, keywords),
    }))
    .sort((a, b) => b.score - a.score);
}

function relevanceScore(item: GiphySticker, keywords: string[]): number {
  const title = (item.title || "").toLowerCase();
  const sourceUrl = (item.url || "").toLowerCase();
  const searchable = `${title} ${sourceUrl}`;

  if (!title) return 0;

  let score = 0;

  for (const keyword of keywords) {
    if (title.includes(keyword)) {
      // Full-word substring match is a strong signal.
      score += title.includes(` ${keyword} `) || title.startsWith(`${keyword} `) || title.endsWith(` ${keyword}`)
        ? 3
        : 2;
    }
  }

  const hasHumanCue =
    /\b(man|woman|guy|girl|boy|face|head|pedro|dwayne|rock|chef|actor|person|reaction|side[-\s]?eye|shocked|confused|surprised)\b/.test(
      searchable
    );

  if (hasHumanCue) {
    score += 3;
  }

  if ((title.includes("transparent") || sourceUrl.includes("transparent")) && hasHumanCue) {
    score += 4;
  }

  if (title.includes("eating") || title.includes("food")) {
    score += 3;
  }

  if (title.includes("playstation")) {
    score -= 4;
  }

  if (/\b(question|mark|arrow|emoji|text|word|logo|icon)\b/.test(searchable)) {
    score -= 6;
  }

  if (!hasHumanCue && score <= 5) {
    score -= 5;
  }

  // Penalize generic mood titles (e.g. "Happy Birthday GIF") that GIPHY often
  // surfaces as #1 regardless of query.
  const titleWords = title.split(/\s+/);
  const genericHits = titleWords.filter((word) =>
    GENERIC_TERMS.has(word)
  ).length;

  if (genericHits >= 2 && score === 0) {
    score -= 2;
  }

  return score;
}

function toSticker(
  item: GiphySticker,
  query: string
): MediaSelection["sticker"] {
  return {
    url: item.images.original!.url,
    webpUrl: item.images.original!.webp,
    mp4Url: item.images.original!.mp4,
    title: item.title || query,
    giphyUrl: item.url,
  };
}

/**
 * Pick randomly from the top-scored stickers (within 1 point of the best)
 * so the same query doesn't always return the same sticker. Falls back to
 * the single best if there's only one.
 */
function pickFromTop(ranked: RankedSticker[]): GiphySticker {
  if (ranked.length === 0) {
    throw new Error("No stickers to pick from");
  }

  const bestScore = ranked[0].score;
  const top = ranked.filter((r) => r.score >= bestScore - 1);

  return randomItem(top).item;
}

function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}
