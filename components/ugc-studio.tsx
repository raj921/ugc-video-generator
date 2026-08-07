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
  ArrowUpRight,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
    backgroundVideos: {
      url: string;
      width: number;
      height: number;
    }[];
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
  | ({ type: "render"; reply: string } & RenderPayload);

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
  "finding footage",
  "adding reaction",
  "exporting MP4",
] as const;

type Stage = (typeof stages)[number];

const examplePrompts = [
  "Make a playful ad for a calorie tracking app",
  "Create a founder-style video for my SaaS",
  "Turn my skincare brand into a testimonial",
];

export function UGCStudio() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStage, setActiveStage] = useState<Stage | null>(null);
  const [latestRender, setLatestRender] = useState<RenderPayload | null>(null);
  const [lastPrompt, setLastPrompt] = useState("");

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

    setLastPrompt(clean);
    setMessages((current) => [...current, userMessage]);
    setIsLoading(true);
    setActiveStage(stages[0]);

    const stageTimer = window.setInterval(() => {
      setActiveStage((current) => {
        const index = Math.max(0, stages.indexOf(current || stages[0]));
        return stages[Math.min(index + 1, stages.length - 1)];
      });
    }, 1600);
    let keepBusy = false;

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
        keepBusy = true;

        setLatestRender(renderPayload);
        setActiveStage("exporting MP4");
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            content: `${payload.reply}\n\nThe hook is ready. I’m assembling the final MP4 now.`,
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
              ? `I could not start the video: ${error.message}`
              : "I could not reach the render service. Check the API keys and try again.",
        },
      ]);
    } finally {
      window.clearInterval(stageTimer);
      if (!keepBusy) {
        setIsLoading(false);
        setActiveStage(null);
      }
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
              updatedMessage.content = "Your video is ready to watch and download.";
            }

            if (updatedRender.status === "failed") {
              updatedMessage.content =
                updatedRender.error_message ||
                updatedRender.errorMessage ||
                "The render failed. Try the same brief again or use a shorter prompt.";
            }

            return updatedMessage;
          })
        );

        if (
          updatedRender.status === "succeeded" ||
          updatedRender.status === "failed"
        ) {
          setIsLoading(false);
          setActiveStage(null);
          return;
        }
      } catch {
        continue;
      }
    }

    setLatestRender((current) => {
      if (!current || current.renderId !== renderId) return current;
      return { ...current, render: { ...current.render, status: "timeout" } };
    });
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content:
                "The render is taking longer than expected. Try again when you’re ready.",
            }
          : message
      )
    );
    setIsLoading(false);
    setActiveStage(null);
  }

  function createAnother() {
    setMessages([]);
    setLatestRender(null);
    setLastPrompt("");
    setIsLoading(false);
    setActiveStage(null);
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(155,229,100,0.14),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(155,229,100,0.08),transparent_24%)]" />
      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-[1440px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.72fr)] lg:gap-5 lg:px-8">
        <section className="flex min-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/75 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Sparkles className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">Result</p>
                <p className="text-xs text-muted-foreground">UGC Studio</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              AI video beta
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-7 sm:py-8">
            {messages.length === 0 ? (
              <EmptyState onUseExample={submitPrompt} />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="max-w-2xl">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                    Your next creative pass
                  </p>
                  <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.055em] text-balance sm:text-5xl">
                    Make the product impossible to scroll past.
                  </h1>
                </div>
                <div className="flex flex-col gap-3 pt-3">
                  {messages.map((message) => (
                    <article
                      className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm sm:max-w-[82%] ${
                        message.role === "user"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "mr-auto border border-border/70 bg-secondary/80 text-secondary-foreground"
                      }`}
                      key={message.id}
                    >
                      <p>{message.content}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
                <Loader2 className="size-4 animate-spin" />
                {activeStage || "working"}
              </div>
            ) : null}

            {isLoading || latestRender ? (
              <Pipeline activeStage={activeStage} status={latestRender?.render.status} />
            ) : null}
          </div>

          <div className="border-t border-border/70 bg-background/20 px-3 pb-3 sm:px-5">
            <AIPrompt
              className="w-full py-3"
              defaultModel="DeepSeek"
              headerAction="Create video"
              headerText="DeepSeek plans the hook. Result builds the video."
              models={["DeepSeek"]}
              onSubmit={(value) => submitPrompt(value)}
              placeholder="Paste a product URL or describe the audience"
            />
            {messages.length === 0 ? (
              <p className="px-2 pb-1 text-center text-[11px] text-muted-foreground">
                Press Enter to create. Shift + Enter adds a line.
              </p>
            ) : null}
          </div>
        </section>

        <aside className="grid min-h-[calc(100dvh-2rem)] gap-4 md:grid-rows-[minmax(480px,1fr)_auto]">
          <PreviewPanel
            onCreateAnother={createAnother}
            onRetry={() => submitPrompt(lastPrompt)}
            render={latestRender}
          />
          <RecipePanel render={latestRender} />
        </aside>
      </div>
    </main>
  );
}

function EmptyState({ onUseExample }: { onUseExample: (value: string) => void }) {
  return (
    <div className="grid flex-1 items-center gap-8 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.44fr)] lg:gap-10">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl"
        initial={{ opacity: 0, y: 18 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
          AI-powered UGC creation
        </p>
        <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-[-0.065em] text-balance sm:text-6xl lg:text-7xl">
          Turn a product into a video people remember.
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
          Paste a link or a rough pitch. DeepSeek finds the angle, then Result assembles the hook, footage, reaction, and final MP4.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          {examplePrompts.map((prompt) => (
            <button
              className="rounded-full border border-border/80 bg-secondary/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
              key={prompt}
              onClick={() => onUseExample(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        animate={{ opacity: 1, y: 0, rotate: 2 }}
        className="mx-auto w-full max-w-[220px]"
        initial={{ opacity: 0, y: 24, rotate: 7 }}
        transition={{ delay: 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="relative aspect-[9/16] overflow-hidden rounded-3xl border border-primary/30 bg-[#182117] p-3 shadow-2xl shadow-primary/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_16%,rgba(155,229,100,0.55),transparent_28%),linear-gradient(155deg,#273b27,#121711_65%)]" />
          <div className="relative flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/60">
              <span>Product story</span>
              <span>9:16</span>
            </div>
            <div>
              <p className="text-2xl font-black leading-[0.95] tracking-tight text-white [text-shadow:_0_2px_0_#111,_2px_0_0_#111,_0_-2px_0_#111,_-2px_0_0_#111]">
                Make the scroll stop.
              </p>
              <div className="mt-4 h-1.5 w-16 rounded-full bg-primary" />
            </div>
            <div className="flex items-end justify-between">
              <div className="space-y-1.5">
                <div className="h-2 w-20 rounded-full bg-white/40" />
                <div className="h-2 w-12 rounded-full bg-white/20" />
              </div>
              <div className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                <ArrowUpRight className="size-5" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Pipeline({
  activeStage,
  status,
}: {
  activeStage: Stage | null;
  status?: string;
}) {
  const reducedMotion = useReducedMotion();
  const done = status === "succeeded";
  const stopped = status === "failed" || status === "timeout";
  const activeIndex = done
    ? stages.length
    : stopped
      ? stages.length - 1
      : Math.max(0, stages.indexOf(activeStage || "exporting MP4"));

  return (
    <div className="rounded-2xl border border-border/70 bg-background/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Build pipeline</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {done
              ? "Your video is ready."
              : stopped
                ? "The render needs another pass."
                : "A clear hook, then a clean export."}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {done ? "Complete" : stopped ? "Stopped" : `${activeIndex + 1} / ${stages.length}`}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {stages.map((stage, index) => {
          const complete = done || index < activeIndex;
          const active = !done && !stopped && index === activeIndex;

          return (
            <div className="flex items-center gap-2" key={stage}>
              <div
                className={`grid size-6 shrink-0 place-items-center rounded-full border text-[10px] ${
                  complete
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-secondary/60 text-muted-foreground"
                }`}
              >
                {complete ? (
                  <Check className="size-3.5" />
                ) : active && !reducedMotion ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  index + 1
                )}
              </div>
              <span className={`text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {stage}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreviewPanel({
  onCreateAnother,
  onRetry,
  render,
}: {
  onCreateAnother: () => void;
  onRetry: () => void;
  render: RenderPayload | null;
}) {
  const finalVideo = isSucceededRender(render) ? render.render.url : null;
  const previewVideo = render?.media.backgroundVideos[0]?.url;
  const status = render?.render.status;
  const canRetry = status === "failed" || status === "timeout";

  return (
    <Card className="min-h-[480px] border-border/70 bg-card/80 shadow-xl shadow-black/15">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg">Your video</CardTitle>
          <CardDescription>
            {render
              ? finalVideo
                ? "Ready to download and share."
                : canRetry
                  ? "The export stopped before completion."
                  : "The creative is being assembled now."
              : "A 9:16 preview appears after you send a brief."}
          </CardDescription>
        </div>
        {render ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusPillClass(
              status || ""
            )}`}
          >
            {statusLabel(status || "waiting")}
          </span>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="relative mx-auto aspect-[9/16] max-h-[66dvh] w-full max-w-[360px] overflow-hidden rounded-3xl border border-border/80 bg-black/90 shadow-2xl shadow-black/30">
          <AnimatePresence initial={false} mode="wait">
            {finalVideo ? (
              <motion.video
                animate={{ opacity: 1 }}
                autoPlay
                className="absolute inset-0 h-full w-full object-cover"
                controls
                initial={{ opacity: 0 }}
                key="final-video"
                playsInline
                src={finalVideo}
              />
            ) : previewVideo ? (
              <motion.video
                animate={{ opacity: 0.82 }}
                autoPlay
                className="absolute inset-0 h-full w-full object-cover"
                initial={{ opacity: 0 }}
                key="preview-video"
                loop
                muted
                playsInline
                src={previewVideo}
              />
            ) : (
              <motion.div
                animate={{ opacity: 1 }}
                className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(155,229,100,0.32),transparent_31%),linear-gradient(160deg,#243322,#10140f_70%)]"
                initial={{ opacity: 0 }}
                key="placeholder"
              >
                <div className="flex h-full flex-col justify-between p-5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/60">
                    <span>UGC preview</span>
                    <Sparkles className="size-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-3xl font-black leading-[0.92] tracking-tight text-white [text-shadow:_0_2px_0_#111,_2px_0_0_#111,_0_-2px_0_#111,_-2px_0_0_#111]">
                      Your next hook starts here.
                    </p>
                    <p className="mt-3 max-w-[16ch] text-sm leading-relaxed text-white/65">
                      Paste a product brief to generate the first cut.
                    </p>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="space-y-2">
                      <div className="h-2 w-24 rounded-full bg-white/35" />
                      <div className="h-2 w-14 rounded-full bg-white/20" />
                    </div>
                    <div className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/25">
                      <ArrowUpRight className="size-5" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
        </div>

        {finalVideo ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              download
              href={finalVideo}
              rel="noreferrer"
              target="_blank"
            >
              <Download className="size-4" />
              Download MP4
            </a>
            <a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              href={finalVideo}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-4" />
              Open MP4
            </a>
            <Button className="min-h-10 rounded-xl" onClick={onCreateAnother} variant="outline">
              <Plus className="size-4" />
              Create another
            </Button>
          </div>
        ) : canRetry ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button className="rounded-xl" onClick={onRetry}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
            <Button className="rounded-xl" onClick={onCreateAnother} variant="outline">
              <Plus className="size-4" />
              New brief
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function statusPillClass(status: string): string {
  if (status === "succeeded") return "bg-primary/15 text-primary";
  if (status === "failed" || status === "timeout") return "bg-red-400/15 text-red-300";
  return "bg-secondary text-muted-foreground";
}

function statusLabel(status: string): string {
  if (status === "succeeded") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "timeout") return "Needs retry";
  if (status === "rendering") return "Rendering";
  if (status === "waiting") return "Queued";
  if (status === "transcribing") return "Composing";
  return "Preparing";
}

function isSucceededRender(
  render: RenderPayload | null | undefined
): render is RenderPayload & {
  render: RenderPayload["render"] & { url: string };
} {
  return render?.render.status === "succeeded" && Boolean(render.render.url);
}

function RecipePanel({ render }: { render: RenderPayload | null }) {
  return (
    <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/10">
      <CardHeader>
        <CardTitle className="text-lg">Video recipe</CardTitle>
        <CardDescription>Every ingredient behind the cut.</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-2 text-sm">
        {render ? (
          <>
            <RecipeRow label="Product" value={render.plan.productName} />
            <RecipeRow
              label="Pexels"
              value={render.plan.pexelsQuery}
              href={`https://pexels.com/search/${encodeURIComponent(render.plan.pexelsQuery)}`}
            />
            <RecipeRow label="Clips" value={`${render.media.backgroundVideos.length}`} />
            <CardDivider className="my-1" />
            <RecipeRow
              label="GIPHY"
              value={render.plan.stickerQuery}
              href={render.media.sticker.giphyUrl}
            />
            <RecipeRow
              label="Audio"
              value="Funny Pop"
              href={render.media.audioUrl}
            />
            <RecipeRow label="AI plan" value={render.usedAI ? "DeepSeek" : "Fallback plan"} />
          </>
        ) : (
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3 md:grid-cols-1">
            <p>DeepSeek finds the angle.</p>
            <p>Pexels and GIPHY bring the texture.</p>
            <p>Creatomate exports the final cut.</p>
          </div>
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
    <div className="grid grid-cols-[88px_1fr] items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2">
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
