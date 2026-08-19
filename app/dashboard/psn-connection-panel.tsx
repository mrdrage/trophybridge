"use client";

import { useState } from "react";

interface SafeAccount {
  onlineId: string;
  authStatus: string;
  preferredLocale: string;
}

export function PsnConnectionPanel({ initialAccount }: { initialAccount: SafeAccount | null }) {
  const [account, setAccount] = useState(initialAccount);
  const [onlineId, setOnlineId] = useState(initialAccount?.onlineId ?? "");
  const [npsso, setNpsso] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function request(path: string, body?: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const data = (await response.json()) as {
        account?: SafeAccount;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(data.error?.message ?? "Operazione non riuscita.");
      if (data.account) setAccount(data.account);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operazione non riuscita.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await request("/api/private/v1/psn/connect", { onlineId, npsso });
    if (ok) {
      setNpsso("");
      setMessage("Account PlayStation verificato e collegato in sicurezza.");
    }
  }

  async function refresh() {
    const ok = await request("/api/private/v1/psn/refresh");
    if (ok) setMessage("Autorizzazione PlayStation aggiornata.");
  }

  async function disconnect() {
    const ok = await request("/api/private/v1/psn/disconnect");
    if (ok) setMessage("Credenziale PlayStation rimossa. I dati trofei già importati restano intatti.");
  }

  const connected = account?.authStatus === "connected";

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PlayStation Network</p>
          <h2>Connessione PSN</h2>
        </div>
        <span className={`badge ${connected ? "good" : "muted"}`}>
          {account?.authStatus ?? "non collegato"}
        </span>
      </div>

      {account && (
        <div className="connection-meta">
          <strong>{account.onlineId}</strong>
          <span>Trofei: Italiano · {account.preferredLocale}</span>
        </div>
      )}

      {!connected && (
        <form className="form" onSubmit={connect} autoComplete="off">
          <label className="field">
            <span>ID online PSN</span>
            <input
              name="onlineId"
              value={onlineId}
              onChange={(event) => setOnlineId(event.target.value)}
              required
              maxLength={32}
              placeholder="Il tuo ID PlayStation"
            />
          </label>
          <label className="field">
            <span>NPSSO</span>
            <input
              name="npsso"
              type="password"
              value={npsso}
              onChange={(event) => setNpsso(event.target.value)}
              required
              minLength={32}
              autoComplete="off"
              spellCheck={false}
              placeholder="Incolla il codice solo qui"
            />
          </label>
          <p className="help">
            L'NPSSO viene usato una sola volta dal server per verificare il tuo account.
            Non viene salvato. TrophyBridge conserva solo il refresh token cifrato.
          </p>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "Connessione…" : "Collega PlayStation"}
          </button>
        </form>
      )}

      {connected && (
        <div className="actions">
          <button className="button" type="button" onClick={refresh} disabled={busy}>
            Verifica connessione
          </button>
          <button className="button danger" type="button" onClick={disconnect} disabled={busy}>
            Disconnetti PSN
          </button>
        </div>
      )}

      {message && <p className="notice" role="status">{message}</p>}
    </section>
  );
}
