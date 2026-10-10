// Contrat de l'assistant IA — types partagés par TOUS les fournisseurs (règles locales, modèle
// distant). Le reste de l'application ne connaît que ces types : elle fonctionne entièrement sans
// IA, et l'IA ne peut rien écrire dans le dossier — elle retourne une `ReponseIA`, c'est tout.
//
// Modèle d'une réponse (cadrage) : Constat (fait, source, date) → Hypothèse (à valider) →
// Suggestion (non décisionnelle) → Vérification à faire (par qui, comment).

import type { Section } from "../droits";

export type NiveauIncertitude = "faible" | "moyen" | "eleve";

export type SourceReponse = {
  titre: string;
  /** Identifiant ou URL de la source, si elle existe. */
  reference: string | null;
  /** Date de la source ou de sa consultation (ISO), `null` si inconnue. */
  date: string | null;
  type: "dossier" | "regle_locale" | "externe" | "modele";
};

export type ElementReponse = {
  constat: { texte: string; sources: SourceReponse[] };
  hypothese: string | null;
  suggestion: string | null;
  verification: { quoi: string; parQui: string; comment: string } | null;
  incertitude: NiveauIncertitude;
  /** Vrai si la suggestion sort du cadre attendu (option inattendue), étiquetée comme telle. */
  inattendue: boolean;
};

export type ReponseIA = {
  fournisseur: string;
  modele: string | null;
  dateReponse: string;
  question: string;
  elements: ElementReponse[];
  /** Sections du dossier effectivement transmises au fournisseur. */
  perimetreUtilise: Section[];
  avertissement: string;
};

/** Sections JAMAIS transmises à un fournisseur, quoi que coche le propriétaire. */
export const SECTIONS_NON_TRANSMISSIBLES: readonly Section[] = ["droits", "ia", "personnes"];

export const AVERTISSEMENT_STANDARD =
  "Réponse d'assistance, non décisionnelle. Les points juridiques, fiscaux et financiers sont à vérifier avec un professionnel. Rien n'est écrit dans le dossier sans validation humaine.";

/**
 * Ce que le fournisseur REÇOIT : uniquement les sections autorisées par le propriétaire du
 * dossier (périmètre IA) ET lisibles par l'acteur qui pose la question. Chaque champ optionnel
 * est absent si sa section n'est pas autorisée — pas « vide », absent.
 */
export type ContexteAutorise = {
  dossier: { id: string; nom: string; typeProjet: string | null; stade: string | null };
  sections: Section[];
  lieux?: Array<{
    nom: string;
    type: string;
    adresseRenseignee: boolean;
    batiments: Array<{
      nom: string;
      pieces: Array<{ nom: string; surfaceCentiemes: number | null; surfaceConfiance: string }>;
    }>;
  }>;
  idees?: Array<{ titre: string; statut: string; scenarioNom: string | null }>;
  scenarios?: Array<{
    nom: string;
    statut: string;
    nbPostes: number;
    nbPostesARenseigner: number;
    nbPostesSurEstimation: number;
    totalReferenceCentimes: number | null;
    hypothesesOuvertes: string[];
  }>;
  budget?: Array<{
    scenarioNom: string;
    poste: string;
    statut: string;
    referenceCentimes: number | null;
    natureReference: string | null;
  }>;
  documents?: Array<{
    nom: string;
    type: string;
    rattache: boolean;
    extractionsEnAttente: number;
  }>;
  taches?: Array<{
    description: string;
    statut: string;
    echeance: string | null;
    responsable: string | null;
    bloqueePar: number;
  }>;
};

/** Interface d'un fournisseur. `repondre` ne doit JAMAIS lever pour une raison métier : il
 *  renvoie une réponse (éventuellement vide) ; les erreurs techniques remontent à l'appelant. */
export interface FournisseurIA {
  readonly nom: string;
  repondre(contexte: ContexteAutorise, question: string, maintenantISO: string): Promise<ReponseIA>;
}
