// Comparaison de scénarios — fonction PURE. Elle met côte à côte des synthèses budgétaires et
// des compteurs d'inconnues ; elle ne désigne JAMAIS un « gagnant » tant qu'un scénario comparé
// a des postes à renseigner : comparer un total complet à un total partiel serait trompeur.
//
// Avec moins de deux scénarios il n'y a rien à comparer, et la fonction ne formule aucune réserve :
// un dossier simple (une chambre à refaire) peut n'avoir qu'un scénario, et l'écran ne doit pas le
// présenter comme un manque (issue #42).

import type { SyntheseScenario } from "./budget";

export type ElementsComparaison = {
  scenarioId: string;
  nom: string;
  statut: string;
  synthese: SyntheseScenario;
  nbHypothesesOuvertes: number;
  nbIdeesRetenues: number;
  nbTachesOuvertes: number;
};

export type LigneComparaison = ElementsComparaison & {
  /** Rang par total de référence croissant, seulement parmi les scénarios complets. */
  rangCout: number | null;
  /** Écart au scénario complet le moins cher, en centimes (0 pour lui-même). */
  ecartAuMoinsCherCentimes: number | null;
};

export type Comparaison = {
  lignes: LigneComparaison[];
  /** Vrai s'il y a au moins deux scénarios et que TOUS ont un budget complet. */
  comparable: boolean;
  /** Pourquoi la comparaison des totaux n'est pas concluante, le cas échéant. Toujours `null` avec moins de deux scénarios. */
  reserve: string | null;
};

export function comparerScenarios(elements: ElementsComparaison[]): Comparaison {
  const complets = elements.filter((e) => e.synthese.complet);
  const tries = [...complets].sort(
    (a, b) => (a.synthese.totalReferenceCentimes ?? 0) - (b.synthese.totalReferenceCentimes ?? 0),
  );
  const moinsCher = tries[0]?.synthese.totalReferenceCentimes ?? null;

  const lignes: LigneComparaison[] = elements.map((e) => {
    const rang = tries.findIndex((t) => t.scenarioId === e.scenarioId);
    const total = e.synthese.totalReferenceCentimes;
    return {
      ...e,
      rangCout: rang === -1 ? null : rang + 1,
      ecartAuMoinsCherCentimes:
        rang === -1 || moinsCher === null || total === null ? null : total - moinsCher,
    };
  });

  const incomplets = elements.filter((e) => !e.synthese.complet);
  const aComparer = elements.length >= 2;
  let reserve: string | null = null;
  if (aComparer && incomplets.length > 0) {
    // Un scénario sans aucun poste n'a pas « des postes à renseigner » : on le dit autrement.
    const noms = (liste: ElementsComparaison[]) => liste.map((e) => e.nom).join(", ");
    const sansPoste = incomplets.filter((e) => e.synthese.nbPostes === 0);
    const aRenseigner = incomplets.filter((e) => e.synthese.nbPostes > 0);
    const raisons: string[] = [];
    if (sansPoste.length > 0) raisons.push(`${noms(sansPoste)} ${sansPoste.length > 1 ? "n'ont" : "n'a"} aucun poste`);
    if (aRenseigner.length > 0) raisons.push(`${noms(aRenseigner)} ${aRenseigner.length > 1 ? "ont" : "a"} des postes à renseigner`);
    reserve = `Totaux non comparables : ${raisons.join(" ; ")}.`;
  } else if (aComparer && elements.some((e) => e.synthese.nbPostesSurEstimation > 0)) {
    reserve = "Comparaison indicative : certains postes reposent encore sur des estimations.";
  }

  return { lignes, comparable: aComparer && incomplets.length === 0, reserve };
}
