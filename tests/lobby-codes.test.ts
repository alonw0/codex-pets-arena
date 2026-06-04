import { describe, expect, it } from "vitest";
import { LOBBY_CODE_LENGTH, normalizeLobbyCode } from "@/lib/security/lobbyCodes";

describe("lobby codes", () => {
  it("keeps full 8 character lobby codes", () => {
    expect(LOBBY_CODE_LENGTH).toBe(8);
    expect(normalizeLobbyCode("ABCD2345")).toBe("ABCD2345");
  });

  it("normalizes pasted invite codes", () => {
    expect(normalizeLobbyCode(" abcd-2345 ")).toBe("ABCD2345");
  });
});
