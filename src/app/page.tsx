import Link from "next/link";
import { listerTachesPourAccueil, listerStatutsTache } from "@/lib/taches";
import { TacheItem } from "@/components/TacheItem";

// Voir le commentaire équivalent dans `dossiers/page.tsx` : cette page lit directement la base
// locale, Next.js ne doit pas la pré-rendre une fois pour toutes au build.
export const dynamic = "force-dynamic";

function Colonne({
  titre,
  sousTitre,
  taches,
  statuts,
}: {
  titre: string;
  sousTitre: string;
  taches: ReturnType<typeof listerTachesPourAccueil>["aujourdhui"];
  statuts: ReturnType<typeof listerStatutsTache>;
}) {
  return (
    <section className="flex flex-1 flex-col gap-2">
      <div>
        <h2 className="font-semibold">{titre}</h2>
        <p className="text-xs text-neutral-400">{sousTitre}</p>
      </div>
      {taches.length === 0 ? (
        <p className="text-sm text-neutral-400">Rien ici.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {taches.map((tache) => (
            <TacheItem key={tache.id} tache={tache} dossierNom={tache.dossierNom} statuts={statuts} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Accueil() {
  const { aujourdhui, aDebloquer, aExplorer } = listerTachesPourAccueil();
  const statuts = listerStatutsTache();

  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Assistant immobilier</h1>
        <Link href="/dossiers" className="text-sm text-neutral-500 hover:underline">
          Mes dossiers →
        </Link>
      </div>
      <p className="text-sm text-neutral-500">
        Local à ce PC — rien n&apos;est envoyé ailleurs (base dans{" "}
        <code className="rounded bg-neutral-200 px-1 py-0.5">data/</code>, exclue du dépôt git).
      </p>

      <div className="flex flex-col gap-6 sm:flex-row">
        <Colonne
          titre="Aujourd'hui"
          sousTitre="Échéance dépassée ou du jour"
          taches={aujourdhui}
          statuts={statuts}
        />
        <Colonne titre="À débloquer" sousTitre="En attente de quelque chose" taches={aDebloquer} statuts={statuts} />
        <Colonne titre="À explorer" sousTitre="Pas encore urgent" taches={aExplorer} statuts={statuts} />
      </div>
    </main>
  );
}
