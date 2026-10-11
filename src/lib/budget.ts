// Budget — postes et lignes par scénario (priorité 4), synthèse et comparaison (priorité 5).
// Les CALCULS sont dans `src/domain/budget.ts` et `src/domain/comparaison.ts` (purs, testés) ;
// ce module ne fait que lire la base, contrôler les droits et appeler le domaine.

import { randomUUID } from "node:crypto";
import { obtenirBase, transaction, versObjet, versObjets } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { exiger, type Acteur } from "./acces";
import { interdit, invalide } from "./erreurs";
import { lireScenarioBrut, type Scenario } from "./dossiers";
import { exigerBatimentDuDossier } from "./structure";
import {
  estTypeMontant,
  synthetiserScenario,
  type LigneMontant,
  type Poste,
  type SyntheseScenario,
  type TypeMontant,
} from "../domain/budget";
import { comparerScenarios, type Comparaison } from "../domain/comparaison";
import { confianceParDefaut, estConfiance, estSource, validerValeurTracee, type Confiance, type Source } from "../domain/provenance";

export type PosteBudget = {
  id: string;
  dossierId: string;
  scenarioId: string;
  nom: string;
  categorie: string | null;
  batimentId: string | null;
  /** Plus aucune facture n'est attendue : la référence du poste est alors son total facturé. */
  solde: boolean;
  createdAt: string;
};

export type LigneBudget = {
  id: string;
  scenarioId: string;
  posteId: string;
  poste: string;
  montantCentimes: number;
  typeMontant: TypeMontant;
  source: Source;
  confiance: Confiance;
  documentId: string | null;
  datePiece: string | null;
  fournisseur: string | null;
  /** `active` (compte) ou `ecartee` (conservée, jamais additionnée). */
  statut: "active" | "ecartee";
  createdAt: string;
};

const COLONNES_POSTE = `id, dossier_id, scenario_id, nom, categorie, batiment_id, solde, created_at`;
const COLONNES_LIGNE = `id, scenario_id, poste_id, poste, montant_centimes, type_montant, source, confiance, document_id, date_piece, fournisseur, statut, created_at`;

type PosteBrut = Omit<PosteBudget, "solde"> & { solde: number };

function hydraterPostes(lignes: unknown[]): PosteBudget[] {
  return versObjets<PosteBrut>(lignes).map((p) => ({ ...p, solde: p.solde === 1 }));
}

