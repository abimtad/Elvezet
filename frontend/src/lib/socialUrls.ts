export const INSTAGRAM_URL_REGEX =
  /^(https?:\/\/)?(www\.)?instagram\.com(\/[A-Za-z0-9._]+)?(\/)?(\?.*)?$/i;

export const TIKTOK_URL_REGEX =
  /^(https?:\/\/)?(www\.)?(vm\.)?tiktok\.com(\/|$)/i;

export const isInstagramUrl = (value: string): boolean =>
  INSTAGRAM_URL_REGEX.test(value.trim());

export const isTikTokUrl = (value: string): boolean =>
  TIKTOK_URL_REGEX.test(value.trim());

export const normalizeSocialUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export const extractTikTokVideoId = (url: string): string | null => {
  const match = url.match(/\/video\/(\d+)/);
  return match?.[1] ?? null;
};
