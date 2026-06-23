import { clampText, cleanSearchQuery, titleCase } from "./text";
import type { RenderPlan, SiteContext } from "./types";

const DEFAULT_DURATION = 8;
const STYLE_PRESETS = ["office-cutout", "sky-face", "cafe-reaction"] as const;
type StylePreset = (typeof STYLE_PRESETS)[number];

export function getDefaultDuration(): number {
  return DEFAULT_DURATION;
}

export function looksLikeProductBrief(text: string): boolean {
  if (extractUrl(text)) return true;

  const lower = text.toLowerCase();

  const explicitBuilderIntent =
    /\b(i am|i'm|we are|we're|im)\s+(building|launching|making|creating|working on)\b/i.test(
      text
    );

  const productWords =
    /\b(product|startup|saas|tool|app|website|site|brand|shop|store|platform)\b/i.test(
      text
    );

  const valueWords =
    /\b(helps|for|called|named|users|customers|tracks|automates|generates|creates|saves|manages)\b/i.test(
      text
    );

  const productPitchPattern =
    productWords && valueWords && lower.split(/\s+/).length >= 5;

  return explicitBuilderIntent || productPitchPattern;
}

export function extractUrl(text: string): string | null {
  const match = text.match(
    /\bhttps?:\/\/[^\s)]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?/i
  );

  if (!match) return null;

  const raw = match[0].replace(/[.,!?;:]+$/, "");

  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export function buildFallbackPlan(
  message: string,
  site: SiteContext | null
): RenderPlan {
  const productName = extractProductName(message, site);
  const combined = `${message} ${site?.title || ""} ${site?.description || ""}`.toLowerCase();

  const category = detectCategory(combined);
  const stylePreset = randomItem(STYLE_PRESETS);

  return {
    productName,
    category,
    hook: hookForCategory(category, productName),
    caption: `${productName} turns a daily annoyance into a fast habit.`,
    cta: "Try it today",
    facts: [
      `${productName} spots the annoying part first.`,
      "The video needs one clear visual joke.",
      "The sticker sells the reaction.",
      "The hook must land in one second.",
      "The CTA stays simple.",
    ],
    pexelsQuery: pexelsQueryForCategory(category, stylePreset),
    stickerQuery: stickerQueryForCategory(category, stylePreset),
    durationSeconds: randomInt(7, 10),
    stylePreset,
  };
}

type Category =
  | "nutrition app"
  | "developer tool"
  | "career tool"
  | "finance app"
  | "consumer app";

function detectCategory(combined: string): Category {
  if (
    combined.includes("calorie") ||
    combined.includes("food") ||
    combined.includes("fitness") ||
    combined.includes("meal")
  ) {
    return "nutrition app";
  }

  if (
    combined.includes("dev") ||
    combined.includes("code") ||
    combined.includes("github") ||
    combined.includes("api")
  ) {
    return "developer tool";
  }

  if (
    combined.includes("resume") ||
    combined.includes("job") ||
    combined.includes("career") ||
    combined.includes("interview")
  ) {
    return "career tool";
  }

  if (
    combined.includes("money") ||
    combined.includes("finance") ||
    combined.includes("crypto") ||
    combined.includes("trading")
  ) {
    return "finance app";
  }

  return "consumer app";
}

function hookForCategory(category: Category, productName: string): string {
  const hooks: Record<Category, string[]> = {
    "nutrition app": [
      `me when i'm still logging calories manually instead of using ${productName}`,
      `me acting like i know my macros so i open ${productName} and let it handle it`,
      `When you're just eating chill but ${productName} drops macros anyway`,
    ],
    "developer tool": [
      `me pretending the bug is fine until ${productName} fixes it`,
      `When you're just shipping fast and ${productName} carries the boring part`,
      `me acting calm while ${productName} handles the chaos`,
    ],
    "career tool": [
      `me acting confident after ${productName} fixes my career chaos`,
      `When you're just applying everywhere but ${productName} makes it look planned`,
      `me when ${productName} turns panic into a clean next step`,
    ],
    "finance app": [
      `me checking my money like i understand it until ${productName} explains`,
      `When you're just surviving payday but ${productName} keeps score`,
      `me acting rich because ${productName} found the leak`,
    ],
    "consumer app": [
      `When you're just living life but ${productName} makes the annoying part disappear`,
      `me acting normal after ${productName} saved me ten minutes`,
      `When ${productName} quietly handles the thing everyone hates doing`,
    ],
  };

  return randomItem(hooks[category]);
}

