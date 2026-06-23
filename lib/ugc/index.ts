import { assertServerConfig } from "./env";
import {
  createCreatomateRender,
  getCreatomateRender,
  resolveAudioUrl,
} from "./creatomate";
import { buildAnthropicPlan, buildConversationalReply } from "./anthropic";
import { fetchSiteContext } from "./site";
import {
  buildFallbackPlan,
  extractProductName,
  extractUrl,
  looksLikeProductBrief,
  normalizePlan,
} from "./plan";
import { getPexelsVideo } from "./pexels";
import { getGiphySticker } from "./giphy";
import type {
  ChatMessage,
  ChatResponse,
  CreatomateRender,
  MediaSelection,
  RenderPlan,
  SiteContext,
} from "./types";

export type {
  ChatMessage,
  ChatResponse,
  CreatomateRender,
  MediaSelection,
  RenderPlan,
  SiteContext,
};

export { getCreatomateRender };

export async function handleChatRequest(
  message: string,
  history: ChatMessage[],
  publicOrigin: string
): Promise<ChatResponse> {
  const clean = message.trim();

  if (!clean) {
    return {
      type: "chat",
      reply:
        "Send me a product URL or a short product pitch and I’ll make a UGC-style video for it.",
    };
  }

  if (clean.length > 1800) {
    return {
      type: "chat",
      reply:
        "That brief is too long. Send the product URL and one sentence about the audience.",
    };
  }

  if (!looksLikeProductBrief(clean)) {
    const reply = await buildConversationalReply(clean, history).catch(
      () =>
        "I make short UGC videos. Send a product URL or a quick pitch and I’ll build one with background video, sticker, text, and audio."
    );

    return { type: "chat", reply };
  }

  assertServerConfig();

  const url = extractUrl(clean);
  const site = url ? await fetchSiteContext(url) : null;

  const fallback = buildFallbackPlan(clean, site);
  const aiResult = await buildAnthropicPlan(clean, site, history).catch(
    () => null
  );

  const plan = normalizePlan(aiResult?.plan || fallback, fallback);
  const media = await selectMedia(plan, publicOrigin);
  const renderResult = await createCreatomateRender(plan, media);

  return {
    type: "render",
    reply: `Render started for ${plan.productName}. Hook: ${plan.hook}`,
    renderId: renderResult.render.id,
    statusUrl: `/api/render/${renderResult.render.id}`,
    plan,
    media,
    render: renderResult.render,
    usedAI: Boolean(aiResult?.usedAI),
    provider: "creatomate",
    templateMode: renderResult.templateMode,
  };
}

async function selectMedia(
  plan: RenderPlan,
  publicOrigin: string
): Promise<MediaSelection> {
  const [backgroundVideo, sticker] = await Promise.all([
    getPexelsVideo(plan.pexelsQuery),
    getGiphySticker(plan.stickerQuery),
  ]);

  return {
    backgroundVideo,
    sticker,
    audioUrl: resolveAudioUrl(publicOrigin),
  };
}

// Re-exported so legacy imports of these helpers still resolve.
export {
  buildFallbackPlan,
  extractProductName,
  looksLikeProductBrief,
  extractUrl,
  normalizePlan,
};
