// Calculs budgétaires — fonctions PURES, déterministes, en centimes (entiers).
//
// Un poste budgétaire (« toiture », « menuiseries ») appartient à un scénario et reçoit des
// lignes de montant typées : estimation → devis → engagement → facture → paiement. La synthèse
// ne mélange jamais ces natures : on compare un devis à une estimation (écart), une facture à un
// devis (écart), et on calcule le reste à payer (factures − paiements).
//
// Un poste SANS aucune ligne est « à renseigner » : il ne compte pour zéro nulle part, il est
// compté comme inconnu. Un total qui contient des postes à renseigner est signalé incomplet.
//
// Plusieurs lignes d'une même nature sur un poste s'ADDITIONNENT (deux factures partielles, deux
// acomptes). Un devis concurrent non retenu se marque « écarté » (`ecartee: true`) : il reste
// visible et tracé, mais n'entre dans aucune somme.

import type { Confiance, Source } from "./provenance";

export const TYPES_MONTANT = ["estimation", "devis", "engagement", "facture", "paiement"] as const;
export type TypeMontant = (typeof TYPES_MONTANT)[number];

export type Poste = { id: string; nom: string; scenarioId: string };

export type LigneMontant = {
  posteId: string;
  typeMontant: TypeMontant;
  montantCentimes: number;
  source: Source;
  confiance: Confiance;
  /** Ligne écartée (devis concurrent non retenu, erreur) : conservée, jamais additionnée. */
  ecartee?: boolean;
};

/** Statut d'avancement d'un poste : la nature la plus « engageante » dont il dispose. */
export type StatutPoste = "a_renseigner" | "estime" | "chiffre" | "engage" | "facture" | "paye";

export type SynthesePoste = {
  posteId: string;
  nom: string;
  /** Sommes par nature ; `null` = aucune ligne de cette nature (≠ 0). */
  estimationCentimes: number | null;
  devisCentimes: number | null;
  engagementCentimes: number | null;
  factureCentimes: number | null;
  paiementCentimes: number | null;
  /** Montant de référence = la nature la plus avancée disponible (facture > engagement > devis > estimation). */
  referenceCentimes: number | null;
  natureReference: TypeMontant | null;
  /** La référence repose-t-elle uniquement sur une estimation ? */
  referenceEstEstimation: boolean;
  ecartDevisEstimationCentimes: number | null;
  ecartFactureDevisCentimes: number | null;
  resteAPayerCentimes: number | null;
  statut: StatutPoste;
};

export type OptionsSynthese = {
  /** Marge d'imprévus en pour-mille (150 = 15 %). Appliquée au total de référence. */
  tauxImprevusPourMille: number;
};

export type SyntheseScenario = {
  scenarioId: string;
  postes: SynthesePoste[];
  nbPostes: number;
  nbPostesARenseigner: number;
  nbPostesSurEstimation: number;
  /** Somme des références connues. `null` si aucun poste n'a de montant. */
  totalReferenceCentimes: number | null;
  totalEstimationCentimes: number | null;
  totalDevisCentimes: number | null;
  totalFactureCentimes: number | null;
  totalPaiementCentimes: number | null;
  margeImprevusCentimes: number | null;
  totalAvecImprevusCentimes: number | null;
  /** Vrai seulement s'il y a au moins un poste et qu'aucun n'est à renseigner. */
  complet: boolean;
};

function sommeOuNull(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  return valeurs.reduce((total, v) => total + v, 0);
}

function verifierEntier(n: number, contexte: string): void {
  if (!Number.isInteger(n)) {
    throw new Error(`${contexte} : montant non entier (${n}) — les montants sont en centimes entiers.`);
  }
}

/** Marge en pour-mille, arithmétique entière, arrondi au centime le plus proche. */
export function calculerMarge(montantCentimes: number, tauxPourMille: number): number {
  verifierEntier(montantCentimes, "calculerMarge");
  if (!Number.isInteger(tauxPourMille) || tauxPourMille < 0) {
    throw new Error("Le taux d'imprévus doit être un entier positif en pour-mille.");
  }
  const produit = montantCentimes * tauxPourMille;
  const signe = produit < 0 ? -1 : 1;
  return signe * Math.floor((Math.abs(produit) + 500) / 1000);
}

