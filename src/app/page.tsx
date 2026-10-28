import Link from "next/link";
import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { listerTachesPourAccueil, type TacheAvecDossier } from "@/lib/taches";
import { listerReference } from "@/lib/references";
import { listerToutesPersonnes } from "@/lib/personnes";
import { actionChoisirActeur } from "./dossiers/actions";
import { TacheItem } from "@/components/TacheItem";
import { classeSaisie } from "@/components/ui";

// Cette page lit la base locale : Next.js ne doit pas la pré-rendre une fois pour toutes au build.
export const dynamic = "force-dynamic";

function Colonne({ titre, sousTitre, taches, statuts }: { titre: string; sousTitre: string; taches: TacheAvecDossier[]; statuts: ReturnType<typeof listerReference> }) {
  return (
    <section className="flex flex-1 flex-col gap-2">
      <div>
        <h2 className="font-semibold">{titre}</h2>
        <p className="text-xs text-texte-discret italic">{sousTitre}</p>
      </div>
      {taches.length === 0 ? (
        <p className="text-sm text-texte-discret italic">Rien ici.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {taches.map((t) => (
            <TacheItem key={t.id} tache={t} dossierNom={t.dossierNom} statuts={statuts} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function Accueil() {
  const acteur = await obtenirActeurCourant();
  const { aujourdhui, aDebloquer, aExplorer } = listerTachesPourAccueil(acteur);
  const statuts = listerReference("ref_statut_tache");
  const personnes = listerToutesPersonnes();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Assistant immobilier</h1>
        <Link href="/dossiers" className="text-sm text-neutral-500 hover:underline">
          Mes dossiers →
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
        <p className="text-neutral-500">
          Local à ce PC — rien n&apos;est envoyé ailleurs (base et fichiers dans <code className="rounded bg-neutral-100 px-1">data/</code>, hors git).
        </p>
        <form action={actionChoisirActeur} className="flex items-center gap-2">
          <span className="text-neutral-600">
            Vous agissez en tant que <strong>{acteur.nom}</strong>
            {acteur.simule && <span className="ml-1 rounded bg-amber-100 px-1.5 text-xs text-amber-800">simulation</span>}
          </span>
          <select key={acteur.simule ? acteur.personneId : ""} name="personneId" defaultValue={acteur.simule ? acteur.personneId : ""} className={classeSaisie}>
            <option value="">— utilisateur local —</option>
            {personnes
              .filter((p) => !p.estUtilisateurLocal)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                  {p.profession ? ` (${p.profession})` : ""}
                </option>
              ))}
          </select>
          <button type="submit" className="rounded border border-neutral-400 px-2 py-1 text-xs hover:bg-neutral-100">
            Changer
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row">
        <Colonne titre="Aujourd'hui" sousTitre="Échéance dépassée ou du jour, rien ne la bloque" taches={aujourdhui} statuts={statuts} />
        <Colonne titre="À débloquer" sousTitre="Bloquée, ou un prérequis n'est pas fait" taches={aDebloquer} statuts={statuts} />
        <Colonne titre="À explorer" sousTitre="Pas encore urgent, ou sans date connue" taches={aExplorer} statuts={statuts} />
      </div>
    </main>
  );
}
