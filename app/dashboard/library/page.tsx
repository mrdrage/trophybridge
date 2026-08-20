import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createLibraryRepository } from "@/lib/library/runtime";
import { createPsnAuthRepository } from "@/lib/psn/runtime";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/auth/login");

  const account = await createPsnAuthRepository().getAccountForOwner(user.id);
  if (!account) redirect("/dashboard");

  const { q } = await searchParams;
  const query = q?.trim().toLocaleLowerCase("it-IT") ?? "";
  const overview = await createLibraryRepository().getOverview(account.id, 250);
  const games = query
    ? overview.games.filter((game) =>
        `${game.title} ${game.platforms.join(" ")}`.toLocaleLowerCase("it-IT").includes(query),
      )
    : overview.games;

  return (
    <main className="shell dashboard-shell dashboard-wide">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">M9 · Libreria</p>
          <h1 className="section-title">I tuoi giochi</h1>
          <p className="dashboard-subtitle">
            {overview.totalCount} titoli conosciuti da TrophyBridge, ordinati per attività PSN recente.
          </p>
        </div>
        <Link className="button" href="/dashboard">Dashboard</Link>
      </header>

      <section className="panel library-search-panel">
        <form className="library-search-form" method="get">
          <label className="field">
            <span>Cerca nella libreria</span>
            <input
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Es. Final Fantasy, Apex, PS5…"
              autoComplete="off"
            />
          </label>
          <button className="button primary" type="submit">Cerca</button>
          {query && <Link className="button" href="/dashboard/library">Azzera</Link>}
        </form>
      </section>

      <section className="game-card-grid" aria-label="Libreria PlayStation">
        {games.map((game) => {
          const progress = game.progressPercent ?? 0;
          return (
            <article className="game-card" key={game.id}>
              <div className="game-card-topline">
                <span>{game.platforms.join(" · ") || "PlayStation"}</span>
                <strong>{game.progressPercent == null ? "—" : `${game.progressPercent}%`}</strong>
              </div>
              <h2>{game.title}</h2>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
              </div>
              <div className="game-card-meta">
                <span>
                  Trofei {game.earnedBronze + game.earnedSilver + game.earnedGold + game.earnedPlatinum}
                  /{game.totalBronze + game.totalSilver + game.totalGold + game.totalPlatinum}
                </span>
                <span>{game.earnedPlatinum > 0 ? "Platino ottenuto" : "Platino da conquistare"}</span>
              </div>
              <Link className="button compact-button" href={`/dashboard/games/${game.id}`}>
                Apri trofei
              </Link>
            </article>
          );
        })}
      </section>

      {games.length === 0 && (
        <section className="panel empty-state">
          <h2>Nessun risultato</h2>
          <p className="help">Prova con un titolo o una piattaforma diversa.</p>
        </section>
      )}
    </main>
  );
}
