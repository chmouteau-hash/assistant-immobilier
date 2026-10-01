import Link from "next/link";
import { notFound } from "next/navigation";
import {
  obtenirDossier,
  listerScenarios,
  listerLignesBudget,
  totalBudget,
  historiqueScenario,
  listerStatutsScenario,
  listerSourcesDonnee,
  listerTypesMontant,
} from "@/lib/dossiers";
import { listerTachesDossier, listerStatutsTache } from "@/lib/taches";
import { ErreurApplicative } from "@/lib/erreurs";
import { ScenarioCard } from "./ScenarioCard";
import { FormulaireScenario } from "./FormulaireScenario";
import { FormulaireTache } from "./FormulaireTache";
import { TacheItem } from "@/components/TacheItem";

// Voir le commentaire équivalent dans `dossiers/page.tsx` — même raison, cette page lit aussi
// directement la base locale.
export const dynamic = "force-dynamic";

export default async function PageDossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let dossier;
  try {
    dossier = obtenirDossier(id);
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative && erreur.code === "NOT_FOUND") notFound();
    throw erreur;
  }

  const scenarios = listerScenarios(id);
  const statuts = listerStatutsScenario();
  const sources = listerSourcesDonnee();
  const typesMontant = listerTypesMontant();
  const taches = listerTachesDossier(id);
  const statutsTache = listerStatutsTache();

  return (
    <main className="mx-auto flex max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <Link href="/dossiers" className="text-sm text-neutral-500 hover:underline">
        ← Mes dossiers
      </Link>
      <h1 className="text-xl font-semibold">{dossier.nom}</h1>
      {dossier.objectif && <p className="text-neutral-600">{dossier.objectif}</p>}

      <section className="flex flex-col gap-4">
        <h2 className="font-medium text-neutral-700">
          Scénarios à comparer{scenarios.length > 0 && ` (${scenarios.length})`}
        </h2>
        {scenarios.length === 0 && (
          <p className="text-neutral-500">
            Aucun scénario pour l&apos;instant — un dossier peut comparer plusieurs options
            (conserver, rénover, reconstruire…) sans que l&apos;une écrase l&apos;autre.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              dossierId={id}
              scenario={scenario}
              lignesBudget={listerLignesBudget(scenario.id)}
              totalCentimes={totalBudget(scenario.id)}
              historique={historiqueScenario(scenario.id)}
              statuts={statuts}
              sources={sources}
              typesMontant={typesMontant}
            />
          ))}
        </div>
        <FormulaireScenario dossierId={id} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium text-neutral-700">
          Tâches{taches.length > 0 && ` (${taches.length})`}
        </h2>
        {taches.length === 0 ? (
          <p className="text-neutral-500">Aucune tâche pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {taches.map((tache) => (
              <TacheItem key={tache.id} tache={tache} statuts={statutsTache} />
            ))}
          </ul>
        )}
        <FormulaireTache dossierId={id} scenarios={scenarios} />
      </section>
    </main>
  );
}
