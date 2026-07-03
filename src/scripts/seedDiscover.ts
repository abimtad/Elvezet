/**
 * Seeds a few Discover YouTube videos if the collection is empty.
 * Usage: npx tsx src/scripts/seedDiscover.ts
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import DiscoverVideo from "../models/DiscoverVideo";
import {
  createDiscoverVideo,
  listAdminDiscoverVideos,
} from "../services/discover.service";

dotenv.config();

const SEEDS = [
  {
    title: "Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film",
    creatorName: "Blender",
    category: "Beauty & Style",
    youtubeUrl: "https://www.youtube.com/shorts/aqz-KE-bpKQ",
    description: "Playback test only. Not salon content; hidden from the public feed.",
    isActive: false,
    sortOrder: 1,
  },
  {
    title: "Me at the zoo",
    creatorName: "jawed",
    category: "Beauty & Style",
    youtubeUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    description: "Playback test only. Not salon content; hidden from the public feed.",
    isActive: false,
    sortOrder: 2,
  },
  {
    title: "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
    creatorName: "Rick Astley",
    category: "Beauty & Style",
    youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
    description: "Playback test only. Not salon content; hidden from the public feed.",
    isActive: false,
    sortOrder: 3,
  },
];

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");

  await mongoose.connect(uri);
  const legacyTitles = ["L'Oreal Telescopic Lift mascara tutorial", "Clean fade and shape demo", "Hair care routine basics"];
  for (const [index, seed] of SEEDS.entries()) {
    const id = new URL(seed.youtubeUrl).searchParams.get('v') || seed.youtubeUrl.split('/').pop();
    await DiscoverVideo.updateMany({ youtubeVideoId: id, title: legacyTitles[index] }, { $set: seed });
  }
  const existing = await listAdminDiscoverVideos();
  if (existing.length > 0) {
    console.log(`Discover already has ${existing.length} video(s). Skip seed.`);
    await mongoose.disconnect();
    return;
  }

  for (const seed of SEEDS) {
    try {
      const v = await createDiscoverVideo(seed);
      console.log(`Added: ${v.title} (${v.youtubeVideoId})`);
    } catch (e) {
      console.warn(`Skip seed "${seed.title}":`, e instanceof Error ? e.message : e);
    }
  }

  const count = await DiscoverVideo.countDocuments();
  console.log(`Discover videos in DB: ${count}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
