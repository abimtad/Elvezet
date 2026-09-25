import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { adminAuthOptions } from "@/lib/auth-options";
import {
  fetchBackendProfile,
  isAdministratorRole,
  ownerLandingPath,
} from "@/lib/adminAuth";
import AdminShell from "./AdminShell";

/**
 * Server-side gate for every protected /admin/* page.
 * Roles come from the backend user record — never from the browser.
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(adminAuthOptions);
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  const devUserId = (session as { devUserId?: string } | null)?.devUserId;

  if (!session || !accessToken) {
    redirect("/admin/signin");
  }

  const { user, status } = await fetchBackendProfile({
    accessToken,
    devUserId,
  });

  if (!user) {
    if (status === 401 || status === 0) {
      redirect("/admin/signin?reason=session");
    }
    redirect("/admin/signin?reason=forbidden");
  }

  if (!isAdministratorRole(user.roles)) {
    redirect(ownerLandingPath(user.roles));
  }

  const identityLabel =
    user.email || user.fullName || user.firebaseUid || "Administrator";

  return <AdminShell identityLabel={identityLabel}>{children}</AdminShell>;
}
