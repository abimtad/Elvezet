/**
 * Root admin segment layout — no chrome.
 * Protected console chrome lives under admin/(protected).
 * /admin/signin stays outside that group to avoid redirect loops.
 */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
