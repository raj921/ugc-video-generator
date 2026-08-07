export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RenderPlan = {
  productName: string;
  category: string;
  hook: string;
  caption: string;
  cta: string;
  facts: string[];
  pexelsQuery: string;
  stickerQuery: string;
  durationSeconds: number;
  stylePreset?: "office-cutout" | "sky-face" | "cafe-reaction";
};

export type MediaSelection = {
  backgroundVideos: {
    url: string;
    width: number;
    height: number;
  }[];
  sticker: {
    url: string;
    webpUrl?: string;
    mp4Url?: string;
    title: string;
    giphyUrl: string;
  };
  audioUrl: string;
};

export type CreatomateRender = {
  id: string;
  status:
    | "planned"
    | "waiting"
    | "transcribing"
    | "rendering"
    | "succeeded"
    | "failed";
  url?: string;
  snapshot_url?: string;
  error_message?: string;
  [key: string]: unknown;
};

export type ChatResponse =
  | { type: "chat"; reply: string }
  | {
      type: "render";
      reply: string;
      renderId: string;
      statusUrl: string;
      plan: RenderPlan;
      media: MediaSelection;
      render: CreatomateRender;
      usedAI: boolean;
      provider: "creatomate";
      templateMode: "template" | "renderscript";
    };

export type SiteContext = {
  url: string;
  title: string;
  description: string;
  text: string;
  image: string;
  error?: string;
};

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};
