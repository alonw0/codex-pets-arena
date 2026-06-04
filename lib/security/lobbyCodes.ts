const LOBBY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LOBBY_CODE_LENGTH = 8;

export function normalizeLobbyCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, LOBBY_CODE_LENGTH);
}

export function createLobbyCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(LOBBY_CODE_LENGTH));
  return Array.from(bytes, (byte) => LOBBY_ALPHABET[byte % LOBBY_ALPHABET.length]).join("");
}
