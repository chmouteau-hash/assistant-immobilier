// Accès aux données du dossier immobilier (SQLite local). Ce module est l'équivalent, en bien
// plus petit, des `repos/*.rs` d'Ergonomia : il porte le SQL, les routes/pages ne font qu'appeler
// ces fonctions.

import { randomUUID } from "node:crypto";
import { obtenirBase, transaction } from "./db/client";
import { enregistrerEvenement, historiqueDe, type EvenementAudit } from "./db/audit";
import { introuvable, invalide } from "./erreurs";

export type Dossier = {
  id: string;
  nom: string;
  objectif: string | null;
  stade: string | null;
  createdAt: string;
};

export type Scenario = {
  id: string;
  dossierId: string;
  nom: string;
  description: string | null;
  statut: string;
  source: string;
  createdAt: string;
};

export type LigneBudget = {
  id: string;
  scenarioId: string;
  poste: string;
  montantCentimes: number;
  typeMontant: string;
  source: string;
  createdAt: string;
};

export type Reference = { code: string; libelle: string };

// --- Références (pour peupler les listes déroulantes des formulaires) ------------------------

// `node:sqlite` renvoie des lignes à PROTOTYPE NULL (vérifié : `[Object: null prototype] {...}`),
// que React refuse de transmettre d'un composant serveur vers un composant client (« Classes or
// null prototypes are not supported »). `versReference` reconstruit un objet plain — nécessaire
// partout où le résultat est passé tel quel à un composant client, comme ici.
function versReference(ligne: { code: string; libelle: string }): Reference {
  return { code: ligne.code, libelle: ligne.libelle };
}

export function listerStatutsScenario(): Reference[] {
  const db = obtenirBase();
  const lignes = db
    .prepare(`SELECT code, libelle FROM ref_statut_scenario WHERE is_active = 1 ORDER BY ordre`)
    .all() as Array<{ code: string; libelle: string }>;
  return lignes.map(versReference);
}

export function listerSourcesDonnee(): Reference[] {
  const db = obtenirBase();
  const lignes = db
    .prepare(`SELECT code, libelle FROM ref_source_donnee ORDER BY ordre`)
    .all() as Array<{ code: string; libelle: string }>;
  return lignes.map(versReference);
}

export function listerTypesMontant(): Reference[] {
  const db = obtenirBase();
  const lignes = db
    .prepare(`SELECT code, libelle FROM ref_type_montant ORDER BY ordre`)
    .all() as Array<{ code: string; libelle: string }>;
  return lignes.map(versReference);
}

// --- Dossiers ----------------------------------------------------------------------------------

function ligneVersDossier(ligne: {
  id: string;
  nom: string;
  objectif: string | null;
  stade: string | null;
  created_at: string;
}): Dossier {
  return {
    id: ligne.id,
    nom: ligne.nom,
    objectif: ligne.objectif,
    stade: ligne.stade,
    createdAt: ligne.created_at,
  };
}

export function listerDossiers(): Dossier[] {
  const db = obtenirBase();
  const lignes = db
    .prepare(`SELECT id, nom, objectif, stade, created_at FROM dossier ORDER BY created_at DESC`)
    .all() as Parameters<typeof ligneVersDossier>[0][];
  return lignes.map(ligneVersDossier);
}

export function obtenirDossier(id: string): Dossier {
  const db = obtenirBase();
  const ligne = db
    .prepare(`SELECT id, nom, objectif, stade, created_at FROM dossier WHERE id = ?`)
    .get(id) as Parameters<typeof ligneVersDossier>[0] | undefined;
  if (!ligne) throw introuvable("Dossier");
  return ligneVersDossier(ligne);
}

