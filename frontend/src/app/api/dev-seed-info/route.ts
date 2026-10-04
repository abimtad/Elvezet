import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export type DevSeedPayload = {
  ownerId: string;
  firebaseUid: string;
  shopId: string | null;
  email?: string;
};

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api/v1";

async function readLocalSeedFile(): Promise<DevSeedPayload | null> {
  try {
    const filePath = path.join(process.cwd(), "public", "dev-seed.json");
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as DevSeedPayload;
    if (parsed?.ownerId || parsed?.firebaseUid) {
      return parsed;
    }
  } catch {
    // no local seed manifest
  }
  return null;
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const response = await fetch(`${API_BASE}/auth/dev-seed-info`, {
      cache: "no-store",
    });

    if (response.ok) {
      const body = await response.json();
      const data = (body?.data ?? body) as DevSeedPayload;
      return NextResponse.json(data);
    }

    const local = await readLocalSeedFile();
    if (local) {
      return NextResponse.json({
        ...local,
        _warning:
          "API returned an error; using dev-seed.json from last seed run.",
      });
    }

    const message =
      response.status === 403
        ? "Backend is not in development mode. Set NODE_ENV=development in the API .env file."
        : response.status === 404
          ? "Seeded owner not found. Run: npm run seed:mustdash"
          : `API error (${response.status})`;

    return NextResponse.json({ error: message }, { status: response.status });
  } catch {
    const local = await readLocalSeedFile();
    if (local) {
      return NextResponse.json({
        ...local,
        _warning:
          "API is not running; using dev-seed.json. Start the API with: npm run dev",
      });
    }

    return NextResponse.json(
      {
        error:
          "Cannot reach the API at localhost:5000. Start MongoDB (docker-compose up -d), run npm run seed:mustdash, then npm run dev in the project root.",
      },
      { status: 503 },
    );
  }
}