export function lirePosteBrut(id: string): PosteBudget {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_POSTE} FROM poste_budget WHERE id = ?`).get(id);
  if (!ligne) throw interdit();
  return hydraterPostes([ligne])[0];
}

export function listerPostes(acteur: Acteur, dossierId: string): PosteBudget[] {
  exiger(acteur, dossierId, "lire", "budget");
  return hydraterPostes(obtenirBase().prepare(`SELECT ${COLONNES_POSTE} FROM poste_budget WHERE dossier_id = ? ORDER BY created_at`).all(dossierId));
}

export function listerLignes(acteur: Acteur, dossierId: string): LigneBudget[] {
  exiger(acteur, dossierId, "lire", "budget");
  return versObjets<LigneBudget>(
    obtenirBase()
      .prepare(
        `SELECT ${COLONNES_LIGNE} FROM ligne_budget
         WHERE scenario_id IN (SELECT id FROM scenario WHERE dossier_id = ?) ORDER BY created_at`,
      )
      .all(dossierId),
  );
}

/** Un poste SANS montant : il rend l'inconnu visible (« toiture : à renseigner »). */
export function creerPoste(
  acteur: Acteur,
  params: { scenarioId: string; nom: string; categorie?: string; batimentId?: string | null },
): PosteBudget {
  const scenario = lireScenarioBrut(params.scenarioId);
  exiger(acteur, scenario.dossierId, "ecrire", "budget");
  const nom = params.nom.trim();
  if (nom === "") throw invalide("Le nom du poste est obligatoire.");
  if (params.batimentId) exigerBatimentDuDossier(params.batimentId, scenario.dossierId);

  return transaction((db) => {
    const doublon = db.prepare(`SELECT id FROM poste_budget WHERE scenario_id = ? AND nom = ?`).get(params.scenarioId, nom);
    if (doublon) throw invalide(`Le poste « ${nom} » existe déjà dans ce scénario.`);
    const id = randomUUID();
    db.prepare(`INSERT INTO poste_budget (id, dossier_id, scenario_id, nom, categorie, batiment_id) VALUES (?, ?, ?, ?, ?, ?)`).run(
      id,
      scenario.dossierId,
      params.scenarioId,
      nom,
      params.categorie?.trim() || null,
      params.batimentId || null,
    );
    enregistrerEvenement(db, { nomEntite: "poste_budget", entiteId: id, action: "creation", acteurId: acteur.personneId, dossierId: scenario.dossierId });
    return lirePosteBrut(id);
  });
}

/**
 * Corriger un poste après sa création : nom, catégorie, bâtiment. Un champ absent ne change pas,
 * une catégorie vidée redevient inconnue, un bâtiment vide est détaché ; seuls les champs changés
 * sont tracés. Le nom reste unique dans son scénario. Chaque ligne garde une copie du nom de son
 * poste (colonne `poste`, d'avant les postes) : elle est mise à jour dans la même transaction.
 */
export function modifierPoste(acteur: Acteur, params: { posteId: string; nom?: string; categorie?: string; batimentId?: string | null }): PosteBudget {
  const avant = lirePosteBrut(params.posteId);
  exiger(acteur, avant.dossierId, "ecrire", "budget");
  // Toucher au bâtiment demande de pouvoir lire les lieux : l'écran ne propose la liste qu'à qui
  // peut la lire, et une requête directe ne doit pas permettre davantage.
  if (params.batimentId !== undefined) exiger(acteur, avant.dossierId, "lire", "lieux");
  const nom = params.nom === undefined ? avant.nom : params.nom.trim();
  if (nom === "") throw invalide("Le nom du poste est obligatoire.");
  const apres = {
    nom,
    categorie: params.categorie === undefined ? avant.categorie : params.categorie.trim() || null,
    batimentId: params.batimentId === undefined ? avant.batimentId : params.batimentId || null,
  };
  if (apres.batimentId && apres.batimentId !== avant.batimentId) exigerBatimentDuDossier(apres.batimentId, avant.dossierId);

  const changements = [
    { champ: "nom", avant: avant.nom, apres: apres.nom },
    { champ: "categorie", avant: avant.categorie, apres: apres.categorie },
    { champ: "batiment_id", avant: avant.batimentId, apres: apres.batimentId },
  ].filter((c) => c.avant !== c.apres);
  if (changements.length === 0) return avant;

  return transaction((db) => {
    if (apres.nom !== avant.nom) {
      const doublon = db.prepare(`SELECT id FROM poste_budget WHERE scenario_id = ? AND nom = ? AND id != ?`).get(avant.scenarioId, apres.nom, params.posteId);
      if (doublon) throw invalide(`Le poste « ${apres.nom} » existe déjà dans ce scénario.`);
      db.prepare(`UPDATE ligne_budget SET poste = ? WHERE poste_id = ?`).run(apres.nom, params.posteId);
    }
    db.prepare(`UPDATE poste_budget SET nom = ?, categorie = ?, batiment_id = ? WHERE id = ?`).run(apres.nom, apres.categorie, apres.batimentId, params.posteId);
    enregistrerEvenement(db, { nomEntite: "poste_budget", entiteId: params.posteId, action: "modification", acteurId: acteur.personneId, dossierId: avant.dossierId, changements });
    return lirePosteBrut(params.posteId);
  });
}

// --- Poste soldé -------------------------------------------------------------------------------------

const FACTURE_REFUSEE_POSTE_SOLDE = "Ce poste est soldé : rouvrez-le avant d'y ajouter une facture.";

/**
 * Marque un poste « soldé » (plus aucune facture attendue) ou le rouvre. Même droit que pour y
 * ajouter un montant, motif obligatoire, tracé au journal d'audit. Un poste ne se solde que s'il
 * porte au moins une facture retenue : sans facture, il n'y a rien à solder.
 */
function changerSolde(acteur: Acteur, params: { posteId: string; motif: string }, solde: boolean): PosteBudget {
  const motif = params.motif.trim();
  if (motif === "") throw invalide(`Un motif est obligatoire pour ${solde ? "solder" : "rouvrir"} un poste.`);
  const avant = lirePosteBrut(params.posteId);
  exiger(acteur, avant.dossierId, "ecrire", "budget");
  if (avant.solde === solde) return avant;

  return transaction((db) => {
    if (solde) {
      const factures = db.prepare(`SELECT COUNT(*) AS n FROM ligne_budget WHERE poste_id = ? AND type_montant = 'facture' AND statut = 'active'`).get(params.posteId) as { n: number };
      if (factures.n === 0) throw invalide("Un poste se solde une fois sa dernière facture saisie : celui-ci n'en a aucune.");
    }
    db.prepare(`UPDATE poste_budget SET solde = ? WHERE id = ?`).run(solde ? 1 : 0, params.posteId);
    enregistrerEvenement(db, {
      nomEntite: "poste_budget",
      entiteId: params.posteId,
      action: "transition_statut",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      motif,
      changements: [{ champ: "solde", avant: avant.solde ? 1 : 0, apres: solde ? 1 : 0 }],
    });
    return lirePosteBrut(params.posteId);
  });
}

export function solderPoste(acteur: Acteur, params: { posteId: string; motif: string }): PosteBudget {
  return changerSolde(acteur, params, true);
}

export function rouvrirPoste(acteur: Acteur, params: { posteId: string; motif: string }): PosteBudget {
  return changerSolde(acteur, params, false);
}

/**
 * Ajoute une ligne (estimation, devis, engagement, facture, paiement) à un poste. La provenance
 * est validée par le domaine : une estimation ne peut pas être « connue », une suggestion de
 * l'IA reste « à confirmer », etc. Le montant est un entier en centimes.
 */
export function ajouterLigne(
  acteur: Acteur,
  params: {
    posteId: string;
    montantCentimes: number;
    typeMontant: string;
    source: string;
    confiance?: string;
    documentId?: string | null;
    datePiece?: string | null;
    fournisseur?: string | null;
    motif?: string;
  },
): LigneBudget {
  const poste = lirePosteBrut(params.posteId);
  exiger(acteur, poste.dossierId, "ecrire", "budget");
  if (!Number.isInteger(params.montantCentimes)) throw invalide("Le montant doit être un nombre entier de centimes.");
  if (!estTypeMontant(params.typeMontant)) throw invalide(`Nature de montant inconnue : ${params.typeMontant}`);
  if (params.typeMontant === "facture" && poste.solde) throw invalide(FACTURE_REFUSEE_POSTE_SOLDE);
  if (!estSource(params.source)) throw invalide(`Source inconnue : ${params.source}`);
  const confiance: Confiance = params.confiance && estConfiance(params.confiance) ? params.confiance : confianceParDefaut(params.source);
  const verdict = validerValeurTracee({ valeur: params.montantCentimes, source: params.source, confiance });
  if (!verdict.valide) throw invalide(verdict.motif);
  if (params.typeMontant === "estimation" && params.source !== "estimation" && params.source !== "suggestion_ia") {
    throw invalide("Une ligne de nature « estimation » doit avoir pour source une estimation (ou une suggestion de l'IA).");
  }
  if (params.datePiece && !/^\d{4}-\d{2}-\d{2}$/.test(params.datePiece)) throw invalide("La date de la pièce doit être au format AAAA-MM-JJ.");

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO ligne_budget (id, scenario_id, poste_id, poste, montant_centimes, type_montant, source, confiance, document_id, date_piece, fournisseur)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      poste.scenarioId,
      poste.id,
      poste.nom,
      params.montantCentimes,
      params.typeMontant,
      params.source,
      confiance,
      params.documentId || null,
      params.datePiece || null,
      params.fournisseur?.trim() || null,
    );
    enregistrerEvenement(db, {
      nomEntite: "ligne_budget",
      entiteId: id,
      action: "creation",
      acteurId: acteur.personneId,
      dossierId: poste.dossierId,
      motif: params.motif?.trim() || undefined,
      changements: [
        { champ: "montant_centimes", avant: null, apres: params.montantCentimes },
        { champ: "type_montant", avant: null, apres: params.typeMontant },
        { champ: "source", avant: null, apres: params.source },
        { champ: "confiance", avant: null, apres: confiance },
      ],
    });
    return versObjet<LigneBudget>(db.prepare(`SELECT ${COLONNES_LIGNE} FROM ligne_budget WHERE id = ?`).get(id) as Record<string, unknown>);
  });
}

// --- Synthèse et comparaison -------------------------------------------------------------------------

function versDomaine(postes: PosteBudget[], lignes: LigneBudget[]): { postes: Poste[]; lignes: LigneMontant[] } {
  return {
    postes: postes.map((p) => ({ id: p.id, nom: p.nom, scenarioId: p.scenarioId, solde: p.solde })),
    lignes: lignes.map((l) => ({
      posteId: l.posteId,
      typeMontant: l.typeMontant,
      montantCentimes: l.montantCentimes,
      source: l.source,
      confiance: l.confiance,
      ecartee: l.statut === "ecartee",
    })),
  };
}

function lireLigneBrute(id: string): LigneBudget {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_LIGNE} FROM ligne_budget WHERE id = ?`).get(id);
  if (!ligne) throw interdit();
  return versObjet<LigneBudget>(ligne as Record<string, unknown>);
}

