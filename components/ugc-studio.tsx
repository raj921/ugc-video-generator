"use client";

import { Button } from "@/components/ui/button";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  AudioLines,
  Bot,
  Check,
  Clapperboard,
  Download,
  ExternalLink,
  Film,
  Flame,
  Globe,
  Layers,
  Link2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Sticker,
  Wand2,
  Zap,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types (unchanged wire contract)                                    */
/* ------------------------------------------------------------------ */

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
  "Understanding product",
  "Finding footage",
  "Adding reaction",
  "Exporting MP4",
] as const;

type Stage = (typeof stages)[number];

const stageIcons = [Globe, Film, Sticker, Clapperboard];

const examplePrompts = [
  "Make a playful ad for a calorie tracking app",
  "Create a founder-style video for my SaaS",
  "Turn my skincare brand into a testimonial",
];

const marqueeItems = [
  "DeepSeek directs the cut",
  "Pexels B-roll",
  "GIPHY reactions",
  "Creatomate render",
  "Hook-first scripts",
  "9:16 vertical native",
  "Sound on delivery",
  "Zero editing required",
];

/* ------------------------------------------------------------------ */
/*  Main studio                                                        */
/* ------------------------------------------------------------------ */

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
        setActiveStage(stages[3]);
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

  const working = messages.length > 0;

  return (
    <main className="relative min-h-[100dvh] overflow-x-clip bg-background text-foreground">
      <AmbientBackground />

      <TopNav onReset={createAnother} working={working} />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {working ? (
          <Workspace
            messages={messages}
            isLoading={isLoading}
            activeStage={activeStage}
            latestRender={latestRender}
            onSubmit={submitPrompt}
            onRetry={() => void submitPrompt(lastPrompt)}
            onCreateAnother={createAnother}
          />
        ) : (
          <Landing
            isLoading={isLoading}
            onSubmit={submitPrompt}
          />
        )}
      </div>

      <Marquee />
      <SiteFooter />
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Ambient background                                                 */
/* ------------------------------------------------------------------ */

function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="bg-grid absolute inset-0" />
      <div
        className="aurora aurora-1 left-[-10%] top-[-12%] h-[34rem] w-[34rem] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(155,229,100,0.16), transparent 65%)" }}
      />
      <div
        className="aurora aurora-2 right-[-12%] top-[22%] h-[38rem] w-[38rem] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(120,200,80,0.10), transparent 65%)" }}
      />
      <div
        className="aurora aurora-3 bottom-[-20%] left-[28%] h-[30rem] w-[30rem] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(155,229,100,0.08), transparent 65%)" }}
      />
      <div className="noise" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Top navigation                                                     */
/* ------------------------------------------------------------------ */

