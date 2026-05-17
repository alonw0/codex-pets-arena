const LOBBY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LOBBY_CODE_LENGTH = 8;

export function createLobbyCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(LOBBY_CODE_LENGTH));
  return Array.from(bytes, (byte) => LOBBY_ALPHABET[byte % LOBBY_ALPHABET.length]).join("");
}
