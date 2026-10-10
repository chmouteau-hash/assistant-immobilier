// Planning — fonctions PURES : dépendances entre actions, blocages, liste du jour, timeline.
//
// Règle du cadrage : « la timeline n'invente pas de date ». Une action sans échéance reste sans
// date ; elle n'est jamais placée à « aujourd'hui » ni à une date calculée.

export type ActionPlanifiee = {
  id: string;
  description: string;
  statut: string; // a_faire | en_cours | bloque | fait (table de référence côté base)
  echeance: string | null; // ISO AAAA-MM-JJ ou null si inconnue
  responsable: string | null;
  estJalon: boolean;
  scenarioId: string | null;
};

/** `actionId` ne peut commencer qu'une fois `dependDeId` faite. */
export type Dependance = { actionId: string; dependDeId: string };

/** Identifiants des prérequis NON faits d'une action (vide = rien ne la bloque). */
export function prerequisBloquants(
  actionId: string,
  actions: ActionPlanifiee[],
  dependances: Dependance[],
): string[] {
  const parId = new Map(actions.map((a) => [a.id, a]));
  return dependances
    .filter((d) => d.actionId === actionId)
    .map((d) => d.dependDeId)
    .filter((id) => {
      const prerequis = parId.get(id);
      return prerequis !== undefined && prerequis.statut !== "fait";
    });
}

/**
 * Vrai si ajouter « `actionId` dépend de `dependDeId` » créerait un cycle (A avant B avant A).
 * Un cycle rendrait les deux actions bloquées à jamais : on le refuse à la saisie.
 */
export function creeraitUnCycle(
  dependances: Dependance[],
  actionId: string,
  dependDeId: string,
): boolean {
  if (actionId === dependDeId) return true;
  // Existe-t-il déjà un chemin dependDeId → … → actionId ? Alors actionId → dependDeId boucle.
  const suivants = new Map<string, string[]>();
  for (const d of dependances) {
    const liste = suivants.get(d.dependDeId) ?? [];
    liste.push(d.actionId);
    suivants.set(d.dependDeId, liste);
  }
  const vus = new Set<string>();
  const pile = [actionId];
  while (pile.length > 0) {
    const courant = pile.pop()!;
    if (courant === dependDeId) return true;
    if (vus.has(courant)) continue;
    vus.add(courant);
    for (const s of suivants.get(courant) ?? []) pile.push(s);
  }
  return false;
}

export type Classement<T extends ActionPlanifiee> = {
  aujourdhui: T[];
  aDebloquer: T[];
  aExplorer: T[];
};

/**
 * Classe les actions non faites pour l'accueil. Une action n'apparaît que dans UNE colonne :
 * 1. « À débloquer » : statut `bloque` OU un prérequis non fait — même si elle est en retard,
 *    car on ne peut pas la faire aujourd'hui ;
 * 2. « Aujourd'hui » : échéance connue, dépassée ou du jour ;
 * 3. « À explorer » : le reste (pas d'échéance, ou échéance future).
 */
export function classerPourAccueil<T extends ActionPlanifiee>(
  actions: T[],
  dependances: Dependance[],
  aujourdhuiISO: string,
): Classement<T> {
  const resultat: Classement<T> = { aujourdhui: [], aDebloquer: [], aExplorer: [] };
  for (const a of actions) {
    if (a.statut === "fait") continue;
    const bloqueeParDeps = prerequisBloquants(a.id, actions, dependances).length > 0;
    if (a.statut === "bloque" || bloqueeParDeps) resultat.aDebloquer.push(a);
    else if (a.echeance !== null && a.echeance <= aujourdhuiISO) resultat.aujourdhui.push(a);
    else resultat.aExplorer.push(a);
  }
  return resultat;
}

export type ElementTimeline<T extends ActionPlanifiee> = {
  action: T;
  /** `passe` : échéance < aujourd'hui ; `aujourdhui` ; `futur` ; `sans_date` : échéance inconnue. */
  position: "passe" | "aujourdhui" | "futur" | "sans_date";
  enRetard: boolean;
  prerequisBloquants: string[];
};

/**
 * Timeline : actions datées triées par échéance, puis actions sans date à part (jamais placées
 * sur l'axe). Les jalons sont des actions comme les autres avec `estJalon`.
 */
export function construireTimeline<T extends ActionPlanifiee>(
  actions: T[],
  dependances: Dependance[],
  aujourdhuiISO: string,
): { datees: ElementTimeline<T>[]; sansDate: ElementTimeline<T>[] } {
  const elements = actions.map<ElementTimeline<T>>((a) => {
    let position: ElementTimeline<T>["position"] = "sans_date";
    if (a.echeance !== null) {
      position = a.echeance < aujourdhuiISO ? "passe" : a.echeance === aujourdhuiISO ? "aujourdhui" : "futur";
    }
    return {
      action: a,
      position,
      enRetard: position === "passe" && a.statut !== "fait",
      prerequisBloquants: prerequisBloquants(a.id, actions, dependances),
    };
  });
  const datees = elements
    .filter((e) => e.position !== "sans_date")
    .sort((x, y) => (x.action.echeance! < y.action.echeance! ? -1 : x.action.echeance! > y.action.echeance! ? 1 : 0));
  const sansDate = elements.filter((e) => e.position === "sans_date");
  return { datees, sansDate };
}
