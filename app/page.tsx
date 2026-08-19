const principles = [
  "Privacy-first by design",
  "Base game and DLC kept separate",
  "Stable read-only sharing for AI clients",
  "Validated provider-isolated PlayStation integration",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">TrophyBridge · v0.1 development</p>
        <h1>PlayStation trophy progress, ready for an AI copilot.</h1>
        <p className="lede">
          TrophyBridge will synchronize trophy data, preserve a trustworthy local state,
          and expose a revocable public API so an AI assistant can understand exactly
          where a player stands on the road to a platinum.
        </p>
        <div className="status">M2 · PSN Provider complete</div>
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
