import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createPsnAuthRepository } from "@/lib/psn/runtime";

import { signOut } from "./actions";
import { PsnConnectionPanel } from "./psn-connection-panel";

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

  return (
    <main className="shell dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">TrophyBridge · M3</p>
          <h1 className="section-title">Connessioni</h1>
        </div>
        <form action={signOut}>
          <button className="button" type="submit">Esci</button>
        </form>
      </header>

      <PsnConnectionPanel initialAccount={safeAccount} />
    </main>
  );
}
