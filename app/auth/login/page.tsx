import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth/require-user";

import { signInWithGitHub } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getAuthenticatedUser();
  if (user) redirect("/dashboard");

  return (
    <main className="shell auth-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">TrophyBridge · accesso</p>
        <h1 className="section-title">Il tuo ponte verso PSN.</h1>
        <p className="lede compact">
          Accedi a TrophyBridge con GitHub. La connessione PlayStation avviene poi
          in un'area privata e le credenziali PSN non vengono mai esposte al client pubblico.
        </p>
        <form action={signInWithGitHub}>
          <button className="button primary" type="submit">Continua con GitHub</button>
        </form>
      </section>
    </main>
  );
}
