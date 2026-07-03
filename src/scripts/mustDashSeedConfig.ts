export const SHOP_NAME = "Must Dash";

const parseSeedNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const MUSTDASH_LOCATION = {
  longitude: parseSeedNumber(process.env.MUSTDASH_LONGITUDE, 38.7578),
  latitude: parseSeedNumber(process.env.MUSTDASH_LATITUDE, 8.9806),
  addressString:
    process.env.MUSTDASH_ADDRESS?.trim() || "Bole Road, Addis Ababa, Ethiopia",
};

export const mustDashCoordinates = (): [number, number] => [
  MUSTDASH_LOCATION.longitude,
  MUSTDASH_LOCATION.latitude,
];

export const mustDashGeoPoint = () => ({
  type: "Point" as const,
  coordinates: mustDashCoordinates(),
});
