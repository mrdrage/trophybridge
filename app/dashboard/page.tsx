import Link from "next/link";
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

function connectionLabel(status: string | undefined): string {
  if (status === "connected") return "Connesso";
  if (status === "refreshing") return "Aggiornamento";
  if (status === "reauth_required") return "Da ricollegare";
  if (status === "error") return "Da controllare";
  return "Non collegato";
}

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
  const latestGame = overview.games[0] ?? null;
  const connected = account?.authStatus === "connected";

  return (
    <main className="shell dashboard-shell dashboard-wide">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">TrophyBridge · M9</p>
          <h1 className="section-title">Il tuo hub trofei</h1>
          <p className="dashboard-subtitle">
            Stato PlayStation, libreria e ponte AI in un&apos;unica schermata. Il JSON resta
            l&apos;interfaccia delle API, non quella che devi usare tu.
          </p>
        </div>
        <div className="header-actions">
          <Link className="button" href="/dashboard/library">Libreria</Link>
          <form action={signOut}>
            <button className="button" type="submit">Esci</button>
          </form>
        </div>
      </header>

      <section className="metric-grid" aria-label="Riepilogo TrophyBridge">
        <article className="metric-card">
          <span>PlayStation</span>
          <strong>{account?.psnOnlineId ?? "—"}</strong>
          <small className={connected ? "metric-good" : "metric-muted"}>
            {connectionLabel(account?.authStatus)}
          </small>
        </article>
        <article className="metric-card">
          <span>Libreria</span>
          <strong>{overview.totalCount}</strong>
          <small>giochi conosciuti</small>
        </article>
        <article className="metric-card">
          <span>Ponte AI</span>
          <strong>{shareStatus.active ? "Attivo" : "Off"}</strong>
          <small>{shareStatus.active ? "read-only e revocabile" : "genera un link quando vuoi"}</small>
        </article>
        <article className="metric-card">
          <span>Ultima attività PSN</span>
          <strong className="metric-game-title">{latestGame?.title ?? "—"}</strong>
          <small>{latestGame?.progressPercent == null ? "nessun dato" : `${latestGame.progressPercent}% complessivo`}</small>
        </article>
      </section>

      {latestGame && (
        <section className="continue-card">
          <div>
            <p className="eyebrow">Continua da qui</p>
            <h2>{latestGame.title}</h2>
            <p className="help">
              {latestGame.platforms.join(" · ") || "PlayStation"} · {latestGame.progressPercent ?? 0}%
              nella libreria PSN
            </p>
          </div>
          <Link className="button primary" href={`/dashboard/games/${latestGame.id}`}>
            Apri trofei
          </Link>
        </section>
      )}

      <div className="dashboard-two-column">
        <PsnConnectionPanel initialAccount={safeAccount} />
        <SharePanel initialStatus={shareStatus} connected={connected} />
      </div>

      <LibraryPanel initialOverview={overview} connected={connected} />
    </main>
  );
}
