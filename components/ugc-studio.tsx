"use client";

import AIPrompt from "@/components/kokonutui/ai-prompt";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardDivider,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  render?: RenderPayload;
};

type RenderPayload = {
  renderId: string;
  statusUrl: string;
  plan: {
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
  media: {
    backgroundVideo: {
      url: string;
      width: number;
      height: number;
      pexelsUrl: string;
      photographer: string;
    };
    sticker: {
      url: string;
      title: string;
      giphyUrl: string;
    };
    audioUrl: string;
  };
  render: {
    id: string;
    status: string;
    url?: string;
    snapshot_url?: string;
    snapshotUrl?: string;
    error_message?: string;
    errorMessage?: string;
  };
  usedAI: boolean;
  templateMode: "template" | "renderscript";
};

type ApiResponse =
  | { type: "chat"; reply: string }
  | ({
      type: "render";
      reply: string;
    } & RenderPayload);

type RenderStatusResponse = {
  id?: string;
  status?: string;
  url?: string | null;
  snapshotUrl?: string | null;
  errorMessage?: string | null;
  render?: RenderPayload["render"];
};

const stages = [
  "understanding product",
  "finding video",
  "finding sticker",
  "rendering",
];

export function UGCStudio() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [latestRender, setLatestRender] = useState<RenderPayload | null>(null);

  const history = useMemo(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages]
  );

  async function submitPrompt(value: string) {
    const clean = value.trim();

    if (!clean || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: clean,
    };

    setMessages((current) => [...current, userMessage]);
    setIsLoading(true);
    setActiveStage(stages[0]);

    const stageTimer = window.setInterval(() => {
      setActiveStage((current) => {
        const index = Math.max(0, stages.indexOf(current || stages[0]));
        return stages[Math.min(index + 1, stages.length - 1)];
      });
    }, 1600);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, history }),
      });

      const payload = (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(
          "reply" in payload ? payload.reply : "Chat API request failed"
        );
      }

      const assistantId = crypto.randomUUID();

      if (payload.type === "render") {
        const renderPayload = stripReply(payload);

        setLatestRender(renderPayload);

        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            content: `${payload.reply}\n\nRendering now. I’ll drop the final MP4 here when it’s ready.`,
            render: renderPayload,
          },
        ]);

        void pollRender(
          renderPayload.statusUrl,
          assistantId,
          renderPayload.renderId
        );
      } else {
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            content: payload.reply,
          },
        ]);
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? `I could not start the render: ${error.message}`
              : "I could not reach the render service. Check the API keys and try again.",
        },
      ]);
    } finally {
      window.clearInterval(stageTimer);
      setIsLoading(false);
      setActiveStage(null);
    }
  }

  async function pollRender(
    statusUrl: string,
    messageId: string,
    renderId: string
  ) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await wait(attempt === 0 ? 1200 : 4000);

      try {
        const response = await fetch(statusUrl, { cache: "no-store" });

        if (!response.ok) continue;

        const payload = (await response.json()) as RenderStatusResponse;
        const updatedRender = normalizeRenderStatus(payload);

        if (!updatedRender) continue;

        setLatestRender((current) => {
          if (!current || current.renderId !== renderId) return current;
          return { ...current, render: updatedRender };
        });

        setMessages((current) =>
          current.map((message) => {
            if (message.id !== messageId || !message.render) return message;

            const updatedMessage: ChatMessage = {
              ...message,
              render: { ...message.render, render: updatedRender },
            };

            if (updatedRender.status === "succeeded" && updatedRender.url) {
              updatedMessage.content = `Your video is ready: ${updatedRender.url}`;
            }

            if (updatedRender.status === "failed") {
              updatedMessage.content =
                updatedRender.error_message ||
                updatedRender.errorMessage ||
                "The render failed. Try another product URL or a shorter prompt.";
            }

            return updatedMessage;
          })
        );

        if (
          updatedRender.status === "succeeded" ||
          updatedRender.status === "failed"
        ) {
          return;
        }
      } catch {
        // Keep polling. Temporary network/render status failures are okay.
      }
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content:
                "The render is still processing. Check the preview panel or try opening the render again in a few seconds.",
            }
          : message
      )
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-7xl gap-4 px-4 py-4 md:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)] lg:gap-5 lg:px-6">
        <section className="flex min-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-xl shadow-black/10 backdrop-blur-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Result UGC Studio
              </p>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight md:text-3xl">
                Chat to video
              </h1>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5">
            {messages.length === 0 ? (
              <EmptyState
                onUseExample={() =>
                  submitPrompt(
                    "I'm building CalAI, a calorie-tracking app. Here's the site: calai.app"
                  )
                }
              />
            ) : (
              messages.map((message) => (
                <article
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    message.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto border border-border/60 bg-secondary text-secondary-foreground"
                  }`}
                  key={message.id}
                >
                  <p>{message.content}</p>

                  {isSucceededRender(message.render) ? (
                    <a
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs font-medium text-foreground ring-1 ring-black/5 transition-transform hover:scale-[1.02]"
                      href={message.render.render.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open MP4 <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </article>
              ))
            )}

            {isLoading ? (
              <div className="mr-auto flex items-center gap-2 rounded-2xl border border-border/60 bg-secondary px-4 py-3 text-sm">
                <Loader2 className="size-4 animate-spin text-primary" />
                {activeStage || "working"}
              </div>
            ) : null}
          </div>

          <div className="border-t border-border/60 px-3 pb-3">
            <AIPrompt
              className="w-full py-0"
              defaultModel="Claude Sonnet 4.6"
              headerAction="Render"
              headerText="Pexels, GIPHY, Creatomate"
              models={["Claude Sonnet 4.6"]}
              onSubmit={(value) => submitPrompt(value)}
              placeholder="Send a product URL or pitch"
            />
          </div>
        </section>

        <aside className="grid min-h-[calc(100dvh-2rem)] gap-4 md:grid-rows-[minmax(380px,1fr)_auto]">
          <PreviewPanel render={latestRender} />
          <RecipePanel render={latestRender} />
        </aside>
      </div>
    </main>
  );
}

function EmptyState({ onUseExample }: { onUseExample: () => void }) {
  return (
    <Card className="mr-auto max-w-xl border-border/60 bg-secondary/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Ready for a product brief
        </CardTitle>

        <CardDescription>
          Send a URL and the app will pick assets, create the render, and return
          the MP4 in chat.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Button onClick={onUseExample} size="sm" type="button">
          Try CalAI
        </Button>
      </CardContent>
    </Card>
  );
}

function PreviewPanel({ render }: { render: RenderPayload | null }) {
  const finalVideo = isSucceededRender(render) ? render.render.url : null;
  const previewVideo = render?.media.backgroundVideo.url;
  const status = render?.render.status;

  return (
    <Card className="min-h-[380px] border-border/60 bg-card/80">
      <CardHeader>
        <CardTitle>Render preview</CardTitle>
        <CardDescription>
          {render
            ? `${status} via ${render.templateMode}`
            : "The selected video and sticker appear here."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="relative mx-auto aspect-[9/16] max-h-[68dvh] w-full max-w-[360px] overflow-hidden rounded-2xl border border-border/60 bg-black">
          {finalVideo ? (
            <video
              className="h-full w-full object-cover"
              controls
              src={finalVideo}
            />
          ) : previewVideo ? (
            <video
              autoPlay
              className="h-full w-full object-cover opacity-80"
              loop
              muted
              playsInline
              src={previewVideo}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
              Submit a product and the render will appear here.
            </div>
          )}

          {render?.media.sticker.url && !finalVideo ? (
            <img
              alt={render.media.sticker.title}
              className="absolute inset-x-0 bottom-0 mx-auto h-[62%] w-[92%] object-contain drop-shadow-2xl"
              src={render.media.sticker.url}
            />
          ) : null}

          {render && !finalVideo ? (
            <div className="absolute inset-x-5 top-[13%] text-center">
              <p className="text-balance text-xl font-black leading-tight text-white [text-shadow:_0_2px_0_#000,_2px_0_0_#000,_0_-2px_0_#000,_-2px_0_0_#000,_2px_2px_0_#000,_-2px_2px_0_#000,_2px_-2px_0_#000,_-2px_-2px_0_#000]">
                {render.plan.hook}
              </p>
            </div>
          ) : null}

          {render && !finalVideo && status ? (
            <div
              className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white backdrop-blur ${statusPillClass(
                status
              )}`}
            >
              {isPendingStatus(status) ? (
                <Loader2 className="size-3 animate-spin" />
              ) : null}
              {status}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function statusPillClass(status: string): string {
  if (status === "succeeded") return "bg-emerald-500/80";
  if (status === "failed") return "bg-red-500/80";
  return "bg-black/70";
}

function isPendingStatus(status: string): boolean {
  return (
    status === "planned" ||
    status === "waiting" ||
    status === "transcribing" ||
    status === "rendering"
  );
}

function RecipePanel({ render }: { render: RenderPayload | null }) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader>
        <CardTitle>Recipe</CardTitle>
        <CardDescription>Asset choices and source attribution.</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-2 text-sm">
        {render ? (
          <>
            <RecipeRow label="Product" value={render.plan.productName} />
            <RecipeRow
              label="Pexels"
              value={render.plan.pexelsQuery}
              href={render.media.backgroundVideo.pexelsUrl}
            />
            <RecipeRow
              label="Creator"
              value={render.media.backgroundVideo.photographer}
            />
            <CardDivider className="my-1" />
            <RecipeRow
              label="GIPHY"
              value={render.plan.stickerQuery}
              href={render.media.sticker.giphyUrl}
            />
            <RecipeRow
              label="Audio"
              value="/audio/funny-pop.mp3"
              href={render.media.audioUrl}
            />
            <RecipeRow
              label="AI"
              value={render.usedAI ? "Anthropic" : "fallback plan"}
            />
          </>
        ) : (
          <p className="text-muted-foreground">No render yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RecipeRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>

      {href ? (
        <a
          className="inline-flex min-w-0 items-center gap-1 text-primary transition-colors hover:text-primary/80"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          <span className="truncate">{value}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ) : (
        <span className="min-w-0 truncate">{value}</span>
      )}
    </div>
  );
}

function stripReply(
  payload: Extract<ApiResponse, { type: "render" }>
): RenderPayload {
  return {
    renderId: payload.renderId,
    statusUrl: payload.statusUrl,
    plan: payload.plan,
    media: payload.media,
    render: payload.render,
    usedAI: payload.usedAI,
    templateMode: payload.templateMode,
  };
}

function isSucceededRender(
  render: RenderPayload | null | undefined
): render is RenderPayload & { render: RenderPayload["render"] & { url: string } } {
  return render?.render.status === "succeeded" && Boolean(render.render.url);
}

function normalizeRenderStatus(
  payload: RenderStatusResponse
): RenderPayload["render"] | null {
  if (payload.render) {
    return payload.render;
  }

  if (!payload.id || !payload.status) {
    return null;
  }

  return {
    id: payload.id,
    status: payload.status,
    url: payload.url || undefined,
    snapshot_url: payload.snapshotUrl || undefined,
    error_message: payload.errorMessage || undefined,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