/**
 * Modifie une ligne existante (montant, nature, provenance, fournisseur, date) et/ou son statut
 * (active ↔ écartée). Motif obligatoire : un budget qui change doit dire pourquoi. Chaque champ
 * modifié est tracé avant/après. La provenance est revalidée comme à la création.
 */
export function modifierLigne(
  acteur: Acteur,
  params: {
    ligneId: string;
    montantCentimes?: number;
    typeMontant?: string;
    source?: string;
    confiance?: string;
    datePiece?: string | null;
    fournisseur?: string | null;
    statut?: string;
    motif: string;
  },
): LigneBudget {
  const motif = params.motif.trim();
  if (motif === "") throw invalide("Un motif est obligatoire pour modifier une ligne de budget.");
  const avant = lireLigneBrute(params.ligneId);
  const poste = lirePosteBrut(avant.posteId);
  exiger(acteur, poste.dossierId, "ecrire", "budget");

  const montantCentimes = params.montantCentimes ?? avant.montantCentimes;
  if (!Number.isInteger(montantCentimes)) throw invalide("Le montant doit être un nombre entier de centimes.");
  const typeMontant = params.typeMontant ?? avant.typeMontant;
  if (!estTypeMontant(typeMontant)) throw invalide(`Nature de montant inconnue : ${typeMontant}`);
  const source = params.source ?? avant.source;
  if (!estSource(source)) throw invalide(`Source inconnue : ${source}`);
  const confiance: Confiance = params.confiance && estConfiance(params.confiance) ? params.confiance : params.source && params.source !== avant.source ? confianceParDefaut(source) : avant.confiance;
  const verdict = validerValeurTracee({ valeur: montantCentimes, source, confiance });
  if (!verdict.valide) throw invalide(verdict.motif);
  if (typeMontant === "estimation" && source !== "estimation" && source !== "suggestion_ia") {
    throw invalide("Une ligne de nature « estimation » doit avoir pour source une estimation (ou une suggestion de l'IA).");
  }
  const statut = params.statut ?? avant.statut;
  if (statut !== "active" && statut !== "ecartee") throw invalide(`Statut de ligne inconnu : ${statut}`);
  // Un poste soldé n'attend plus de facture. En faire apparaître une par une modification (une
  // autre nature changée en facture, une facture écartée réactivée) demande aussi de le rouvrir.
  const etaitFactureRetenue = avant.typeMontant === "facture" && avant.statut === "active";
  if (poste.solde && typeMontant === "facture" && statut === "active" && !etaitFactureRetenue) throw invalide(FACTURE_REFUSEE_POSTE_SOLDE);
  const datePiece = params.datePiece === undefined ? avant.datePiece : params.datePiece || null;
  if (datePiece && !/^\d{4}-\d{2}-\d{2}$/.test(datePiece)) throw invalide("La date de la pièce doit être au format AAAA-MM-JJ.");
  const fournisseur = params.fournisseur === undefined ? avant.fournisseur : params.fournisseur?.trim() || null;

  const changements = [
    { champ: "montant_centimes", avant: avant.montantCentimes, apres: montantCentimes },
    { champ: "type_montant", avant: avant.typeMontant, apres: typeMontant },
    { champ: "source", avant: avant.source, apres: source },
    { champ: "confiance", avant: avant.confiance, apres: confiance },
    { champ: "date_piece", avant: avant.datePiece, apres: datePiece },
    { champ: "fournisseur", avant: avant.fournisseur, apres: fournisseur },
    { champ: "statut", avant: avant.statut, apres: statut },
  ].filter((c) => c.avant !== c.apres);
  if (changements.length === 0) return avant;

  return transaction((db) => {
    db.prepare(
      `UPDATE ligne_budget SET montant_centimes = ?, type_montant = ?, source = ?, confiance = ?, date_piece = ?, fournisseur = ?, statut = ? WHERE id = ?`,
    ).run(montantCentimes, typeMontant, source, confiance, datePiece, fournisseur, statut, params.ligneId);
    enregistrerEvenement(db, {
      nomEntite: "ligne_budget",
      entiteId: params.ligneId,
      action: changements.some((c) => c.champ === "statut") && changements.length === 1 ? "transition_statut" : "modification",
      acteurId: acteur.personneId,
      dossierId: poste.dossierId,
      motif,
      changements,
    });
    return lireLigneBrute(params.ligneId);
  });
}

