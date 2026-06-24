import type { CreatomateRender, MediaSelection, RenderPlan } from "./types";
import { isPubliclyReachableOrigin } from "./net";
import { requiredEnv } from "./env";

const FALLBACK_AUDIO_URL =
  "https://resulttest-henna.vercel.app/audio/funny-pop.mp3";

export async function createCreatomateRender(
  plan: RenderPlan,
  media: MediaSelection
): Promise<{ render: CreatomateRender; templateMode: "template" | "renderscript" }> {
  const templateId = process.env.CREATOMATE_TEMPLATE_ID?.trim();

  if (templateId) {
    const body = await buildTemplateRenderBody(templateId, plan, media);
    if (body) return doCreateRender(body, "template");
  }

  return doCreateRender(buildRenderScriptBody(plan, media), "renderscript");
}

async function doCreateRender(
  body: Record<string, unknown>,
  templateMode: "template" | "renderscript"
): Promise<{ render: CreatomateRender; templateMode: "template" | "renderscript" }> {
  const response = await fetch("https://api.creatomate.com/v2/renders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("CREATOMATE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Creatomate render failed: ${safeApiMessage(payload)}`);
  }

  const render = Array.isArray(payload) ? payload[0] : payload;

  if (!render?.id) {
    throw new Error("Creatomate did not return a render id");
  }

  return { render: render as CreatomateRender, templateMode };
}

export async function getCreatomateRender(
  renderId: string
): Promise<CreatomateRender> {
  if (!/^[a-zA-Z0-9_-]+$/.test(renderId)) {
    throw new Error("Invalid render id");
  }

  const response = await fetch(
    `https://api.creatomate.com/v2/renders/${renderId}`,
    {
      headers: {
        Authorization: `Bearer ${requiredEnv("CREATOMATE_API_KEY")}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Creatomate status failed with ${response.status}`);
  }

  return (await response.json()) as CreatomateRender;
}

async function buildTemplateRenderBody(
  templateId: string,
  plan: RenderPlan,
  media: MediaSelection
): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `https://api.creatomate.com/v2/templates/${templateId}`,
    {
      headers: {
        Authorization: `Bearer ${requiredEnv("CREATOMATE_API_KEY")}`,
      },
    }
  );

  if (!response.ok) return null;

  const template = await response.json();
  const source = template.source;

  if (!source?.elements) return null;

  const named: { name: string; type: string }[] = [];
  walkElements(source.elements, named);

  if (named.length === 0) return null;

  const texts = [plan.hook, ...plan.facts, plan.caption, plan.cta].filter(Boolean);
  let textIdx = 0;
  const modifications: Record<string, string> = {};

  for (const el of named) {
    const prop = el.type === "text" ? "text" : "source";
    switch (el.type) {
      case "text":
        modifications[`${el.name}.${prop}`] = texts[textIdx % texts.length];
        textIdx++;
        break;
      case "video":
        modifications[`${el.name}.${prop}`] = media.backgroundVideos[0]?.url ?? "";
        break;
      case "image":
        modifications[`${el.name}.${prop}`] = media.sticker.mp4Url || media.sticker.url;
        break;
      case "audio":
        if (media.audioUrl) modifications[`${el.name}.${prop}`] = media.audioUrl;
        break;
    }
  }

  return { output_format: "mp4", template_id: templateId, modifications };
}

function walkElements(elements: unknown[], result: { name: string; type: string }[]): void {
  for (const raw of elements) {
    const el = raw as Record<string, unknown>;
    if (typeof el.name === "string") {
      result.push({ name: el.name, type: String(el.type ?? "") });
    }
    if (Array.isArray(el.elements)) walkElements(el.elements, result);
  }
}

function buildRenderScriptBody(plan: RenderPlan, media: MediaSelection) {
  const preset = styleForPreset(plan.stylePreset);
  const d = plan.durationSeconds;
  const videoEls = media.backgroundVideos.map((v, i) => ({
    type: "video",
    track: 1,
    time: i === 0 ? 0 : undefined,
    source: v.url,
    fit: "cover",
    duration: d,
    volume: "0%",
    loop: true,
    ...(i > 0
      ? {
          animations: [{
            time: 0,
            duration: 0.8,
            transition: true,
            type: "fade",
            easing: "quadratic-out",
            enable: "second-only",
          }],
        }
      : {}),
  }));

  return {
    output_format: "mp4",
    width: 1080,
    height: 1920,
    duration: d,
    snapshot_time: 1,
    elements: [
      ...videoEls,
      ...(media.audioUrl
        ? [
            {
              type: "audio",
              track: 2,
              time: 0,
              source: media.audioUrl,
              duration: d,
              loop: true,
              volume: "65%",
              audio_fade_out: 0.8,
            },
          ]
        : []),
      {
        type: "video",
        track: 3,
        time: 0,
        source: media.sticker.url,
        x: preset.stickerX,
        y: preset.stickerY,
        width: preset.stickerWidth,
        height: preset.stickerHeight,
        fit: "contain",
        duration: d,
        loop: true,
        volume: "0%",
        shadow_color: "rgba(0, 0, 0, 0.3)",
        shadow_blur: "14px",
        shadow_x: "0px",
        shadow_y: "6px",
        animations: [{
          time: 0,
          duration: 0.5,
          type: "fade",
          easing: "quadratic-out",
        }],
      },
      {
        type: "text",
        track: 4,
        time: 0,
        text: plan.hook,
        x: "50%",
        y: preset.textY,
        width: preset.textWidth,
        height: "22%",
        font_family: "Arial",
        font_weight: "900",
        font_size: preset.fontSize,
        fill_color: "#FFFFFF",
        stroke_color: "#000000",
        stroke_width: "8px",
        x_alignment: "50%",
        y_alignment: "50%",
        duration: d,
        animations: [{
          time: 0,
          duration: 0.6,
          type: "fade",
          easing: "quadratic-out",
        }],
      },
    ],
  };
}

function styleForPreset(preset: RenderPlan["stylePreset"]) {
  switch (preset) {
    case "sky-face":
      return {
        textY: "18%",
        textWidth: "84%",
        fontSize: "84px",
        stickerX: "50%",
        stickerY: "60%",
        stickerWidth: "62%",
        stickerHeight: "38%",
      };
    case "office-cutout":
      return {
        textY: "18%",
        textWidth: "86%",
        fontSize: "82px",
        stickerX: "50%",
        stickerY: "64%",
        stickerWidth: "68%",
        stickerHeight: "42%",
      };
    default:
      return {
        textY: "17%",
        textWidth: "86%",
        fontSize: "80px",
        stickerX: "50%",
        stickerY: "62%",
        stickerWidth: "64%",
        stickerHeight: "40%",
      };
  }
}

export function resolveAudioUrl(publicOrigin: string): string {
  const configured = process.env.PUBLIC_MEDIA_BASE_URL?.trim();

  if (configured) {
    return new URL("/audio/funny-pop.mp3", configured).toString();
  }

  if (isPubliclyReachableOrigin(publicOrigin)) {
    return new URL("/audio/funny-pop.mp3", publicOrigin).toString();
  }

  return FALLBACK_AUDIO_URL;
}

function collectNames(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const own = typeof record.name === "string" ? [record.name] : [];

  return [
    ...own,
    ...Object.values(record).flatMap((child) =>
      Array.isArray(child) ? child.flatMap(collectNames) : collectNames(child)
    ),
  ];
}

function safeApiMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Unknown error";

  const record = payload as Record<string, unknown>;
  const message = record.message || record.error || record.hint;

  return typeof message === "string"
    ? message.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
    : "Unknown error";
}
