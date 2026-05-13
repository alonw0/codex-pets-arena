"use client";

import { useEffect, useMemo, useState } from "react";
import { CODEX_PET_ATLAS, type CodexPetAnimation } from "@/lib/pets/atlas";

type PetSpriteProps = {
  src?: string;
  name: string;
  animation?: CodexPetAnimation;
  scale?: number;
  facing?: "left" | "right";
  className?: string;
};

export function PetSprite({ src, name, animation = "idle", scale = 1, facing = "right", className }: PetSpriteProps) {
  const [frame, setFrame] = useState(0);
  const spec = CODEX_PET_ATLAS.animations[animation];
  const hasCodexSheet = src?.endsWith(".webp");

  useEffect(() => {
    setFrame(0);
    let current = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const duration = spec.frameDurations[current] ?? 160;
      timer = setTimeout(() => {
        current = (current + 1) % spec.frames;
        setFrame(current);
        tick();
      }, duration);
    };

    tick();
    return () => clearTimeout(timer);
  }, [animation, spec]);

  const style = useMemo(() => {
    const width = CODEX_PET_ATLAS.cellWidth * scale;
    const height = CODEX_PET_ATLAS.cellHeight * scale;
    if (!hasCodexSheet) return { width, height };
    return {
      width,
      height,
      backgroundImage: `url(${src})`,
      backgroundSize: `${CODEX_PET_ATLAS.width * scale}px ${CODEX_PET_ATLAS.height * scale}px`,
      backgroundPosition: `-${frame * CODEX_PET_ATLAS.cellWidth * scale}px -${spec.row * CODEX_PET_ATLAS.cellHeight * scale}px`
    };
  }, [frame, hasCodexSheet, scale, spec.row, src]);

  if (!hasCodexSheet) {
    return (
      <div
        aria-label={name}
        className={`pet-sprite pet-sprite-fallback ${className ?? ""}`}
        role="img"
        style={{
          ...style,
          backgroundImage: `url(${src ?? "/demo-pet.svg"})`,
          transform: facing === "left" ? "scaleX(-1)" : undefined
        }}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`pet-sprite ${className ?? ""}`}
      role="img"
      style={{ ...style, transform: facing === "left" ? "scaleX(-1)" : undefined }}
    />
  );
}
