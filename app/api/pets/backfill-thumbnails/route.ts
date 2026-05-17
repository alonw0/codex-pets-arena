import { NextResponse } from "next/server";
import { createPetThumbnail } from "@/lib/pets/thumbnails";
import { getBearerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ThumbnailBackfillPet = {
  id: string;
  owner_id: string;
  spritesheet_path: string;
  thumbnail_path: string | null;
};

const MAX_BACKFILL_PER_REQUEST = 10;

export async function POST(request: Request) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select("id, owner_id, spritesheet_path, thumbnail_path")
    .eq("owner_id", user.id)
    .is("thumbnail_path", null)
    .limit(MAX_BACKFILL_PER_REQUEST)
    .returns<ThumbnailBackfillPet[]>();

  if (petsError) return NextResponse.json({ error: petsError.message }, { status: 500 });

  const updated: Array<{ id: string; thumbnail_path: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const pet of pets ?? []) {
    const thumbnailPath = pet.spritesheet_path.replace(/spritesheet\.webp$/, "thumbnail.webp");
    try {
      const { data: spriteData, error: downloadError } = await supabase.storage.from("pet-assets").download(pet.spritesheet_path);
      if (downloadError || !spriteData) throw new Error(downloadError?.message ?? "Could not download spritesheet.");

      const thumbnailBytes = await createPetThumbnail(await spriteData.arrayBuffer());
      const { error: uploadError } = await supabase.storage.from("pet-assets").upload(thumbnailPath, thumbnailBytes, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: true
      });
      if (uploadError) throw new Error(uploadError.message);

      const { error: updateError } = await supabase.from("pets").update({ thumbnail_path: thumbnailPath }).eq("id", pet.id).eq("owner_id", user.id);
      if (updateError) throw new Error(updateError.message);

      updated.push({ id: pet.id, thumbnail_path: thumbnailPath });
    } catch (backfillError) {
      failed.push({ id: pet.id, error: backfillError instanceof Error ? backfillError.message : "Thumbnail backfill failed." });
    }
  }

  return NextResponse.json({ updated, failed });
}
