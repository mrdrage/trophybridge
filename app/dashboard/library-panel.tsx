"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { LibraryOverview, LibrarySyncSummary } from "@/lib/library/types";

export function LibraryPanel({
  initialOverview,
  connected,
}: {
  initialOverview: LibraryOverview;
  connected: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncLibrary() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/private/v1/library/sync", {
        method: "POST",
        cache: "no-store",
      });
      const data = (await response.json()) as {
        summary?: LibrarySyncSummary;
        error?: { message?: string; retryAfterSeconds?: number | null };
      };

      if (!response.ok) {
        let text = data.error?.message ?? "Sincronizzazione non riuscita.";
        if (data.error?.retryAfterSeconds) {
          const minutes = Math.max(1, Math.ceil(data.error.retryAfterSeconds / 60));
          text += ` Riprova tra circa ${minutes} min.`;
        }
        throw new Error(text);
      }

      const summary = data.summary;
      if (summary) {
        setMessage(
          `Libreria aggiornata: ${summary.processedCount} giochi, ${summary.discoveredCount} nuovi.`,
        );
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sincronizzazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Attività recente</p>
          <h2>Ultimi giochi PlayStation</h2>
        </div>
        <span className={`badge ${initialOverview.totalCount > 0 ? "good" : "muted"}`}>
          {initialOverview.totalCount}
        </span>
      </div>

      <p className="help">
        Il normale aggiornamento dei trofei non richiede più questo pannello: M8 permette
        all&apos;AI di chiedere automaticamente uno stato fresco del singolo gioco. Il pulsante
        libreria resta come controllo manuale per scoprire subito nuovi titoli.
      </p>

      <div className="actions">
        <Link className="button primary" href="/dashboard/library">Apri tutta la libreria</Link>
        <button
          className="button"
          type="button"
          onClick={syncLibrary}
          disabled={!connected || busy}
        >
          {busy ? "Aggiornamento…" : "Aggiorna libreria"}
        </button>
      </div>

      {!connected && <p className="notice">Collega prima il tuo account PlayStation.</p>}

      {initialOverview.games.length > 0 && (
        <div className="library-list">
          {initialOverview.games.map((game) => (
            <article className="library-row" key={game.id}>
              <div>
                <strong>{game.title}</strong>
                <span>{game.platforms.join(" · ") || "Piattaforma non disponibile"}</span>
              </div>
              <div className="library-row-actions">
                <span className="library-progress">
                  {game.progressPercent == null ? "—" : `${game.progressPercent}%`}
                </span>
                <Link className="button compact-button" href={`/dashboard/games/${game.id}`}>
                  Trofei
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {message && <p className="notice" role="status">{message}</p>}
    </section>
  );
}
