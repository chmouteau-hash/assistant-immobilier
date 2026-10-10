// Comparaison de scénarios — fonction PURE. Elle met côte à côte des synthèses budgétaires et
// des compteurs d'inconnues ; elle ne désigne JAMAIS un « gagnant » tant qu'un scénario comparé
// a des postes à renseigner : comparer un total complet à un total partiel serait trompeur.

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
  /** Vrai si TOUS les scénarios comparés ont un budget complet. */
  comparable: boolean;
  /** Pourquoi la comparaison des totaux n'est pas concluante, le cas échéant. */
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
  let reserve: string | null = null;
  if (elements.length < 2) {
    reserve = "Il faut au moins deux scénarios pour comparer.";
  } else if (incomplets.length > 0) {
    reserve = `Totaux non comparables : ${incomplets.map((e) => e.nom).join(", ")} ${
      incomplets.length > 1 ? "ont" : "a"
    } des postes à renseigner.`;
  } else if (elements.some((e) => e.synthese.nbPostesSurEstimation > 0)) {
    reserve = "Comparaison indicative : certains postes reposent encore sur des estimations.";
  }

  return { lignes, comparable: elements.length >= 2 && incomplets.length === 0, reserve };
}
