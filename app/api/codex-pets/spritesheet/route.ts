import { NextRequest, NextResponse } from "next/server";

const MAX_SPRITESHEET_BYTES = 5 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const remoteUrl = request.nextUrl.searchParams.get("url");
  if (!remoteUrl) {
    return NextResponse.json({ error: "Missing spritesheet URL." }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(remoteUrl);
  } catch {
    return NextResponse.json({ error: "Invalid spritesheet URL." }, { status: 400 });
  }

  if (url.protocol !== "https:" || url.hostname !== "codex-pets.net" || !url.pathname.endsWith("/spritesheet.webp")) {
    return NextResponse.json({ error: "Only Codex Pets spritesheet.webp assets can be imported." }, { status: 400 });
  }

  const response = await fetch(url, {
    headers: { accept: "image/webp" },
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    return NextResponse.json({ error: `Spritesheet fetch failed with ${response.status}.` }, { status: 502 });
  }

  const contentType = response.headers.get("content-type") ?? "";
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (!contentType.includes("image/webp")) {
    return NextResponse.json({ error: "Remote spritesheet is not a WEBP image." }, { status: 502 });
  }
  if (contentLength > MAX_SPRITESHEET_BYTES) {
    return NextResponse.json({ error: "Remote spritesheet is too large." }, { status: 502 });
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_SPRITESHEET_BYTES) {
    return NextResponse.json({ error: "Remote spritesheet is too large." }, { status: 502 });
  }

  return new NextResponse(bytes, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/webp"
    }
  });
}
