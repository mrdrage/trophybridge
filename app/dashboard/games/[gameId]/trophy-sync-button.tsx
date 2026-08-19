"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { GameSyncSummary } from "@/lib/trophies/types";

export function TrophySyncButton({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncTrophies() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/private/v1/games/${gameId}/sync`, {
        method: "POST",
        cache: "no-store",
      });
      const data = (await response.json()) as {
        summary?: GameSyncSummary;
        error?: { message?: string; retryAfterSeconds?: number | null };
      };

      if (!response.ok) {
        let text = data.error?.message ?? "Sincronizzazione dei trofei non riuscita.";
        if (data.error?.retryAfterSeconds) {
          const minutes = Math.max(1, Math.ceil(data.error.retryAfterSeconds / 60));
          text += ` Riprova tra circa ${minutes} min.`;
        }
        throw new Error(text);
      }

      if (data.summary) {
        const discovered = data.summary.newTrophiesFound;
        const delta =
          discovered === 0
            ? " Nessun nuovo trofeo rilevato."
            : discovered === 1
              ? " Rilevato 1 nuovo trofeo."
              : ` Rilevati ${discovered} nuovi trofei.`;
        setMessage(
          `Trofei aggiornati: ${data.summary.earnedCount}/${data.summary.processedCount} ottenuti.${delta}`,
        );
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sincronizzazione dei trofei non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button primary" type="button" onClick={syncTrophies} disabled={busy}>
        {busy ? "Sincronizzazione…" : "Sincronizza trofei"}
      </button>
      {message && <p className="notice" role="status">{message}</p>}
    </>
  );
}
