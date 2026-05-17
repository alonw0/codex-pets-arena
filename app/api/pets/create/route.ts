import { NextResponse } from "next/server";
import { createBattlePet } from "@/lib/battle/engine";
import { buildPersonalMovePrompt, fallbackPersonalMoves, normalizePersonalMoves } from "@/lib/battle/personalMoves";
import { awardPetUploadBadges } from "@/lib/battle/badges";
import { descriptionForMovePrompt, normalizePetDescription, normalizePetName } from "@/lib/pets/text";
import { createPetThumbnail } from "@/lib/pets/thumbnails";
import { ensureProfile, getBearerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 6 * 1024 * 1024;

export async function POST(request: Request) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const profileError = await ensureProfile(supabase, user);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Request must be multipart form data." }, { status: 400 });

  const manifestFile = formData.get("manifest");
  const spritesheetFile = formData.get("spritesheet");
  if (!(manifestFile instanceof File) || !(spritesheetFile instanceof File)) {
    return NextResponse.json({ error: "manifest and spritesheet files are required." }, { status: 400 });
  }
  if (manifestFile.size > MAX_FILE_BYTES || spritesheetFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Pet files are too large." }, { status: 400 });
  }
  if (spritesheetFile.type && spritesheetFile.type !== "image/webp") {
    return NextResponse.json({ error: "spritesheet must be a WEBP image." }, { status: 400 });
  }

  let manifest: { id?: string; name?: string; displayName?: string; description?: string };
  try {
    manifest = JSON.parse(await manifestFile.text()) as typeof manifest;
  } catch {
    return NextResponse.json({ error: "pet.json must be valid JSON." }, { status: 400 });
  }

  const petId = crypto.randomUUID();
  const name = normalizePetName(manifest.name ?? manifest.displayName ?? manifest.id);
  const description = normalizePetDescription(manifest.description);
  const basePath = `${user.id}/${petId}`;
  const manifestBytes = await manifestFile.arrayBuffer();
  const spritesheetBytes = await spritesheetFile.arrayBuffer();
  let thumbnailBytes: Buffer;
  try {
    thumbnailBytes = await createPetThumbnail(spritesheetBytes);
  } catch (thumbnailError) {
    return NextResponse.json({
      error: thumbnailError instanceof Error ? thumbnailError.message : "Could not create pet thumbnail."
    }, { status: 400 });
  }

  const [manifestUpload, spriteUpload, thumbnailUpload] = await Promise.all([
    supabase.storage.from("pet-assets").upload(`${basePath}/pet.json`, manifestBytes, { contentType: "application/json" }),
    supabase.storage.from("pet-assets").upload(`${basePath}/spritesheet.webp`, spritesheetBytes, { contentType: "image/webp" }),
    supabase.storage.from("pet-assets").upload(`${basePath}/thumbnail.webp`, thumbnailBytes, {
      contentType: "image/webp",
      cacheControl: "31536000"
    })
  ]);

  if (manifestUpload.error || spriteUpload.error || thumbnailUpload.error) {
    return NextResponse.json({
      error: manifestUpload.error?.message ?? spriteUpload.error?.message ?? thumbnailUpload.error?.message ?? "Upload failed."
    }, { status: 500 });
  }

  const battlePet = createBattlePet({ id: petId, ownerId: user.id, name });
  const { error: petError } = await supabase.from("pets").insert({
    id: petId,
    owner_id: user.id,
    name,
    description,
    manifest_path: `${basePath}/pet.json`,
    spritesheet_path: `${basePath}/spritesheet.webp`,
    thumbnail_path: `${basePath}/thumbnail.webp`,
    affinity: battlePet.affinity,
    level: battlePet.level,
    xp: 0,
    stats: battlePet.stats,
    validation_status: "valid"
  });

  if (petError) return NextResponse.json({ error: petError.message }, { status: 500 });

  const generatedMoves = await generateMoves(name, descriptionForMovePrompt(description));
  const { error: movesError } = await supabase.from("moves").insert(
    generatedMoves.map((move, index) => ({
      pet_id: petId,
      slot: index + 1,
      ...move
    }))
  );

  if (movesError) return NextResponse.json({ error: movesError.message }, { status: 500 });

  const badges = await awardPetUploadBadges(supabase, user.id);

  return NextResponse.json({
    pet: {
      id: petId,
      name,
      description,
      affinity: battlePet.affinity,
      level: battlePet.level,
      moves: generatedMoves,
      badges
    }
  });
}

async function generateMoves(name: string, description: string) {
  const input = { name, description };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackPersonalMoves(input);

  try {
    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildPersonalMovePrompt(input)
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.95,
          maxOutputTokens: 800,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) return fallbackPersonalMoves(input);
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const parsed = JSON.parse(text) as { moves?: unknown };
    return normalizePersonalMoves(parsed.moves, input);
  } catch {
    return fallbackPersonalMoves(input);
  }
}
