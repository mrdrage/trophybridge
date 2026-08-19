"use client";

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
          <p className="eyebrow">Libreria PlayStation</p>
          <h2>Giochi sincronizzati</h2>
        </div>
        <span className={`badge ${initialOverview.totalCount > 0 ? "good" : "muted"}`}>
          {initialOverview.totalCount}
        </span>
      </div>

      <p className="help">
        M4 importa solo la libreria e i contatori aggregati. I singoli trofei verranno
        caricati in M5. La sincronizzazione è manuale e protetta da un cooldown per
        restare nel budget gratuito.
      </p>

      <div className="actions">
        <button
          className="button primary"
          type="button"
          onClick={syncLibrary}
          disabled={!connected || busy}
        >
          {busy ? "Sincronizzazione…" : "Sincronizza libreria"}
        </button>
      </div>

      {!connected && (
        <p className="notice">Collega prima il tuo account PlayStation.</p>
      )}

      {initialOverview.games.length > 0 && (
        <div className="library-list">
          {initialOverview.games.map((game) => (
            <article className="library-row" key={game.id}>
              <div>
                <strong>{game.title}</strong>
                <span>{game.platforms.join(" · ") || "Piattaforma non disponibile"}</span>
              </div>
              <span>{game.progressPercent == null ? "—" : `${game.progressPercent}%`}</span>
            </article>
          ))}
          {initialOverview.totalCount > initialOverview.games.length && (
            <p className="help">
              Mostrati gli ultimi {initialOverview.games.length} di {initialOverview.totalCount} giochi.
            </p>
          )}
        </div>
      )}

      {message && <p className="notice" role="status">{message}</p>}
    </section>
  );
}