function TopNav({ onReset, working }: { onReset: () => void; working: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          className="group flex items-center gap-3 text-left"
          onClick={onReset}
          type="button"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform duration-300 group-hover:rotate-[-8deg]">
            <Clapperboard className="size-4.5" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">Result</span>
            <span className="eyebrow block text-[10px] text-muted-foreground">UGC Studio</span>
          </span>
        </button>

        <nav className="ml-6 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a className="transition-colors hover:text-foreground" href="#studio">
            Studio
          </a>
          <a className="transition-colors hover:text-foreground" href="#how">
            How it works
          </a>
          <a className="transition-colors hover:text-foreground" href="#stack">
            Stack
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary sm:flex">
            <span className="pulse-dot size-1.5 rounded-full bg-primary" />
            AI video beta
          </span>
          {working ? (
            <Button
              className="btn-sheen h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={onReset}
              type="button"
            >
              <Plus className="size-4" />
              New brief
            </Button>
          ) : (
            <a
              className="btn-sheen inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              href="#studio"
            >
              Start creating
              <ArrowRight className="size-4" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Landing (empty state)                                              */
/* ------------------------------------------------------------------ */

function Landing({
  isLoading,
  onSubmit,
}: {
  isLoading: boolean;
  onSubmit: (value: string) => void;
}) {
  return (
    <div className="pb-10 pt-14 sm:pt-20">
      {/* Hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="glass flex items-center gap-2.5 rounded-full px-4 py-1.5"
        >
          <span className="pulse-dot size-1.5 rounded-full bg-primary" />
          <span className="eyebrow text-primary">AI UGC creation</span>
          <span className="h-3 w-px bg-white/15" />
          <span className="text-xs text-muted-foreground">Brief in · MP4 out</span>
        </motion.div>

        <h1 className="mt-7 text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
          <RevealText
            segments={[
              { text: "Turn any product into a video that" },
              { text: "stops the scroll.", accent: true },
            ]}
          />
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Paste a product link or a rough pitch. DeepSeek finds the angle, then
          Result assembles the hook, footage, reaction and sound into a 9:16 cut
          ready to post.
        </motion.p>

        <div id="studio" className="mt-10 w-full max-w-2xl scroll-mt-28">
          <Composer isLoading={isLoading} onSubmit={onSubmit} />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.7 }}
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            {examplePrompts.map((prompt) => (
              <button
                className="group rounded-full border border-white/8 bg-white/[0.03] px-3.5 py-2 text-left text-xs text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                key={prompt}
                onClick={() => onSubmit(prompt)}
                type="button"
              >
                <Sparkles className="mr-1.5 inline size-3 text-primary/70 transition-transform group-hover:rotate-12" />
                {prompt}
              </button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Phone hero */}
      <motion.section
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto mt-16 w-full max-w-md sm:mt-20"
      >
        <PhonePreview render={null} />
        <FloatingHeroChip
          className="float-slow left-[-6%] top-[16%] hidden sm:flex"
          icon={<Zap className="size-3 text-primary" />}
          label="Hook · 0.8s"
        />
        <FloatingHeroChip
          className="float-slower right-[-8%] top-[34%] hidden sm:flex"
          icon={<Film className="size-3 text-primary" />}
          label="B-roll · Pexels"
        />
        <FloatingHeroChip
          className="float-slow bottom-[20%] left-[-10%] hidden sm:flex"
          icon={<Sticker className="size-3 text-primary" />}
          label="Sticker · GIPHY"
        />
        <FloatingHeroChip
          className="float-slower bottom-[8%] right-[-4%] hidden sm:flex"
          icon={<AudioLines className="size-3 text-primary" />}
          label="SFX · Funny Pop"
        />
      </motion.section>

      <StatsBar />

      <HowItWorks />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace (after first brief)                                      */
/* ------------------------------------------------------------------ */

function Workspace({
  messages,
  isLoading,
  activeStage,
  latestRender,
  onSubmit,
  onRetry,
  onCreateAnother,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  activeStage: Stage | null;
  latestRender: RenderPayload | null;
  onSubmit: (value: string) => void;
  onRetry: () => void;
  onCreateAnother: () => void;
}) {
  return (
    <div
      id="studio"
      className="grid scroll-mt-24 gap-6 pb-16 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:gap-8"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="eyebrow text-primary">Your creative pass</p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Make the product impossible to scroll past.
          </h2>
        </motion.div>

        <Conversation messages={messages} isLoading={isLoading} />

        {isLoading || latestRender ? (
          <Pipeline
            activeStage={activeStage}
            isLoading={isLoading}
            status={latestRender?.render.status}
          />
        ) : null}

        <Composer isLoading={isLoading} onSubmit={onSubmit} />
      </div>

      <aside className="flex flex-col gap-5 self-start lg:sticky lg:top-24">
        <PhoneCard
          render={latestRender}
          onRetry={onRetry}
          onCreateAnother={onCreateAnother}
        />
        <RecipeCard render={latestRender} />
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Conversation                                                       */
/* ------------------------------------------------------------------ */

function Conversation({
  messages,
  isLoading,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="glass flex max-h-[46dvh] min-h-[220px] flex-col overflow-hidden rounded-3xl">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
        <Bot className="size-4 text-primary" />
        <span className="text-sm font-medium">Brief console</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="pulse-dot size-1.5 rounded-full bg-primary" />
          {isLoading ? "Rendering" : "Live"}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "flex max-w-[92%] flex-col gap-1 sm:max-w-[80%]",
                message.role === "user" ? "ml-auto items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  message.role === "user"
                    ? "rounded-br-md bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "rounded-bl-md border border-white/8 bg-white/[0.04] text-foreground"
                )}
              >
                {message.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-primary/20 bg-primary/[0.07] px-4 py-3 text-sm text-primary w-fit"
          >
            <span className="flex gap-1">
              <span className="think-dot size-1.5 rounded-full bg-primary" />
              <span className="think-dot size-1.5 rounded-full bg-primary" />
              <span className="think-dot size-1.5 rounded-full bg-primary" />
            </span>
            Directing your cut
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Composer                                                           */
/* ------------------------------------------------------------------ */

function Composer({
  onSubmit,
  isLoading,
}: {
  onSubmit: (value: string) => void;
  isLoading: boolean;
}) {
  const [value, setValue] = useState("");
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 64,
    maxHeight: 240,
  });

  const submit = () => {
    const clean = value.trim();
    if (!clean || isLoading) return;
    onSubmit(clean);
    setValue("");
    adjustHeight(true);
  };

  return (
    <div className="glass-strong rounded-3xl p-2.5 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 px-3.5 pt-2">
        <Wand2 className="size-3.5 text-primary" />
        <span className="eyebrow text-[10px] text-muted-foreground">
          New brief
        </span>
        <span className="ml-auto hidden font-mono text-[10px] text-muted-foreground/70 sm:block">
          Enter ↵ to render · Shift + Enter for a new line
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          adjustHeight();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Paste a product URL, or describe the audience and vibe…"
        rows={2}
        className="mt-1 w-full resize-none rounded-2xl border-0 bg-transparent px-3.5 py-3 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
      />

      <div className="mt-1 flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">
            <Link2 className="size-3 text-primary/80" />
            Any product URL
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">
            <Film className="size-3 text-primary/80" />
            9:16 · 1080×1920
          </span>
        </div>

        <button
          aria-label="Generate video"
          className={cn(
            "ml-auto grid size-11 place-items-center rounded-full transition-all",
            value.trim() && !isLoading
              ? "btn-sheen glow-breathe bg-primary text-primary-foreground"
              : "cursor-not-allowed bg-white/[0.06] text-muted-foreground"
          )}
          disabled={!value.trim() || isLoading}
          onClick={submit}
          type="button"
        >
          {isLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ArrowRight className="size-5" />
          )}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pipeline stepper                                                   */
/* ------------------------------------------------------------------ */

function Pipeline({
  activeStage,
  isLoading,
  status,
}: {
  activeStage: Stage | null;
  isLoading: boolean;
  status?: string;
}) {
  const reducedMotion = useReducedMotion();
  const done = status === "succeeded";
  const stopped = status === "failed" || status === "timeout";
  const activeIndex = done
    ? stages.length
    : stopped
      ? stages.length - 1
      : isLoading
        ? Math.max(0, stages.indexOf(activeStage || stages[stages.length - 1]))
        : -1;

  return (
    <div className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Build pipeline</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {done
              ? "Your video is ready to ship."
              : stopped
                ? "The render needs another pass."
                : "A clear hook, then a clean export."}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 font-mono text-[11px]",
            done
              ? "border-primary/30 bg-primary/10 text-primary"
              : stopped
                ? "border-red-400/30 bg-red-400/10 text-red-300"
                : "border-white/10 bg-white/[0.03] text-muted-foreground"
          )}
        >
          {done ? "Complete" : stopped ? "Stopped" : `${Math.min(activeIndex + 1, stages.length)} / ${stages.length}`}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0">
        {stages.map((stage, index) => {
          const complete = done || index < activeIndex;
          const active = !done && !stopped && index === activeIndex;
          const Icon = stageIcons[index];

          return (
            <Fragment key={stage}>
              <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2.5 sm:text-center">
                <motion.div
                  animate={
                    active && !reducedMotion
                      ? { scale: [1, 1.08, 1] }
                      : { scale: 1 }
                  }
                  transition={
                    active
                      ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.3 }
                  }
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-2xl border transition-colors duration-500",
                    complete
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : active
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-white/8 bg-white/[0.03] text-muted-foreground/60"
                  )}
                >
                  {complete ? (
                    <motion.span
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    >
                      <Check className="size-4" />
                    </motion.span>
                  ) : active && !reducedMotion ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </motion.div>
                <span
                  className={cn(
                    "text-xs transition-colors duration-300 sm:max-w-[7rem]",
                    active || complete ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {stage}
                </span>
              </div>
              {index < stages.length - 1 ? (
                <div
                  className={cn(
                    "ml-5 w-px self-stretch sm:mx-2 sm:mt-5 sm:h-px sm:w-auto sm:flex-1 sm:self-start rounded-full transition-colors duration-700",
                    index < activeIndex || done
                      ? "bg-gradient-to-r from-primary/70 to-primary/20"
                      : "bg-white/8"
                  )}
                />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Phone preview                                                      */
/* ------------------------------------------------------------------ */

function useTilt() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 140, damping: 18 });
  const springY = useSpring(rotateY, { stiffness: 140, damping: 18 });

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 9);
    rotateX.set(-py * 9);
  };

  const onMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return {
    ref,
    onMouseMove,
    onMouseLeave,
    style: {
      rotateX: springX,
      rotateY: springY,
      transformStyle: "preserve-3d" as const,
    },
  };
}

function PhonePreview({ render }: { render: RenderPayload | null }) {
  const tilt = useTilt();
  const finalVideo = isSucceededRender(render) ? render.render.url : null;
  const previewVideo = render?.media.backgroundVideos[0]?.url;
  const status = render?.render.status;
  const rendering = Boolean(render) && !finalVideo && status !== "failed" && status !== "timeout";
  const failed = status === "failed" || status === "timeout";

  return (
    <div className="relative mx-auto w-full max-w-[320px]" style={{ perspective: 1200 }}>
      <div className="ring-conic absolute -inset-[2px] rounded-[2.9rem] opacity-60 blur-[1.5px]" aria-hidden />
      <div className="absolute -inset-6 rounded-full bg-primary/10 blur-3xl" aria-hidden />

      <motion.div
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        style={tilt.style}
        className="relative aspect-[9/16] overflow-hidden rounded-[2.6rem] border border-white/12 bg-black shadow-2xl shadow-black/60"
      >
        <AnimatePresence initial={false} mode="wait">
          {finalVideo ? (
            <motion.video
              key="final"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 h-full w-full object-cover"
              src={finalVideo}
              autoPlay
              controls
              playsInline
            />
          ) : previewVideo && !failed ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              <video
                className="absolute inset-0 h-full w-full object-cover opacity-90"
                src={previewVideo}
                autoPlay
                loop
                muted
                playsInline
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

              {render?.media.sticker.url ? (
                <motion.img
                  initial={{ opacity: 0, y: 30, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  alt={render.media.sticker.title}
                  src={render.media.sticker.url}
                  className="absolute inset-x-0 bottom-[6%] mx-auto h-[52%] w-[90%] object-contain drop-shadow-2xl"
                />
              ) : null}

              <div className="absolute inset-x-6 top-[10%] text-center">
                <p className="text-balance text-2xl font-black leading-[1.02] tracking-tight text-white [text-shadow:_0_2px_0_#000,_2px_0_0_#000,_0_-2px_0_#000,_-2px_0_0_#000,_2px_2px_0_#000,_-2px_2px_0_#000,_2px_-2px_0_#000,_-2px_-2px_0_#000]">
                  {render?.plan.hook}
                </p>
              </div>

              {rendering ? (
                <>
                  <div className="scanline" />
                  <div className="absolute inset-x-4 top-4 flex items-center justify-between">
                    <span className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white">
                      <span className="flex gap-0.5">
                        <span className="think-dot size-1 rounded-full bg-primary" />
                        <span className="think-dot size-1 rounded-full bg-primary" />
                        <span className="think-dot size-1 rounded-full bg-primary" />
                      </span>
                      Rendering
                    </span>
                    <span className="glass rounded-full px-2.5 py-1.5 font-mono text-[10px] text-white/80">
                      9:16
                    </span>
                  </div>
                  <div className="absolute inset-x-6 bottom-5">
                    <div className="shimmer h-1 w-full rounded-full bg-white/15">
                      <div className="h-full w-2/3 rounded-full bg-primary/80" />
                    </div>
                    <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
                      Compositing footage · sticker · sound
                    </p>
                  </div>
                </>
              ) : null}
            </motion.div>
          ) : failed ? (
            <motion.div
              key="failed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_30%,rgba(248,113,113,0.14),transparent_60%),linear-gradient(160deg,#1d1414,#0b0a0a_75%)] p-8 text-center"
            >
              <span className="grid size-12 place-items-center rounded-2xl border border-red-400/30 bg-red-400/10 text-red-300">
                <AlertTriangle className="size-5" />
              </span>
              <p className="text-lg font-semibold text-white">Render didn’t finish</p>
              <p className="text-xs leading-relaxed text-white/50">
                The export stopped before completion. Run the same brief again —
                it usually lands on the second pass.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_12%,rgba(155,229,100,0.28),transparent_42%),linear-gradient(165deg,#1c2a17,#0b0f08_68%)]"
            >
              {/* phone chrome */}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between px-6 pt-4 text-[10px] text-white/55">
                <span className="font-mono">9:41</span>
                <span className="h-4 w-20 rounded-full bg-black/60" />
                <span className="font-mono">100%</span>
              </div>

              <div className="absolute inset-x-0 top-12 flex items-center justify-between px-6 text-[9px] font-medium uppercase tracking-[0.22em] text-white/50">
                <span>UGC preview</span>
                <span className="flex items-center gap-1 text-primary">
                  <Sparkles className="size-3" />
                  AI
                </span>
              </div>

              {/* hook */}
              <div className="absolute inset-x-6 top-[24%]">
                <p className="text-[2rem] font-black leading-[0.94] tracking-tight text-white">
                  Make the
                  <br />
                  scroll
                  <span className="text-lime-gradient"> stop.</span>
                </p>
                <div className="mt-4 h-1 w-14 rounded-full bg-primary" />
                <p className="mt-3 text-xs leading-relaxed text-white/55">
                  Hook-first cuts engineered for the feed.
                </p>
              </div>

              {/* floating chips */}
              <div className="absolute right-4 top-[18%] glass float-slow rounded-xl px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-white/85">
                  <Flame className="size-3 text-primary" /> Hook
                </span>
              </div>
              <div className="absolute left-4 top-[52%] glass float-slower rounded-xl px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-white/85">
                  <Layers className="size-3 text-primary" /> B-roll
                </span>
              </div>

              {/* bottom transport */}
              <div className="absolute inset-x-6 bottom-6">
                <div className="flex items-end justify-between">
                  <div className="space-y-2">
                    <div className="flex items-end gap-0.5">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="eq-bar h-4 w-1 rounded-full bg-primary/80"
                          style={{ animationDelay: `${i * 0.12}s` }}
                        />
                      ))}
                    </div>
                    <p className="font-mono text-[10px] text-white/50">00:00 / 00:30</p>
                  </div>
                  <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/40">
                    <Play className="size-5 translate-x-0.5" />
                  </span>
                </div>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/15">
                  <motion.div
                    className="h-full w-1/4 rounded-full bg-primary"
                    animate={{ x: ["-100%", "400%"] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function FloatingHeroChip({
  className,
  icon,
  label,
}: {
  className?: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn(
        "glass absolute z-20 items-center gap-2 rounded-2xl px-3.5 py-2.5 shadow-xl shadow-black/30",
        className
      )}
    >
      {icon}
      <span className="text-xs font-medium text-white/85">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Phone card (workspace right rail)                                  */
/* ------------------------------------------------------------------ */

function PhoneCard({
  render,
  onRetry,
  onCreateAnother,
}: {
  render: RenderPayload | null;
  onRetry: () => void;
  onCreateAnother: () => void;
}) {
  const finalVideo = isSucceededRender(render) ? render.render.url : null;
  const status = render?.render.status;
  const canRetry = status === "failed" || status === "timeout";

  return (
    <div className="glass rounded-3xl p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Your video</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {render
              ? finalVideo
                ? "Ready to download and share."
                : canRetry
                  ? "The export stopped before completion."
                  : "The creative is being assembled now."
              : "A 9:16 preview appears after you send a brief."}
          </p>
        </div>
        {render ? (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
              statusPillClass(status || "")
            )}
          >
            {statusLabel(status || "waiting")}
          </span>
        ) : null}
      </div>

      <PhonePreview render={render} />

      {finalVideo ? (
        <div className="mt-5 grid gap-2">
          <a
            className="btn-sheen inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            download
            href={finalVideo}
            rel="noreferrer"
            target="_blank"
          >
            <Download className="size-4" />
            Download MP4
          </a>
          <div className="grid grid-cols-2 gap-2">
            <a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-sm transition-colors hover:bg-white/[0.07]"
              href={finalVideo}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-4" />
              Open
            </a>
            <Button
              className="min-h-10 rounded-xl border-white/8 bg-white/[0.03] hover:bg-white/[0.07]"
              onClick={onCreateAnother}
              variant="outline"
            >
              <Plus className="size-4" />
              New brief
            </Button>
          </div>
        </div>
      ) : canRetry ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            className="h-10 flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onRetry}
          >
            <RefreshCw className="size-4" />
            Try again
          </Button>
          <Button
            className="h-10 flex-1 rounded-xl border-white/8 bg-white/[0.03] hover:bg-white/[0.07]"
            onClick={onCreateAnother}
            variant="outline"
          >
            <Plus className="size-4" />
            New brief
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recipe card                                                        */
/* ------------------------------------------------------------------ */

function RecipeCard({ render }: { render: RenderPayload | null }) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center gap-2">
        <Wand2 className="size-4 text-primary" />
        <h3 className="text-base font-semibold tracking-tight">Video recipe</h3>
      </div>

      {render ? (
        <div className="space-y-2">
          <RecipeRow label="Product" value={render.plan.productName} />
          <RecipeRow
            label="Pexels"
            value={render.plan.pexelsQuery}
            href={`https://pexels.com/search/${encodeURIComponent(render.plan.pexelsQuery)}`}
          />
          <RecipeRow label="Clips" value={`${render.media.backgroundVideos.length} B-roll shots`} />
          <RecipeRow
            label="GIPHY"
            value={render.plan.stickerQuery}
            href={render.media.sticker.giphyUrl}
          />
          <RecipeRow label="Audio" value="Funny Pop" href={render.media.audioUrl} />
          <RecipeRow label="Director" value={render.usedAI ? "DeepSeek AI" : "Fallback plan"} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: Bot, label: "DeepSeek finds the angle" },
            { icon: Layers, label: "Pexels + GIPHY add texture" },
            { icon: Clapperboard, label: "Creatomate exports the cut" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 rounded-2xl border border-white/6 bg-white/[0.02] px-2 py-4"
            >
              <Icon className="size-4 text-primary/80" />
              <span className="text-[10px] leading-snug text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {href ? (
        <a
          className="flex min-w-0 items-center gap-1.5 text-xs text-primary transition-colors hover:text-primary/70"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          <span className="truncate">{value}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ) : (
        <span className="min-w-0 truncate text-xs text-foreground/90">{value}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

function StatsBar() {
  const stats = [
    { value: "~60s", label: "From brief to first cut" },
    { value: "9:16", label: "Vertical-native format" },
    { value: "3", label: "Media sources blended" },
    { value: "4", label: "AI-directed stages" },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="glass rounded-2xl px-4 py-5 text-center transition-colors hover:border-primary/30"
        >
          <p className="text-2xl font-semibold tracking-tight text-gradient sm:text-3xl">
            {stat.value}
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            {stat.label}
          </p>
        </div>
      ))}
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/*  How it works bento                                                 */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  const cards = [
    {
      icon: Link2,
      index: "01",
      title: "Drop the link or the pitch",
      body: "Paste any product URL or a rough one-line brief. DeepSeek reads the page, category and audience before writing a single word.",
      wide: true,
    },
    {
      icon: Wand2,
      index: "02",
      title: "AI directs the hook",
      body: "The plan locks the scroll-stopping hook, caption, CTA and facts in seconds.",
      wide: false,
    },
    {
      icon: Layers,
      index: "03",
      title: "B-roll + reaction, auto-cast",
      body: "Pexels supplies vertical footage, GIPHY casts the reaction sticker and a pop SFX lands on the beat.",
      wide: false,
    },
    {
      icon: Clapperboard,
      index: "04",
      title: "Export a vertical MP4",
      body: "Creatomate composites hook, footage, sticker and sound into a 1080×1920 cut you can download and post straight to the feed.",
      wide: true,
    },
  ];

  return (
    <section id="how" className="mt-20 scroll-mt-28 sm:mt-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-2xl text-center"
      >
        <p className="eyebrow text-primary">The workflow</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Four moves from product page to posted video.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          No timeline, no editing degree. The pipeline works like a tiny
          production crew that never sleeps.
        </p>
      </motion.div>

      <div id="stack" className="mt-10 grid scroll-mt-28 gap-4 sm:grid-cols-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.index}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{
              duration: 0.65,
              delay: (i % 2) * 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={cn(
              "group glass relative overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 sm:col-span-1",
              card.wide && "sm:col-span-2"
            )}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                <card.icon className="size-5" />
              </span>
              <span className="font-mono text-xs text-muted-foreground/50">
                {card.index}
              </span>
            </div>
            <h3 className="mt-5 text-lg font-semibold tracking-tight">
              {card.title}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {card.body}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Marquee + footer                                                   */
/* ------------------------------------------------------------------ */

function Marquee() {
  return (
    <div className="relative z-10 mt-20 overflow-hidden border-y border-white/5 bg-white/[0.015] py-4">
      <div className="marquee-track">
        {[0, 1].map((dup) => (
          <div key={dup} aria-hidden={dup === 1} className="flex shrink-0 items-center gap-8 pr-8">
            {marqueeItems.map((item) => (
              <span
                key={`${dup}-${item}`}
                className="flex items-center gap-8 text-sm font-medium tracking-tight text-muted-foreground"
              >
                <span className="transition-colors hover:text-foreground">{item}</span>
                <Sparkles className="size-3.5 text-primary/70" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-lg bg-primary/15 text-primary">
          <Clapperboard className="size-3" />
        </span>
        <span>
          Result UGC Studio — DeepSeek × Pexels × GIPHY × Creatomate
        </span>
      </div>
      <span className="font-mono text-[11px]">© 2026 Result · Brief in, MP4 out</span>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Word-reveal headline                                               */
/* ------------------------------------------------------------------ */

function RevealText({
  segments,
}: {
  segments: { text: string; accent?: boolean }[];
}) {
  const reduced = useReducedMotion();
  let wordIndex = 0;

  return (
    <>
      {segments.map((segment, segIndex) => {
        const words = segment.text.split(" ");
        return (
          <span key={segIndex} className="inline">
            {words.map((word, i) => {
              const delay = 0.15 + wordIndex * 0.055;
              wordIndex += 1;
              return (
                <span
                  key={`${segIndex}-${i}`}
                  className="inline-block overflow-hidden align-bottom"
                >
                  <motion.span
                    initial={reduced ? false : { y: "110%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      "inline-block will-change-transform",
                      segment.accent && "text-lime-gradient"
                    )}
                  >
                    {word}
                    {i < words.length - 1 ? "\u00A0" : ""}
                  </motion.span>
                </span>
              );
            })}
            {segIndex < segments.length - 1 ? "\u00A0" : ""}
          </span>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers (unchanged)                                                */
/* ------------------------------------------------------------------ */

function statusPillClass(status: string): string {
  if (status === "succeeded") return "border-primary/30 bg-primary/10 text-primary";
  if (status === "failed" || status === "timeout")
    return "border-red-400/30 bg-red-400/10 text-red-300";
  return "border-white/10 bg-white/[0.03] text-muted-foreground";
}

function statusLabel(status: string): string {
  if (status === "succeeded") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "timeout") return "Retry";
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
