import sharp from "sharp";
import { CODEX_PET_ATLAS } from "./atlas";

export const PET_THUMBNAIL_WIDTH = 128;
export const PET_THUMBNAIL_HEIGHT = 139;

export async function createPetThumbnail(spritesheetBytes: ArrayBuffer | Buffer) {
  const input = Buffer.isBuffer(spritesheetBytes) ? spritesheetBytes : Buffer.from(spritesheetBytes);
  const image = sharp(input, { animated: false });
  const metadata = await image.metadata();

  if (metadata.width !== CODEX_PET_ATLAS.width || metadata.height !== CODEX_PET_ATLAS.height) {
    throw new Error(`spritesheet must be ${CODEX_PET_ATLAS.width}x${CODEX_PET_ATLAS.height}.`);
  }

  return image
    .extract({
      left: 0,
      top: CODEX_PET_ATLAS.animations.idle.row * CODEX_PET_ATLAS.cellHeight,
      width: CODEX_PET_ATLAS.cellWidth,
      height: CODEX_PET_ATLAS.cellHeight
    })
    .resize({
      width: PET_THUMBNAIL_WIDTH,
      height: PET_THUMBNAIL_HEIGHT,
      fit: "contain"
    })
    .webp({ quality: 84 })
    .toBuffer();
}