function pexelsQueryForCategory(category: Category, stylePreset: StylePreset): string {
  if (stylePreset === "sky-face") {
    return randomItem(["sunset sky gradient", "blue orange sky", "sunrise horizon"]);
  }

  if (stylePreset === "office-cutout") {
    return randomItem(["modern office lounge", "futuristic office lobby", "office plants interior"]);
  }

  switch (category) {
    case "nutrition app":
      return randomItem(["modern cafe plants", "coffee shop plants", "restaurant table"]);
    case "developer tool":
      return randomItem(["modern office desk", "coding laptop office", "dark workspace"]);
    case "career tool":
      return randomItem(["office hallway laptop", "interview waiting room", "modern office lobby"]);
    case "finance app":
      return randomItem(["city office phone", "office money phone", "business desk"]);
    default:
      return randomItem(["modern workspace plants", "phone app office", "creative studio"]);
  }
}

function stickerQueryForCategory(category: Category, stylePreset: StylePreset): string {
  if (stylePreset === "sky-face") {
    return randomItem(["Pedro Pascal", "surprised man", "side eye man"]);
  }

  switch (category) {
    case "nutrition app":
      return randomItem(["Pedro Pascal", "surprised man", "side eye man"]);
    case "developer tool":
      return randomItem(["confused man", "side eye man", "shocked man"]);
    case "career tool":
      return randomItem(["side eye man", "confident man", "shocked man"]);
    case "finance app":
      return randomItem(["shocked man", "side eye man", "confused man"]);
    default:
      return randomItem(["surprised man", "side eye man", "confused man"]);
  }
}

export function normalizePlan(
  candidate: RenderPlan,
  fallback: RenderPlan
): RenderPlan {
  const facts = Array.isArray(candidate.facts)
    ? candidate.facts.filter(Boolean).slice(0, 5)
    : [];

  while (facts.length < 5) {
    facts.push(
      fallback.facts[facts.length] || "The product makes the moment easier."
    );
  }

  return {
    productName: clampText(candidate.productName || fallback.productName, 42),
    category: clampText(candidate.category || fallback.category, 42),
    hook: clampText(candidate.hook || fallback.hook, 95),
    caption: clampText(candidate.caption || fallback.caption, 130),
    cta: clampText(candidate.cta || fallback.cta, 40),
    facts: facts.map((fact) => clampText(fact, 120)),
    pexelsQuery: clampText(
      cleanSearchQuery(candidate.pexelsQuery) || fallback.pexelsQuery,
      60
    ),
    stickerQuery: clampText(
      cleanSearchQuery(candidate.stickerQuery) || fallback.stickerQuery,
      60
    ),
    durationSeconds: Math.max(
      5,
      Math.min(
        10,
        Number(
          candidate.durationSeconds || fallback.durationSeconds || DEFAULT_DURATION
        )
      )
    ),
    stylePreset: isStylePreset(candidate.stylePreset)
      ? candidate.stylePreset
      : fallback.stylePreset,
  };
}

export function extractProductName(
  message: string,
  site: SiteContext | null
): string {
  const called = message.match(
    /\b(?:called|named)\s+([A-Za-z][A-Za-z0-9-]{1,28})/i
  );

  if (called) return titleCase(called[1]);

  const explicit = message.match(
    /\b(?:building|launching|made|making)\s+([A-Z][A-Za-z0-9-]{1,28})\b/
  );

  if (explicit) return explicit[1];

  const title = site?.title?.split(/[|:,-]/)[0]?.trim();

  if (title && title.length <= 42) return title;

  const host = site?.url
    ? new URL(site.url).hostname.replace(/^www\./, "").split(".")[0]
    : "the product";

  return titleCase(host);
}

function isStylePreset(value: unknown): value is StylePreset {
  return typeof value === "string" && STYLE_PRESETS.includes(value as StylePreset);
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
