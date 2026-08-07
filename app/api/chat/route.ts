import { NextResponse } from "next/server";
import { handleChatRequest, type ChatMessage } from "@/lib/ugc";

export const runtime = "nodejs";
// The whole pipeline (site fetch + DeepSeek plan + Pexels/GIPHY + create render)
// runs synchronously here and can take ~20-30s. Vercel's default function limit is
// 10s, which would time out, so raise it to the Hobby maximum.
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown; history?: unknown };
    const message = typeof body.message === "string" ? body.message : "";
    const history = Array.isArray(body.history) ? (body.history.filter(isChatMessage) as ChatMessage[]) : [];
    const result = await handleChatRequest(message, history, getPublicOrigin(request));

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        type: "chat",
        reply: cleanError(error),
      },
      { status: 500 }
    );
  }
}

function getPublicOrigin(request: Request) {
  const fallback = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost || request.headers.get("host") || fallback.host;
  const proto = forwardedProto || fallback.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (item.role === "user" || item.role === "assistant") && typeof item.content === "string";
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : "The render failed.";
  // ponytail: surface the real error. Generic messages just hide what's broken.
  if (message.startsWith("Missing ")) return `${message}. Add it to .env.local or your deployment env.`;
  return message;
}
