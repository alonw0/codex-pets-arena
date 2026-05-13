import { CODEX_PET_ATLAS, REQUIRED_ANIMATIONS } from "./atlas";

export type PetManifest = {
  id?: string;
  name?: string;
  displayName?: string;
  description?: string;
  spritesheet?: string;
  spritesheetPath?: string;
  sourceUrl?: string;
  animations?: Record<string, unknown>;
};

export type PetValidationResult = {
  ok: boolean;
  errors: string[];
  manifest?: PetManifest;
};

export async function validatePetFiles(manifestFile: File | null, spritesheetFile: File | null): Promise<PetValidationResult> {
  const errors: string[] = [];
  if (!manifestFile) errors.push("pet.json is required.");
  if (!spritesheetFile) errors.push("spritesheet.webp is required.");
  if (errors.length) return { ok: false, errors };

  let manifest: PetManifest;
  try {
    manifest = JSON.parse(await manifestFile!.text()) as PetManifest;
  } catch {
    return { ok: false, errors: ["pet.json must be valid JSON."] };
  }

  if (!manifest.name && !manifest.displayName && !manifest.id) errors.push("pet.json must include a name, displayName, or id.");

  if (manifest.animations) {
    for (const animation of REQUIRED_ANIMATIONS) {
      if (!(animation in manifest.animations)) errors.push(`pet.json is missing the ${animation} animation.`);
    }
  }

  if (spritesheetFile!.type && spritesheetFile!.type !== "image/webp") {
    errors.push("spritesheet must be a WEBP image.");
  }

  const dimensions = await readImageDimensions(spritesheetFile!);
  if (dimensions.width !== CODEX_PET_ATLAS.width || dimensions.height !== CODEX_PET_ATLAS.height) {
    errors.push(`spritesheet must be ${CODEX_PET_ATLAS.width}x${CODEX_PET_ATLAS.height}px.`);
  }

  return { ok: errors.length === 0, errors, manifest };
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read spritesheet image."));
    };
    image.src = url;
  });
}
