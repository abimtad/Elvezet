/** Commit the replacement before removing anything the profile still references. */
export async function replaceStaffAvatar(
  write: () => Promise<string>,
  commit: (path: string) => Promise<string | undefined>,
  remove: (path: string) => Promise<void>,
): Promise<string> {
  const imagePath = await write();
  let previous: string | undefined;
  try {
    previous = await commit(imagePath);
  } catch (error) {
    await remove(imagePath).catch(() => undefined);
    throw error;
  }
  // Cleanup failure must not turn a successfully committed upload into an error.
  if (previous?.startsWith('/uploads/avatars/') && previous !== imagePath) {
    await remove(previous).catch(() => undefined);
  }
  return imagePath;
}
