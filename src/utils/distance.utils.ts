type Coordinates = {
  latitude: number;
  longitude: number;
};

export const calculateHaversineDistance = (
  origin: Coordinates,
  destination: Coordinates,
): number => {
  const earthRadiusKm = 6371;
  const toRadians = (value: number): number => (value * Math.PI) / 180;

  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(destination.latitude)) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const applyBarberRounding = (value: number): number => {
  return Math.floor(value + 0.5);
};
