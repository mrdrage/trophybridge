import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createLibraryRepository } from "@/lib/library/runtime";
import { createPsnAuthRepository } from "@/lib/psn/runtime";
import { createShareService } from "@/lib/sharing/runtime";

import { signOut } from "./actions";
import { LibraryPanel } from "./library-panel";
import { PsnConnectionPanel } from "./psn-connection-panel";
import { SharePanel } from "./share-panel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/auth/login");

  const account = await createPsnAuthRepository().getAccountForOwner(user.id);
  const safeAccount = account
    ? {
        onlineId: account.psnOnlineId,
        authStatus: account.authStatus,
        preferredLocale: account.preferredLocale,
      }
    : null;

  const overview = account
    ? await createLibraryRepository().getOverview(account.id, 12)
    : { totalCount: 0, games: [] };
  const shareStatus = account
    ? await createShareService().getOwnerStatus(user.id)
    : { active: false, createdAt: null, lastUsedAt: null };

  return (
    <main className="shell dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">TrophyBridge · M8</p>
          <h1 className="section-title">PlayStation</h1>
        </div>
        <form action={signOut}>
          <button className="button" type="submit">Esci</button>
        </form>
      </header>

      <PsnConnectionPanel initialAccount={safeAccount} />
      <SharePanel
        initialStatus={shareStatus}
        connected={account?.authStatus === "connected"}
      />
      <LibraryPanel
        initialOverview={overview}
        connected={account?.authStatus === "connected"}
      />
    </main>
  );
}
