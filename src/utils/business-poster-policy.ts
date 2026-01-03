import policy from "../config/business-poster-policy.json";

export const businessPosterPolicy = policy;
export const posterShapeMessage = `Poster proportions must be within ${policy.maxDeviationPercent}% of ${policy.referenceWidth} × ${policy.referenceHeight}. Use a wide landscape image with a width-to-height ratio of approximately ${(policy.referenceWidth / policy.referenceHeight * (1 - policy.maxDeviationPercent / 100)).toFixed(2)}:1 to ${(policy.referenceWidth / policy.referenceHeight * (1 + policy.maxDeviationPercent / 100)).toFixed(2)}:1.`;

export function posterShapeAllowed(width: number, height: number): boolean {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return false;
  // Integer comparisons keep exactly +/-25% inclusive on both platforms.
  const actual = width * policy.referenceHeight * 100;
  const reference = height * policy.referenceWidth;
  return actual >= reference * (100 - policy.maxDeviationPercent)
    && actual <= reference * (100 + policy.maxDeviationPercent);
}

export function posterDimensionsError(width: number, height: number): string | null {
  if (!posterShapeAllowed(width, height)) return posterShapeMessage;
  if (width * height > policy.maxPixels) return "Poster images must be 40 megapixels or smaller.";
  return null;
}