export function syntheseScenario(acteur: Acteur, scenarioId: string): SyntheseScenario {
  const scenario = lireScenarioBrut(scenarioId);
  exiger(acteur, scenario.dossierId, "lire", "budget");
  const db = obtenirBase();
  const taux = (db.prepare(`SELECT taux_imprevus_pour_mille FROM dossier WHERE id = ?`).get(scenario.dossierId) as { taux_imprevus_pour_mille: number }).taux_imprevus_pour_mille;
  const postes = hydraterPostes(db.prepare(`SELECT ${COLONNES_POSTE} FROM poste_budget WHERE scenario_id = ?`).all(scenarioId));
  const lignes = versObjets<LigneBudget>(db.prepare(`SELECT ${COLONNES_LIGNE} FROM ligne_budget WHERE scenario_id = ?`).all(scenarioId));
  const d = versDomaine(postes, lignes);
  return synthetiserScenario(scenarioId, d.postes, d.lignes, { tauxImprevusPourMille: taux });
}

export type ComparaisonDossier = Comparaison & { scenarios: Scenario[] };

/** Compare TOUS les scénarios du dossier (sauf écartés si `inclureEcartes` est faux). */
export function comparaisonDossier(acteur: Acteur, dossierId: string, inclureEcartes = false): ComparaisonDossier {
  exiger(acteur, dossierId, "lire", "budget");
  exiger(acteur, dossierId, "lire", "scenarios");
  const db = obtenirBase();
  const scenarios = versObjets<Scenario>(
    db.prepare(`SELECT id, dossier_id, nom, description, statut, source, created_at FROM scenario WHERE dossier_id = ? ORDER BY created_at`).all(dossierId),
  ).filter((s) => inclureEcartes || s.statut !== "ecartee");

  const elements = scenarios.map((s) => {
    const synthese = syntheseScenario(acteur, s.id);
    const compte = (sql: string) => (db.prepare(sql).get(s.id) as { n: number }).n;
    return {
      scenarioId: s.id,
      nom: s.nom,
      statut: s.statut,
      synthese,
      nbHypothesesOuvertes: compte(`SELECT COUNT(*) AS n FROM hypothese WHERE scenario_id = ? AND statut = 'a_valider'`),
      nbIdeesRetenues: compte(`SELECT COUNT(*) AS n FROM idee WHERE scenario_id = ? AND statut = 'retenue'`),
      nbTachesOuvertes: compte(`SELECT COUNT(*) AS n FROM tache WHERE scenario_id = ? AND statut != 'fait'`),
    };
  });
  return { ...comparerScenarios(elements), scenarios };
}
