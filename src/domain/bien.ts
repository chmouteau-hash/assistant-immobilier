// Statut d'un bien, de la recherche à l'achat — fonctions PURES, sans base (issue #2, bloc « Bien »).
//
// Les statuts vivent dans la table `ref_statut_bien`, comme les autres. Ils sont redits ici parce
// qu'ils portent deux règles (DECISIONS.md, 2026-10-28) :
//
// 1. Écarter un bien ou l'acquérir tranche : ces deux statuts demandent un motif. Repéré, visité et
//    offre faite n'en demandent pas.
// 2. Le type « Bien acquis » et le statut « acquis » disent la même chose et ne se contredisent
//    jamais. Passer un bien candidat au statut « acquis » le range en « Bien acquis » ; revenir sur
//    ce statut le remet en « Bien candidat ». Un terrain garde son type : il dit sa nature, pas
//    l'étape de l'achat. La base redit la règle par deux déclencheurs (migration 007).
//
// Un statut absent (`null`) est « à renseigner » : on ne devine pas l'étape d'un bien.

import type { ResultatValidation } from "./provenance";

export const STATUTS_BIEN = ["repere", "visite", "offre_faite", "ecarte", "acquis"] as const;
export type StatutBien = (typeof STATUTS_BIEN)[number];

export const TYPE_BIEN_CANDIDAT = "bien_candidat";
export const TYPE_BIEN_ACQUIS = "bien_acquis";

export function estStatutBien(x: string): x is StatutBien {
  return (STATUTS_BIEN as readonly string[]).includes(x);
}

/** Vrai pour les statuts qui tranchent : écarter le bien, ou l'acquérir. */
export function motifExige(statut: StatutBien): boolean {
  return statut === "ecarte" || statut === "acquis";
}

/** Le statut d'un lieu qu'on vient de créer : « acquis » pour un bien acquis, à renseigner sinon. */
export function statutInitial(typeLieu: string): StatutBien | null {
  return typeLieu === TYPE_BIEN_ACQUIS ? "acquis" : null;
}

/**
 * Le type du lieu une fois son statut changé. Seuls les deux types de bien suivent le statut ;
 * tout autre type (terrain) reste ce qu'il est.
 */
export function typeApresStatut(typeLieu: string, statut: StatutBien): string {
  if (typeLieu === TYPE_BIEN_CANDIDAT && statut === "acquis") return TYPE_BIEN_ACQUIS;
  if (typeLieu === TYPE_BIEN_ACQUIS && statut !== "acquis") return TYPE_BIEN_CANDIDAT;
  return typeLieu;
}

/**
 * Le type et le statut vont-ils ensemble ? Sert quand on corrige le type d'un lieu : le statut,
 * lui, se change par son propre geste, avec son motif.
 */
export function verifierTypeEtStatut(typeLieu: string, statut: StatutBien | null): ResultatValidation {
  if (typeLieu === TYPE_BIEN_ACQUIS && statut !== "acquis") {
    return { valide: false, motif: "Pour dire qu'un bien est acquis, changez son statut en « Acquis » : un motif vous sera demandé." };
  }
  if (typeLieu === TYPE_BIEN_CANDIDAT && statut === "acquis") {
    return { valide: false, motif: "Ce bien a le statut « Acquis ». Pour revenir sur l'achat, changez d'abord son statut." };
  }
  return { valide: true };
}
