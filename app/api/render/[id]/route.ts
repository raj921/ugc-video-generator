import { NextResponse } from "next/server";
import { getCreatomateRender } from "@/lib/ugc";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const render = await getCreatomateRender(id);
    return NextResponse.json({ render });
  } catch {
    return NextResponse.json({ error: "Could not read render status" }, { status: 500 });
  }
}