export function synthetiserPoste(poste: Poste, lignes: LigneMontant[]): SynthesePoste {
  const siennes = lignes.filter((l) => l.posteId === poste.id && !l.ecartee);
  for (const l of siennes) verifierEntier(l.montantCentimes, `poste ${poste.nom}`);

  const parNature = (nature: TypeMontant) =>
    sommeOuNull(siennes.filter((l) => l.typeMontant === nature).map((l) => l.montantCentimes));

  const estimation = parNature("estimation");
  const devis = parNature("devis");
  const engagement = parNature("engagement");
  const facture = parNature("facture");
  const paiement = parNature("paiement");

  let reference: number | null = null;
  let natureReference: TypeMontant | null = null;
  if (facture !== null) [reference, natureReference] = [facture, "facture"];
  else if (engagement !== null) [reference, natureReference] = [engagement, "engagement"];
  else if (devis !== null) [reference, natureReference] = [devis, "devis"];
  else if (estimation !== null) [reference, natureReference] = [estimation, "estimation"];

  let statut: StatutPoste = "a_renseigner";
  if (paiement !== null && facture !== null && paiement >= facture) statut = "paye";
  else if (facture !== null) statut = "facture";
  else if (engagement !== null) statut = "engage";
  else if (devis !== null) statut = "chiffre";
  else if (estimation !== null) statut = "estime";

  return {
    posteId: poste.id,
    nom: poste.nom,
    estimationCentimes: estimation,
    devisCentimes: devis,
    engagementCentimes: engagement,
    factureCentimes: facture,
    paiementCentimes: paiement,
    referenceCentimes: reference,
    natureReference,
    referenceEstEstimation: natureReference === "estimation",
    ecartDevisEstimationCentimes: devis !== null && estimation !== null ? devis - estimation : null,
    ecartFactureDevisCentimes: facture !== null && devis !== null ? facture - devis : null,
    resteAPayerCentimes: facture !== null ? facture - (paiement ?? 0) : null,
    statut,
  };
}

export function synthetiserScenario(
  scenarioId: string,
  postes: Poste[],
  lignes: LigneMontant[],
  options: OptionsSynthese,
): SyntheseScenario {
  const siens = postes.filter((p) => p.scenarioId === scenarioId);
  const syntheses = siens.map((p) => synthetiserPoste(p, lignes));

  const references = syntheses.map((s) => s.referenceCentimes).filter((x): x is number => x !== null);
  const totalReference = sommeOuNull(references);
  const nbARenseigner = syntheses.filter((s) => s.statut === "a_renseigner").length;

  const total = (sel: (s: SynthesePoste) => number | null) =>
    sommeOuNull(syntheses.map(sel).filter((x): x is number => x !== null));

  const marge = totalReference === null ? null : calculerMarge(totalReference, options.tauxImprevusPourMille);

  return {
    scenarioId,
    postes: syntheses,
    nbPostes: syntheses.length,
    nbPostesARenseigner: nbARenseigner,
    nbPostesSurEstimation: syntheses.filter((s) => s.referenceEstEstimation).length,
    totalReferenceCentimes: totalReference,
    totalEstimationCentimes: total((s) => s.estimationCentimes),
    totalDevisCentimes: total((s) => s.devisCentimes),
    totalFactureCentimes: total((s) => s.factureCentimes),
    totalPaiementCentimes: total((s) => s.paiementCentimes),
    margeImprevusCentimes: marge,
    totalAvecImprevusCentimes:
      totalReference === null || marge === null ? null : totalReference + marge,
    complet: syntheses.length > 0 && nbARenseigner === 0,
  };
}

export function estTypeMontant(x: string): x is TypeMontant {
  return (TYPES_MONTANT as readonly string[]).includes(x);
}
