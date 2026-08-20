const principles = [
  "Privacy-first by design",
  "Base game and additional groups kept separate",
  "Revocable hashed public capabilities",
  "Zero-cost bounded synchronization",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">TrophyBridge · v0.1</p>
        <h1>PlayStation trophy progress, ready for an AI copilot.</h1>
        <p className="lede">
          TrophyBridge sincronizza i trofei, conserva uno stato verificabile e offre
          un&apos;API pubblica read-only e revocabile affinché un assistente AI possa
          capire con precisione il percorso verso il Platino.
        </p>
        <div className="status">M7 · Public Share complete</div>
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
