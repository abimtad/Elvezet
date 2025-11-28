export const toMinutes = (timeString: string): number => {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
};

export const dayOfWeekFromDate = (date: Date): number =>
  new Date(date).getDay();
