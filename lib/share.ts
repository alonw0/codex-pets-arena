export type SharePlatform = "x" | "whatsapp" | "facebook" | "linkedin";

export type SharePayload = {
  title: string;
  text: string;
  url?: string;
};

export function getPublicSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function getClientShareUrl(path = "/") {
  if (typeof window !== "undefined") return new URL(path, window.location.origin).toString();
  return new URL(path, getPublicSiteUrl()).toString();
}

export function buildShareLink(platform: SharePlatform, payload: SharePayload) {
  const url = payload.url ?? getClientShareUrl("/");
  const text = `${payload.text} ${url}`;

  if (platform === "x") {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.text)}&url=${encodeURIComponent(url)}`;
  }

  if (platform === "whatsapp") {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  if (platform === "facebook") {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  }

  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

export async function nativeShareOrCopy(payload: SharePayload) {
  const url = payload.url ?? getClientShareUrl("/");
  const text = `${payload.text} ${url}`;
  const nav = typeof navigator !== "undefined"
    ? navigator as Navigator & { share?: (data: ShareData) => Promise<void>; clipboard?: Clipboard }
    : null;
  if (nav?.share) {
    await nav.share({ title: payload.title, text: payload.text, url });
    return "shared";
  }
  await nav?.clipboard?.writeText(text);
  return "copied";
}