export function creerDossier(params: { nom: string; objectif?: string; stade?: string }): Dossier {
  const nom = params.nom.trim();
  if (nom === "") throw invalide("Le nom du dossier est obligatoire.");

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO dossier (id, nom, objectif, stade) VALUES (?, ?, ?, ?)`).run(
      id,
      nom,
      params.objectif?.trim() || null,
      params.stade?.trim() || null,
    );
    enregistrerEvenement(db, { nomEntite: "dossier", entiteId: id, action: "creation" });
    return obtenirDossier(id);
  });
}

// --- Scénarios ---------------------------------------------------------------------------------

function ligneVersScenario(ligne: {
  id: string;
  dossier_id: string;
  nom: string;
  description: string | null;
  statut: string;
  source: string;
  created_at: string;
}): Scenario {
  return {
    id: ligne.id,
    dossierId: ligne.dossier_id,
    nom: ligne.nom,
    description: ligne.description,
    statut: ligne.statut,
    source: ligne.source,
    createdAt: ligne.created_at,
  };
}

export function listerScenarios(dossierId: string): Scenario[] {
  const db = obtenirBase();
  const lignes = db
    .prepare(
      `SELECT id, dossier_id, nom, description, statut, source, created_at
       FROM scenario WHERE dossier_id = ? ORDER BY created_at`,
    )
    .all(dossierId) as Parameters<typeof ligneVersScenario>[0][];
  return lignes.map(ligneVersScenario);
}

export function obtenirScenario(id: string): Scenario {
  const db = obtenirBase();
  const ligne = db
    .prepare(
      `SELECT id, dossier_id, nom, description, statut, source, created_at
       FROM scenario WHERE id = ?`,
    )
    .get(id) as Parameters<typeof ligneVersScenario>[0] | undefined;
  if (!ligne) throw introuvable("Scénario");
  return ligneVersScenario(ligne);
}

export function creerScenario(params: {
  dossierId: string;
  nom: string;
  description?: string;
  source?: string;
}): Scenario {
  const nom = params.nom.trim();
  if (nom === "") throw invalide("Le nom du scénario est obligatoire.");
  obtenirDossier(params.dossierId); // 404 explicite si le dossier n'existe pas

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO scenario (id, dossier_id, nom, description, source) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, params.dossierId, nom, params.description?.trim() || null, params.source ?? "saisie");
    enregistrerEvenement(db, { nomEntite: "scenario", entiteId: id, action: "creation" });
    return obtenirScenario(id);
  });
}

/**
 * Change le statut d'un scénario — et SEULEMENT le statut, toujours accompagné d'un motif.
 * Le motif n'est pas optionnel ici (contrairement au motif de `enregistrerEvenement` en général) :
 * une transition de statut sans raison écrite est précisément ce que le cadrage demande
 * d'éviter (« pourquoi avait-on écarté la rénovation ? » doit avoir une réponse).
 */
export function changerStatutScenario(params: {
  scenarioId: string;
  nouveauStatut: string;
  motif: string;
}): Scenario {
  const motif = params.motif.trim();
  if (motif === "") throw invalide("Un motif est obligatoire pour changer le statut d'un scénario.");

  const avant = obtenirScenario(params.scenarioId);
  if (avant.statut === params.nouveauStatut) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE scenario SET statut = ? WHERE id = ?`).run(
      params.nouveauStatut,
      params.scenarioId,
    );
    enregistrerEvenement(db, {
      nomEntite: "scenario",
      entiteId: params.scenarioId,
      action: "transition_statut",
      motif,
      changements: [{ champ: "statut", avant: avant.statut, apres: params.nouveauStatut }],
    });
    return obtenirScenario(params.scenarioId);
  });
}

export function historiqueScenario(scenarioId: string): EvenementAudit[] {
  const db = obtenirBase();
  return historiqueDe(db, "scenario", scenarioId);
}

// --- Budget ------------------------------------------------------------------------------------

function ligneVersBudget(ligne: {
  id: string;
  scenario_id: string;
  poste: string;
  montant_centimes: number;
  type_montant: string;
  source: string;
  created_at: string;
}): LigneBudget {
  return {
    id: ligne.id,
    scenarioId: ligne.scenario_id,
    poste: ligne.poste,
    montantCentimes: ligne.montant_centimes,
    typeMontant: ligne.type_montant,
    source: ligne.source,
    createdAt: ligne.created_at,
  };
}

export function listerLignesBudget(scenarioId: string): LigneBudget[] {
  const db = obtenirBase();
  const lignes = db
    .prepare(
      `SELECT id, scenario_id, poste, montant_centimes, type_montant, source, created_at
       FROM ligne_budget WHERE scenario_id = ? ORDER BY created_at`,
    )
    .all(scenarioId) as Parameters<typeof ligneVersBudget>[0][];
  return lignes.map(ligneVersBudget);
}

/** Total des lignes d'un scénario, en centimes — somme d'entiers, jamais de flottant. */
export function totalBudget(scenarioId: string): number {
  return listerLignesBudget(scenarioId).reduce((total, ligne) => total + ligne.montantCentimes, 0);
}

export function ajouterLigneBudget(params: {
  scenarioId: string;
  poste: string;
  montantCentimes: number;
  typeMontant: string;
  source?: string;
}): LigneBudget {
  const poste = params.poste.trim();
  if (poste === "") throw invalide("Le poste budgétaire est obligatoire.");
  if (!Number.isInteger(params.montantCentimes)) {
    throw invalide("Le montant doit être un nombre entier de centimes.");
  }
  obtenirScenario(params.scenarioId);

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO ligne_budget (id, scenario_id, poste, montant_centimes, type_montant, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.scenarioId,
      poste,
      params.montantCentimes,
      params.typeMontant,
      params.source ?? "estimation",
    );
    enregistrerEvenement(db, { nomEntite: "ligne_budget", entiteId: id, action: "creation" });
    const ligne = db
      .prepare(
        `SELECT id, scenario_id, poste, montant_centimes, type_montant, source, created_at
         FROM ligne_budget WHERE id = ?`,
      )
      .get(id) as Parameters<typeof ligneVersBudget>[0];
    return ligneVersBudget(ligne);
  });
}
