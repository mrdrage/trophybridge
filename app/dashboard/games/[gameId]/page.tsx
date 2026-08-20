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

function completion(earned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((earned / total) * 100);
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

  const baseCompletion = completion(detail.base.earnedCount, detail.base.totalCount);

  return (
    <main className="shell dashboard-shell dashboard-wide">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">M9 · Dettaglio gioco</p>
          <h1 className="section-title game-title">{detail.title}</h1>
          <p className="dashboard-subtitle">
            {detail.platforms.join(" · ") || "Piattaforma non disponibile"}
          </p>
        </div>
        <div className="header-actions">
          <Link className="button" href="/dashboard/library">Libreria</Link>
          <Link className="button" href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <section className="panel platinum-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Percorso al Platino</p>
            <h2>{baseCompletion}% del base game</h2>
          </div>
          <span className={`badge ${detail.base.platinumEarned > 0 ? "good" : "muted"}`}>
            {detail.base.platinumEarned > 0 ? "Platino ottenuto" : "In corso"}
          </span>
        </div>

        <div className="progress-track large-progress" aria-hidden="true">
          <span style={{ width: `${baseCompletion}%` }} />
        </div>

        <div className="trophy-summary-grid">
          <div className="trophy-summary-card">
            <span>Base game</span>
            <strong>{detail.base.earnedCount}/{detail.base.totalCount}</strong>
            <small>Conta per il percorso principale</small>
          </div>
          <div className="trophy-summary-card">
            <span>Aggiuntivi</span>
            <strong>{detail.additional.earnedCount}/{detail.additional.totalCount}</strong>
            <small>Separati dal Platino</small>
          </div>
          <div className="trophy-summary-card">
            <span>Ultimo dato PSN</span>
            <strong className="summary-date">{formatDate(detail.lastTrophySyncAt)}</strong>
            <small>M8 può aggiornarlo per l&apos;AI</small>
          </div>
        </div>

        <div className="optional-sync-row">
          <div>
            <strong>Aggiornamento automatico attivo</strong>
            <p className="help">
              Durante l&apos;uso con ChatGPT, <code>ai-context?fresh=1</code> aggiorna questo gioco
              quando serve. Il pulsante qui sotto resta solo come controllo manuale.
            </p>
          </div>
          <div className="actions trophy-sync-actions">
            <TrophySyncButton gameId={detail.gameId} />
          </div>
        </div>
      </section>

      <section className="panel trophy-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Attività recente</p>
            <h2>Trofei rilevati da TrophyBridge</h2>
          </div>
          <span className={`badge ${detail.recentEvents.length > 0 ? "good" : "muted"}`}>
            {detail.recentEvents.length}
          </span>
        </div>

        {detail.recentEvents.length === 0 ? (
          <p className="notice">Nessun nuovo trofeo rilevato dopo la baseline.</p>
        ) : (
          <div className="trophy-list">
            {detail.recentEvents.map((event) => (
              <article className="trophy-row" key={event.id}>
                <div className="trophy-state earned">✓</div>
                <div className="trophy-copy">
                  <div className="trophy-heading-line">
                    <strong>{event.trophyName ?? `Trofeo #${event.psnTrophyId}`}</strong>
                    <span className="trophy-type">
                      {event.eventType === "platinum_earned" ? "platino" : event.trophyType}
                    </span>
                  </div>
                  <small>
                    {event.groupKind === "base" ? "Base game" : `Gruppo ${event.groupId}`}
                    {` · ottenuto ${formatDate(event.occurredAt)}`}
                    {` · rilevato ${formatDate(event.detectedAt)}`}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel trophy-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Lista trofei</p>
            <h2>Base game e contenuti aggiuntivi</h2>
          </div>
          <span className={`badge ${detail.trophies.length > 0 ? "good" : "muted"}`}>
            {detail.trophies.length}
          </span>
        </div>

        {detail.trophies.length === 0 ? (
          <p className="notice">I dettagli del gioco non sono ancora stati importati.</p>
        ) : (
          <div className="trophy-list">
            {detail.trophies.map((trophy) => (
              <article className="trophy-row" key={trophy.id}>
                <div className={`trophy-state ${trophy.earned ? "earned" : "missing"}`}>
                  {trophy.earned ? "✓" : "○"}
                </div>
                <div className="trophy-copy">
                  <div className="trophy-heading-line">
                    <strong>
                      {trophy.name ??
                        (trophy.hidden ? "Trofeo nascosto" : `Trofeo #${trophy.psnTrophyId}`)}
                    </strong>
                    <span className="trophy-type">{trophy.type}</span>
                  </div>
                  {trophy.description && <p>{trophy.description}</p>}
                  <small>
                    {trophy.groupKind === "base" ? "Base game" : `Gruppo ${trophy.groupId}`}
                    {trophy.earnedRate != null ? ` · ${trophy.earnedRate}% giocatori PSN` : ""}
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
