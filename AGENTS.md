# AGENTS.md

Result UGC Studio — a Next.js app that turns a product URL/pitch into a short UGC MP4 (OpenRouter plans the script, Pexels + GIPHY supply media, Creatomate renders).

## Commands

- `npm run dev` — dev server (Turbopack).
- `npm run build` / `npm run check` — both run `next build`. **This is the only verification step; there is no test, lint, or typecheck script.** Type errors surface only via `next build` (`tsc` has `noEmit` and isn't wired to a script).
- No test runner, ESLint, or Prettier config exists. Don't invent `npm test` / `npm run lint`.

## Architecture

- **All business logic lives under `lib/ugc/`**. The two API routes are thin wrappers:
  - `app/api/chat/route.ts` → `handleChatRequest()` (the whole pipeline).
  - `app/api/render/[id]/route.ts` → `getCreatomateRender()` (status polling).
- Message routing in `handleChatRequest`: `looksLikeProductBrief()` (keyword/URL gate) decides render vs. chat. Briefs run the full pipeline; anything else returns `type: "chat"` with a conversational OpenRouter reply (`buildConversationalReply`, which also falls back to a canned line when `OPENROUTER_API_KEY` is absent). A brief like "tell me a joke about my app" can trip the keyword and render — upgrade path is LLM intent classification.
- Pipeline: validate message → fetch site HTML → OpenRouter plan → Pexels video + GIPHY sticker → Creatomate render → client polls `/api/render/{id}` until `succeeded`/`failed`.
- Frontend is one client component, `components/ugc-studio.tsx`, rendered by `app/page.tsx`. It does the status polling loop (`pollRender`, up to 36 attempts ~3 min).
- Both API routes pin `export const runtime = "nodejs"` — required because `lib/ugc/net.ts` uses `node:dns`/`node:net`. Do not switch to the edge runtime.
- Route handler uses Next 16 async params: `{ params }: { params: Promise<{ id: string }> }` then `await params`.

## Environment

- Secrets load from `.env.local` (gitignored, already populated locally with live keys — never print or commit them). `.env.example` lists the keys.
- `PEXELS_API_KEY`, `GIPHY_API_KEY`, `CREATOMATE_API_KEY` are **required** — `assertServerConfig()` throws `Missing <KEY>` if absent.
- `OPENROUTER_API_KEY` is **optional**: without it (or on any AI error) the code silently falls back to `buildFallbackPlan()`. `OPENROUTER_MODEL` defaults to `moonshotai/kimi-k2.6`.
- `CREATOMATE_TEMPLATE_ID` is optional. If set AND the template exposes media-ready layer names (`templateLooksMediaReady` checks for background/video + sticker/gif + audio layers), it uses template mode; otherwise it builds an inline renderscript (`buildRenderScriptBody`).
- Audio asset is `public/audio/funny-pop.mp3`. `resolveAudioUrl()` (`lib/ugc/creatomate.ts`) resolves its public URL: `PUBLIC_MEDIA_BASE_URL` env → else a publicly-reachable request origin (`isPubliclyReachableOrigin`, literal-hostname check) → else the hardcoded `FALLBACK_AUDIO_URL` (`https://resulttest-henna.vercel.app/audio/funny-pop.mp3`). Because of that final fallback, `audioUrl` is effectively never `""` — both render bodies include audio. The omit-on-empty branch is defensive only. Set `PUBLIC_MEDIA_BASE_URL` to your deploy origin so dev renders don't depend on the prod fallback URL.

## Deployment (Vercel)

- Production: `https://resulttest-henna.vercel.app` (project `guthala-rajkumars-projects/resulttest`). Deployed via `vercel --prod` from local files (no git remote; the CLI uploads the working dir).
- **Secrets live in Vercel env, not `.env.local`** (Vercel never uploads `.env.local`). Manage with `vercel env add/ls/rm` for Production/Preview/Development. **Env changes require a redeploy to take effect.**
- `app/api/chat/route.ts` sets `export const maxDuration = 60` — the synchronous pipeline (~20-30s) exceeds Vercel's 10s default and would time out otherwise.

## Gotchas

- `assertPublicHttpUrl()` in `lib/ugc/net.ts` is an SSRF guard (blocks localhost/private IPs via DNS resolution). Keep it when touching `fetchSiteContext`. `isPubliclyReachableOrigin()` reuses its `isPrivateIp` helper for the audio guard (literal-hostname check only, not a security boundary).
- `public/renders/` is gitignored output.
- Local dev served via `next start` won't hot-reload code changes — rebuild (`npm run build`) and restart. `next dev` does hot-reload.

## Stack conventions

- Next.js 16 App Router, React 19, TypeScript strict, ESM (`"type": "module"`).
- Tailwind **v4** — no `tailwind.config`; configured via `app/globals.css` and `@tailwindcss/postcss`.
- shadcn/ui (style `base-nova`, base color neutral) in `components/ui`; kokonutui registry components in `components/kokonutui`. Import alias `@/*` maps to the repo root (see `tsconfig.json` / `components.json`).
