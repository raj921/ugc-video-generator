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
  const canUseTemplate = templateId
    ? await templateLooksMediaReady(templateId).catch(() => false)
    : false;

  const body =
    canUseTemplate && templateId
      ? buildTemplateRenderBody(templateId, plan, media)
      : buildRenderScriptBody(plan, media);

  const templateMode = canUseTemplate ? "template" : "renderscript";

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

  return {
    render: render as CreatomateRender,
    templateMode,
  };
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

async function templateLooksMediaReady(templateId: string): Promise<boolean> {
  const response = await fetch(
    `https://api.creatomate.com/v2/templates/${templateId}`,
    {
      headers: {
        Authorization: `Bearer ${requiredEnv("CREATOMATE_API_KEY")}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) return false;

  const template = await response.json();
  const names = collectNames(template).map((name) => name.toLowerCase());

  return (
    names.some((name) => name.includes("background") || name.includes("video")) &&
    names.some((name) => name.includes("sticker") || name.includes("gif")) &&
    names.some((name) => name.includes("audio"))
  );
}

function buildTemplateRenderBody(
  templateId: string,
  plan: RenderPlan,
  media: MediaSelection
) {
  return {
    output_format: "mp4",
    template_id: templateId,
    modifications: {
      "Intro-Text.text": plan.hook,
      "Fact-1.text": plan.facts[0],
      "Fact-2.text": plan.facts[1],
      "Fact-3.text": plan.facts[2],
      "Fact-4.text": plan.facts[3],
      "Fact-5.text": plan.facts[4],
      "Background.source": media.backgroundVideo.url,
      "Background-Video.source": media.backgroundVideo.url,
      "Sticker.source": media.sticker.url,
      "GIF.source": media.sticker.url,
      ...(media.audioUrl ? { "Audio.source": media.audioUrl } : {}),
    },
  };
}

function buildRenderScriptBody(plan: RenderPlan, media: MediaSelection) {
  const preset = styleForPreset(plan.stylePreset);

  return {
    output_format: "mp4",
    width: 1080,
    height: 1920,
    duration: plan.durationSeconds,
    snapshot_time: 1,
    elements: [
      {
        type: "video",
        track: 1,
        time: 0,
        source: media.backgroundVideo.url,
        fit: "cover",
        duration: plan.durationSeconds,
        volume: "0%",
      },
      ...(media.audioUrl
        ? [
            {
              type: "audio",
              track: 2,
              time: 0,
              source: media.audioUrl,
              duration: plan.durationSeconds,
              loop: true,
              volume: "65%",
              audio_fade_out: 0.8,
            },
          ]
        : []),
      {
        type: media.sticker.mp4Url ? "video" : "image",
        track: 3,
        time: 0,
        source: media.sticker.mp4Url || media.sticker.url,
        x: preset.stickerX,
        y: preset.stickerY,
        width: preset.stickerWidth,
        height: preset.stickerHeight,
        fit: "contain",
        duration: plan.durationSeconds,
        loop: true,
        volume: "0%",
        shadow_color: "rgba(0, 0, 0, 0.3)",
        shadow_blur: "14px",
        shadow_x: "0px",
        shadow_y: "6px",
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
        duration: plan.durationSeconds,
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

  const record = payload as {
    message?: unknown;
    error?: unknown;
  };

  const message = record.message || record.error;

  return typeof message === "string"
    ? message.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
    : "Unknown error";
}
