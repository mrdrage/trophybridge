const principles = [
  "Privacy-first by design",
  "Base game and additional groups kept separate",
  "Encrypted server-only PSN authorization",
  "Zero-cost bounded synchronization",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">TrophyBridge · v0.1</p>
        <h1>PlayStation trophy progress, ready for an AI copilot.</h1>
        <p className="lede">
          TrophyBridge sincronizzerà i trofei, conserverà uno stato verificabile e
          offrirà un&apos;API pubblica revocabile affinché un assistente AI sappia
          esattamente dove si trova il giocatore sulla strada verso il Platino.
        </p>
        <div className="status">M4 · Library Sync complete</div>
      </section>

      <section className="principles" aria-label="Project principles">
        {principles.map((principle) => (
          <article className="card" key={principle}>
            <span aria-hidden="true">✓</span>
            <p>{principle}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
