import { NextRequest, NextResponse } from "next/server";
import { getBearerUser } from "@/lib/supabase/server";

type CodexPetsApiResponse = {
  pet?: {
    id?: string;
    displayName?: string;
    description?: string;
    spritesheetUrl?: string;
    validationReport?: {
      atlasSize?: string;
      cellSize?: string;
      statesDetected?: number;
    };
  };
};

export async function POST(request: NextRequest) {
  const { user, error } = await getBearerUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401 });

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const slug = parseCodexPetSlug(body.url);
  if (!slug) {
    return NextResponse.json({ error: "Enter a Codex Pets URL like https://codex-pets.net/#/pets/sable." }, { status: 400 });
  }

  const response = await fetch(`https://codex-pets.net/api/pets/${encodeURIComponent(slug)}`, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 }
  });

  if (!response.ok) {
    return NextResponse.json({ error: `Codex Pets returned ${response.status} for ${slug}.` }, { status: 502 });
  }

  const data = (await response.json()) as CodexPetsApiResponse;
  const pet = data.pet;
  if (!pet?.id || !pet.displayName || !pet.spritesheetUrl) {
    return NextResponse.json({ error: "Codex Pets response did not include a valid pet and spritesheet." }, { status: 502 });
  }

  const spritesheetUrl = new URL(pet.spritesheetUrl);
  if (spritesheetUrl.hostname !== "codex-pets.net" || !spritesheetUrl.pathname.endsWith("/spritesheet.webp")) {
    return NextResponse.json({ error: "Codex Pets response included an unsupported spritesheet URL." }, { status: 502 });
  }

  return NextResponse.json({
    pet: {
      id: pet.id,
      name: pet.displayName,
      description: pet.description ?? "",
      manifest: {
        id: pet.id,
        displayName: pet.displayName,
        name: pet.displayName,
        description: pet.description ?? "",
        spritesheetPath: "spritesheet.webp",
        sourceUrl: `https://codex-pets.net/#/pets/${pet.id}`
      },
      spritesheetProxyUrl: `/api/codex-pets/spritesheet?url=${encodeURIComponent(pet.spritesheetUrl)}`,
      validationReport: pet.validationReport
    }
  });
}

function parseCodexPetSlug(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.hostname !== "codex-pets.net") return null;

    const hashMatch = url.hash.match(/^#\/pets\/([a-z0-9-]+)$/i);
    if (hashMatch) return hashMatch[1].toLowerCase();

    const pathMatch = url.pathname.match(/^\/pets\/([a-z0-9-]+)$/i);
    if (pathMatch) return pathMatch[1].toLowerCase();
  } catch {
    const slugMatch = value.match(/^[a-z0-9-]+$/i);
    if (slugMatch) return value.toLowerCase();
  }

  return null;
}
