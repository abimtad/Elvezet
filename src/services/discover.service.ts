import ApiError from "../utils/ApiError";
import DiscoverCategory from "../models/DiscoverCategory";
import DiscoverVideo, {
  DISCOVER_CATEGORIES,
  IDiscoverVideo,
} from "../models/DiscoverVideo";

/** Extract YouTube video id from common URL shapes (watch, youtu.be, shorts, embed). */
export const extractYoutubeVideoId = (rawUrl: string): string => {
  const input = String(rawUrl || "").trim();
  if (!input) {
    throw new ApiError(400, "YouTube URL is required");
  }

  // Bare 11-char id
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }

  let url: URL;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    throw new ApiError(400, "Invalid YouTube URL");
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && /^[a-zA-Z0-9_-]{11}/.test(id)) return id.slice(0, 11);
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}/.test(v)) return v.slice(0, 11);

    const parts = url.pathname.split("/").filter(Boolean);
    // /shorts/ID, /embed/ID, /live/ID, /v/ID
    if (
      parts.length >= 2 &&
      ["shorts", "embed", "live", "v"].includes(parts[0])
    ) {
      const id = parts[1];
      if (id && /^[a-zA-Z0-9_-]{11}/.test(id)) return id.slice(0, 11);
    }
  }

  throw new ApiError(
    400,
    "Could not read a YouTube video id. Paste a watch, Shorts, or youtu.be link.",
  );
};

export const youtubeThumbnailUrl = (videoId: string): string =>
  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

const assertCategory = async (category: string): Promise<string> => {
  const trimmed = String(category || "").trim();
  if (!trimmed || trimmed === "All") {
    throw new ApiError(400, "Pick a content category (not All)");
  }
  const allowed = await getDiscoverCategories();
  if (!allowed.includes(trimmed)) {
    throw new ApiError(
      400,
      `Category must be one of: ${allowed.join(", ")}`,
    );
  }
  return trimmed;
};

export type DiscoverVideoInput = {
  title: string;
  creatorName: string;
  category: string;
  youtubeUrl: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
};

const buildFields = async (input: DiscoverVideoInput) => {
  const title = String(input.title || "").trim();
  const creatorName = String(input.creatorName || "").trim();
  if (!title) throw new ApiError(400, "Title is required");
  if (!creatorName) throw new ApiError(400, "Creator name is required");

  const youtubeVideoId = extractYoutubeVideoId(input.youtubeUrl);
  return {
    title,
    creatorName,
    category: await assertCategory(input.category),
    youtubeUrl: String(input.youtubeUrl).trim(),
    youtubeVideoId,
    thumbnailUrl: youtubeThumbnailUrl(youtubeVideoId),
    description: String(input.description || "").trim(),
    sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
    isActive: input.isActive !== false,
  };
};

export const listPublicDiscoverVideos = async (category?: string) => {
  const filter: Record<string, unknown> = { isActive: true };
  const cat = String(category || "").trim();
  if (cat && cat !== "All") {
    filter.category = cat;
  }

  return DiscoverVideo.find(filter)
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
};

export const listAdminDiscoverVideos = async () =>
  DiscoverVideo.find().sort({ sortOrder: 1, createdAt: -1 }).lean();

export const getDiscoverVideoById = async (id: string) => {
  const video = await DiscoverVideo.findById(id).lean();
  if (!video) throw new ApiError(404, "Discover video not found");
  return video;
};

export const createDiscoverVideo = async (
  input: DiscoverVideoInput,
): Promise<IDiscoverVideo> => {
  const fields = await buildFields(input);
  return DiscoverVideo.create(fields);
};

export const updateDiscoverVideo = async (
  id: string,
  input: Partial<DiscoverVideoInput>,
): Promise<IDiscoverVideo> => {
  const existing = await DiscoverVideo.findById(id);
  if (!existing) throw new ApiError(404, "Discover video not found");

  const merged: DiscoverVideoInput = {
    title: input.title ?? existing.title,
    creatorName: input.creatorName ?? existing.creatorName,
    category: input.category ?? existing.category,
    youtubeUrl: input.youtubeUrl ?? existing.youtubeUrl,
    description:
      input.description !== undefined
        ? input.description
        : existing.description,
    sortOrder:
      input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
    isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
  };

  const fields = await buildFields(merged);
  Object.assign(existing, fields);
  await existing.save();
  return existing;
};

export const deleteDiscoverVideo = async (id: string) => {
  const deleted = await DiscoverVideo.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, "Discover video not found");
  return deleted;
};

export const getDiscoverCategories = async (): Promise<string[]> => {
  const [custom, existing] = await Promise.all([
    DiscoverCategory.find().sort({ createdAt: 1 }).lean(),
    DiscoverVideo.distinct("category"),
  ]);
  return [...new Set([...DISCOVER_CATEGORIES, ...custom.map(c => c.name), ...existing])];
};

export const createDiscoverCategory = async (rawName: unknown) => {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name || name.length > 60 || name.toLowerCase() === "all") {
    throw new ApiError(400, "Use a category name between 1 and 60 characters (not All)");
  }
  const existing = await getDiscoverCategories();
  if (existing.some(c => c.toLowerCase() === name.toLowerCase())) {
    throw new ApiError(409, "This category already exists");
  }
  return DiscoverCategory.create({ name });
};

export const deleteDiscoverCategory = async (id: string) => {
  const category = await DiscoverCategory.findById(id);
  if (!category) throw new ApiError(404, "Category not found");
  if (await DiscoverVideo.exists({ category: category.name })) {
    throw new ApiError(409, "Move or delete this category's videos first");
  }
  await category.deleteOne();
  return category;
};
