import assert from "node:assert/strict";
import { inspectPosterFile, businessPosterPolicy as policy, posterShapeAllowed } from "./business-poster-image";

async function main() {
  assert.equal(policy.maxDeviationPercent, 25);
  for (const [width, accepted] of [[policy.referenceWidth * 3, true], [policy.referenceWidth * 3 - 1, false], [policy.referenceWidth * 5, true], [policy.referenceWidth * 5 + 1, false]] as const) {
    assert.equal(posterShapeAllowed(width, policy.referenceHeight * 4), accepted);
  }
  let width = 1774, height = 637, unreadable = false, created = 0, revoked = 0;
  const originalImage = globalThis.Image;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  class DecodedImage {
    naturalWidth = width; naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => unreadable ? this.onerror?.() : this.onload?.()); }
  }
  globalThis.Image = DecodedImage as unknown as typeof Image;
  URL.createObjectURL = (blob) => { created++; return originalCreate(blob); };
  URL.revokeObjectURL = (url) => { revoked++; originalRevoke(url); };
  const file = (type = "image/png", size = 10) => new File([new Uint8Array(size)], "poster.png", { type });
  try {
    await inspectPosterFile(file());
    width = 200; height = 100;
    await assert.rejects(inspectPosterFile(file()), /25%/);
    width = 400;
    await assert.rejects(inspectPosterFile(file()), /25%/);
    width = 3548; height = 1274;
    await inspectPosterFile(file());
    await assert.rejects(inspectPosterFile(file("image/svg+xml")), /JPEG/);
    await assert.rejects(inspectPosterFile(file("image/png", policy.maxFileBytes + 1)), /5 MB/);
    unreadable = true;
    await assert.rejects(inspectPosterFile(file()), /cannot be read/);
    assert.equal(created, revoked, "Every temporary image URL is released, even on rejection");
    console.log("Admin image validation PASS: shared 25% boundary, resolution independence, decoding, size/type limits, rejection and URL cleanup");
  } finally {
    globalThis.Image = originalImage;
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
