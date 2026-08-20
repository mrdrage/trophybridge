"use client";

import { useState } from "react";

import type { OwnerShareStatus } from "@/lib/sharing/types";

export function SharePanel({
  connected,
  initialStatus,
}: {
  connected: boolean;
  initialStatus: OwnerShareStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function rotate() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/private/v1/share", {
        method: "POST",
        cache: "no-store",
      });
      const data = (await response.json()) as {
        share?: OwnerShareStatus & { token?: string };
        error?: { message?: string };
      };
      if (!response.ok || !data.share?.token) {
        throw new Error(data.error?.message ?? "Impossibile generare il link pubblico.");
      }

      const nextStatus: OwnerShareStatus = {
        active: data.share.active,
        createdAt: data.share.createdAt,
        lastUsedAt: data.share.lastUsedAt,
      };
      setStatus(nextStatus);
      setShareUrl(`${window.location.origin}/api/public/v1/share/${data.share.token}`);
      setMessage("Nuovo link creato. Copialo ora: TrophyBridge conserva solo il suo hash.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossibile generare il link pubblico.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/private/v1/share", {
        method: "DELETE",
        cache: "no-store",
      });
      const data = (await response.json()) as {
        share?: OwnerShareStatus;
        error?: { message?: string };
      };
      if (!response.ok || !data.share) {
        throw new Error(data.error?.message ?? "Impossibile revocare il link pubblico.");
      }
      setStatus(data.share);
      setShareUrl(null);
      setMessage("Link pubblico revocato. Le vecchie URL non sono più utilizzabili.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossibile revocare il link pubblico.");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setMessage("Link copiato negli appunti.");
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">M7 · Public Share</p>
          <h2>Link pubblico per AI</h2>
        </div>
        <span className={`badge ${status.active ? "good" : "muted"}`}>
          {status.active ? "Attivo" : "Non attivo"}
        </span>
      </div>

      <p className="help">
        Il link è una capability read-only: chi lo possiede può leggere i giochi visibili e i
        trofei già sincronizzati. I giochi nascosti vengono esclusi e i trofei segreti non
        ottenuti sono mascherati.
      </p>

      {status.active && !shareUrl && (
        <div className="connection-meta">
          <strong>Link attivo</strong>
          <span>
            Il token non è memorizzato in chiaro. Se non hai più l’URL, rigenerala: quella
            precedente verrà revocata automaticamente.
          </span>
        </div>
      )}

      {shareUrl && (
        <div className="connection-meta share-url-box">
          <strong>URL pubblico</strong>
          <code style={{ overflowWrap: "anywhere" }}>{shareUrl}</code>
        </div>
      )}

      <div className="actions">
        <button
          className="button primary"
          type="button"
          onClick={rotate}
          disabled={!connected || busy}
        >
          {busy ? "Operazione…" : status.active ? "Rigenera link" : "Genera link"}
        </button>
        {shareUrl && (
          <button className="button" type="button" onClick={copyUrl} disabled={busy}>
            Copia link
          </button>
        )}
        {status.active && (
          <button className="button danger" type="button" onClick={revoke} disabled={busy}>
            Revoca
          </button>
        )}
      </div>

      {!connected && <p className="notice">Collega prima un account PlayStation.</p>}
      {message && <p className="notice" role="status">{message}</p>}
    </section>
  );
}
