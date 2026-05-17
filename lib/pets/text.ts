export const PET_NAME_MAX_LENGTH = 64;
export const PET_DESCRIPTION_MAX_LENGTH = 512;
export const PET_PROMPT_DESCRIPTION_MAX_LENGTH = 256;

export function normalizePetName(value: unknown, fallback = "Arena Pet") {
  const raw = typeof value === "string" ? value : fallback;
  const normalized = raw.replace(/\s+/g, " ").trim().slice(0, PET_NAME_MAX_LENGTH);
  return normalized || fallback;
}

export function normalizePetDescription(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, PET_DESCRIPTION_MAX_LENGTH);
}

export function descriptionForMovePrompt(description: string) {
  return description.slice(0, PET_PROMPT_DESCRIPTION_MAX_LENGTH);
}
