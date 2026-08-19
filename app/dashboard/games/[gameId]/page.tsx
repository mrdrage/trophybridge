import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createPsnAuthRepository } from "@/lib/psn/runtime";
import { createTrophyRepository } from "@/lib/trophies/runtime";

import { TrophySyncButton } from "./trophy-sync-button";

export const dynamic = "force-dynamic";

const gameIdSchema = z.string().uuid();

function formatDate(value: string | null): string {
  if (!value) return "Mai";
  return new Date(value).toLocaleString("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function GameTrophyPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/auth/login");

  const account = await createPsnAuthRepository().getAccountForOwner(user.id);
  if (!account) redirect("/dashboard");

  const { gameId: rawGameId } = await params;
  const parsedGameId = gameIdSchema.safeParse(rawGameId);
  if (!parsedGameId.success) notFound();

  const detail = await createTrophyRepository().getGameDetail(account.id, parsedGameId.data);
  if (!detail) notFound();

  return (
    <main className="shell dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">TrophyBridge · M5</p>
          <h1 className="section-title game-title">{detail.title}</h1>
          <p className="help game-platforms">
            {detail.platforms.join(" · ") || "Piattaforma non disponibile"}
          </p>
        </div>
        <Link className="button" href="/dashboard">Libreria</Link>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Sincronizzazione trofei</p>
            <h2>Stato del gioco</h2>
          </div>
          <span className={`badge ${detail.lastTrophySyncAt ? "good" : "muted"}`}>
            {detail.lastTrophySyncAt ? "Sincronizzato" : "Da importare"}
          </span>
        </div>

        <div className="trophy-summary-grid">
          <div className="trophy-summary-card">
            <span>Base game</span>
            <strong>{detail.base.earnedCount}/{detail.base.totalCount}</strong>
            <small>
              Platino {detail.base.platinumEarned}/{detail.base.platinumTotal}
            </small>
          </div>
          <div className="trophy-summary-card">
            <span>Aggiuntivi</span>
            <strong>{detail.additional.earnedCount}/{detail.additional.totalCount}</strong>
            <small>Esclusi dal percorso platino</small>
          </div>
          <div className="trophy-summary-card">
            <span>Ultimo sync M5</span>
            <strong className="summary-date">{formatDate(detail.lastTrophySyncAt)}</strong>
            <small>Solo su richiesta</small>
          </div>
        </div>

        <div className="actions trophy-sync-actions">
          <TrophySyncButton gameId={detail.gameId} />
        </div>

        <p className="help">
          Il sync M5 è limitato a questo singolo gioco. Non idrata automaticamente i trofei
          degli altri titoli della libreria.
        </p>
      </section>

      <section className="panel trophy-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Trofei</p>
            <h2>Base e gruppi aggiuntivi</h2>
          </div>
          <span className={`badge ${detail.trophies.length > 0 ? "good" : "muted"}`}>
            {detail.trophies.length}
          </span>
        </div>

        {detail.trophies.length === 0 ? (
          <p className="notice">
            I dettagli non sono ancora stati importati. Premi “Sincronizza trofei”.
          </p>
        ) : (
          <div className="trophy-list">
            {detail.trophies.map((trophy) => (
              <article className="trophy-row" key={trophy.id}>
                <div className={`trophy-state ${trophy.earned ? "earned" : "missing"}`}>
                  {trophy.earned ? "✓" : "○"}
                </div>
                <div className="trophy-copy">
                  <div className="trophy-heading-line">
                    <strong>{trophy.name ?? (trophy.hidden ? "Trofeo nascosto" : `Trofeo #${trophy.psnTrophyId}`)}</strong>
                    <span className="trophy-type">{trophy.type}</span>
                  </div>
                  {trophy.description && <p>{trophy.description}</p>}
                  <small>
                    {trophy.groupKind === "base" ? "Base game" : `Gruppo ${trophy.groupId}`}
                    {trophy.earnedRate != null ? ` · ${trophy.earnedRate}% giocatori` : ""}
                    {trophy.earnedAt ? ` · ottenuto ${formatDate(trophy.earnedAt)}` : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
