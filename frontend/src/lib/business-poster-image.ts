// Pure policy shared with the API: browser checks cannot drift from server limits.
export { businessPosterPolicy, posterDimensionsError, posterShapeAllowed } from "../../../src/utils/business-poster-policy";
import { businessPosterPolicy, posterDimensionsError } from "../../../src/utils/business-poster-policy";

export async function inspectPosterFile(file: File): Promise<void> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP image.");
  if (!file.size || file.size > businessPosterPolicy.maxFileBytes) throw new Error("Choose an image under 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new globalThis.Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("This image cannot be read. Choose a valid JPEG, PNG or WebP image."));
      image.src = url;
    });
    const error = posterDimensionsError(dimensions.width, dimensions.height);
    if (error) throw new Error(error);
  } finally { URL.revokeObjectURL(url); }
}
