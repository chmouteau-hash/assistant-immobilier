// Actions, jalons, dépendances — priorité 3 (« actions, responsables, dates, dépendances,
// timeline, liste du jour »). Le classement et la timeline sont calculés par
// `src/domain/planning.ts` (pur) ; ce module lit la base et contrôle les droits.

import { randomUUID } from "node:crypto";
import { obtenirBase, transaction, versObjets } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { dossiersAccessibles, exiger, type Acteur } from "./acces";
import { interdit, invalide } from "./erreurs";
import {
  classerPourAccueil,
  construireTimeline,
  creeraitUnCycle,
  prerequisBloquants,
  type ActionPlanifiee,
  type Dependance,
} from "../domain/planning";

export type Tache = ActionPlanifiee & {
  dossierId: string;
  responsablePersonneId: string | null;
  source: string;
  createdAt: string;
};

export type TacheAvecDossier = Tache & { dossierNom: string; prerequisBloquants: string[] };

const COLONNES = `id, dossier_id, scenario_id, description, echeance, responsable, responsable_personne_id, statut, est_jalon, source, created_at`;

type TacheBrute = Omit<Tache, "estJalon"> & { estJalon: number };

function hydrater(lignes: unknown[]): Tache[] {
  return versObjets<TacheBrute>(lignes).map((t) => ({ ...t, estJalon: t.estJalon === 1 }));
}

function lireBrute(id: string): Tache {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES} FROM tache WHERE id = ?`).get(id);
  if (!ligne) throw interdit();
  return hydrater([ligne])[0];
}

function dependancesDossier(dossierId: string): Dependance[] {
  return versObjets<{ tacheId: string; dependDeId: string }>(
    obtenirBase()
      .prepare(`SELECT d.tache_id, d.depend_de_id FROM dependance_tache d JOIN tache t ON t.id = d.tache_id WHERE t.dossier_id = ?`)
      .all(dossierId),
  ).map((d) => ({ actionId: d.tacheId, dependDeId: d.dependDeId }));
}

export function listerTaches(acteur: Acteur, dossierId: string): Tache[] {
  exiger(acteur, dossierId, "lire", "taches");
  return hydrater(
    obtenirBase().prepare(`SELECT ${COLONNES} FROM tache WHERE dossier_id = ? ORDER BY (echeance IS NULL), echeance, created_at`).all(dossierId),
  );
}

export function listerDependances(acteur: Acteur, dossierId: string): Dependance[] {
  exiger(acteur, dossierId, "lire", "taches");
  return dependancesDossier(dossierId);
}

// Garde-fous de saisie, communs à la création et à la correction d'une action.

function descriptionExigee(saisie: string): string {
  const description = saisie.trim();
  if (description === "") throw invalide("La description de l'action est obligatoire.");
  return description;
}

function exigerEcheanceValide(echeance: string | null | undefined): void {
  if (echeance && !/^\d{4}-\d{2}-\d{2}$/.test(echeance)) {
    throw invalide("L'échéance doit être une date au format AAAA-MM-JJ, ou laissée vide (inconnue).");
  }
}

function exigerScenarioDuDossier(scenarioId: string | null | undefined, dossierId: string): void {
  if (!scenarioId) return;
  const s = obtenirBase().prepare(`SELECT dossier_id FROM scenario WHERE id = ?`).get(scenarioId) as { dossier_id: string } | undefined;
  if (!s || s.dossier_id !== dossierId) throw invalide("Le scénario indiqué n'appartient pas à ce dossier.");
}

export function creerTache(
  acteur: Acteur,
  params: {
    dossierId: string;
    scenarioId?: string | null;
    description: string;
    echeance?: string | null;
    responsable?: string | null;
    responsablePersonneId?: string | null;
    estJalon?: boolean;
    dependDeIds?: string[];
  },
): Tache {
  exiger(acteur, params.dossierId, "ecrire", "taches");
  const description = descriptionExigee(params.description);
  exigerEcheanceValide(params.echeance);
  exigerScenarioDuDossier(params.scenarioId, params.dossierId);
  const db = obtenirBase();
  const dependDeIds = [...new Set(params.dependDeIds ?? [])].filter((x) => x !== "");
  for (const dep of dependDeIds) {
    const t = db.prepare(`SELECT dossier_id FROM tache WHERE id = ?`).get(dep) as { dossier_id: string } | undefined;
    if (!t || t.dossier_id !== params.dossierId) throw invalide("Un prérequis indiqué n'appartient pas à ce dossier.");
  }

  return transaction((tx) => {
    const id = randomUUID();
    tx.prepare(
      `INSERT INTO tache (id, dossier_id, scenario_id, description, echeance, responsable, responsable_personne_id, est_jalon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.dossierId,
      params.scenarioId || null,
      description,
      params.echeance || null,
      params.responsable?.trim() || null,
      params.responsablePersonneId || null,
      params.estJalon ? 1 : 0,
    );
    for (const dep of dependDeIds) {
      tx.prepare(`INSERT INTO dependance_tache (tache_id, depend_de_id) VALUES (?, ?)`).run(id, dep);
    }
    enregistrerEvenement(tx, { nomEntite: "tache", entiteId: id, action: "creation", acteurId: acteur.personneId, dossierId: params.dossierId });
    return lireBrute(id);
  });
}

/**
 * Corrige une action après sa création. Un champ absent (`undefined`) reste inchangé ; un champ
 * vide est effacé : l'échéance redevient alors inconnue. Seuls les champs changés sont tracés.
 */
export function modifierTache(
  acteur: Acteur,
  params: { tacheId: string; description?: string; echeance?: string | null; responsable?: string | null; scenarioId?: string | null; estJalon?: boolean },
): Tache {
  const avant = lireBrute(params.tacheId);
  exiger(acteur, avant.dossierId, "ecrire", "taches");
  const apres = {
    description: params.description === undefined ? avant.description : descriptionExigee(params.description),
    echeance: params.echeance === undefined ? avant.echeance : params.echeance || null,
    responsable: params.responsable === undefined ? avant.responsable : params.responsable?.trim() || null,
    scenarioId: params.scenarioId === undefined ? avant.scenarioId : params.scenarioId || null,
    estJalon: params.estJalon ?? avant.estJalon,
  };
  exigerEcheanceValide(apres.echeance);
  if (apres.scenarioId !== avant.scenarioId) exigerScenarioDuDossier(apres.scenarioId, avant.dossierId);

  const changements = [
    { champ: "description", avant: avant.description, apres: apres.description },
    { champ: "echeance", avant: avant.echeance, apres: apres.echeance },
    { champ: "responsable", avant: avant.responsable, apres: apres.responsable },
    { champ: "scenario_id", avant: avant.scenarioId, apres: apres.scenarioId },
    { champ: "est_jalon", avant: avant.estJalon ? 1 : 0, apres: apres.estJalon ? 1 : 0 },
  ].filter((c) => c.avant !== c.apres);
  if (changements.length === 0) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE tache SET description = ?, echeance = ?, responsable = ?, scenario_id = ?, est_jalon = ? WHERE id = ?`).run(
      apres.description,
      apres.echeance,
      apres.responsable,
      apres.scenarioId,
      apres.estJalon ? 1 : 0,
      params.tacheId,
    );
    enregistrerEvenement(db, {
      nomEntite: "tache",
      entiteId: params.tacheId,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      changements,
    });
    return lireBrute(params.tacheId);
  });
}

export function ajouterDependance(acteur: Acteur, params: { tacheId: string; dependDeId: string }): void {
  const tache = lireBrute(params.tacheId);
  exiger(acteur, tache.dossierId, "ecrire", "taches");
  const prerequis = lireBrute(params.dependDeId);
  if (prerequis.dossierId !== tache.dossierId) throw invalide("Les deux actions doivent appartenir au même dossier.");
  const existantes = dependancesDossier(tache.dossierId);
  if (existantes.some((d) => d.actionId === params.tacheId && d.dependDeId === params.dependDeId)) return;
  if (creeraitUnCycle(existantes, params.tacheId, params.dependDeId)) {
    throw invalide("Cette dépendance créerait un cycle : les deux actions s'attendraient mutuellement.");
  }
  transaction((db) => {
    db.prepare(`INSERT INTO dependance_tache (tache_id, depend_de_id) VALUES (?, ?)`).run(params.tacheId, params.dependDeId);
    enregistrerEvenement(db, {
      nomEntite: "tache",
      entiteId: params.tacheId,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: tache.dossierId,
      changements: [{ champ: "depend_de", avant: null, apres: params.dependDeId }],
    });
  });
}

/** Retire « `tacheId` dépend de `dependDeId` » : même droit et même trace que pour la poser. */
export function retirerDependance(acteur: Acteur, params: { tacheId: string; dependDeId: string }): void {
  const tache = lireBrute(params.tacheId);
  exiger(acteur, tache.dossierId, "ecrire", "taches");
  const existantes = dependancesDossier(tache.dossierId);
  if (!existantes.some((d) => d.actionId === params.tacheId && d.dependDeId === params.dependDeId)) return;
  transaction((db) => {
    db.prepare(`DELETE FROM dependance_tache WHERE tache_id = ? AND depend_de_id = ?`).run(params.tacheId, params.dependDeId);
    enregistrerEvenement(db, {
      nomEntite: "tache",
      entiteId: params.tacheId,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: tache.dossierId,
      changements: [{ champ: "depend_de", avant: params.dependDeId, apres: null }],
    });
  });
}

export function changerStatutTache(acteur: Acteur, params: { tacheId: string; nouveauStatut: string }): Tache {
  const avant = lireBrute(params.tacheId);
  exiger(acteur, avant.dossierId, "ecrire", "taches");
  if (avant.statut === params.nouveauStatut) return avant;
  if (params.nouveauStatut === "fait" || params.nouveauStatut === "en_cours") {
    const bloquants = prerequisBloquants(params.tacheId, listerTachesBrutes(avant.dossierId), dependancesDossier(avant.dossierId));
    if (bloquants.length > 0) {
      throw invalide(`Cette action attend ${bloquants.length} prérequis non fait(s) : terminez-les d'abord ou retirez la dépendance.`);
    }
  }
  return transaction((db) => {
    db.prepare(`UPDATE tache SET statut = ? WHERE id = ?`).run(params.nouveauStatut, params.tacheId);
    enregistrerEvenement(db, {
      nomEntite: "tache",
      entiteId: params.tacheId,
      action: "transition_statut",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      changements: [{ champ: "statut", avant: avant.statut, apres: params.nouveauStatut }],
    });
    return lireBrute(params.tacheId);
  });
}

function listerTachesBrutes(dossierId: string): Tache[] {
  return hydrater(obtenirBase().prepare(`SELECT ${COLONNES} FROM tache WHERE dossier_id = ?`).all(dossierId));
}

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Liste du jour, tous les dossiers ACCESSIBLES à l'acteur (section « taches » lisible). */
export function listerTachesPourAccueil(acteur: Acteur): ReturnType<typeof classerPourAccueil<TacheAvecDossier>> {
  const db = obtenirBase();
  const toutes: TacheAvecDossier[] = [];
  const deps: Dependance[] = [];
  for (const dossierId of dossiersAccessibles(acteur)) {
    try {
      exiger(acteur, dossierId, "lire", "taches");
    } catch {
      continue; // professionnel sans la section « taches » : on passe
    }
    const nom = (db.prepare(`SELECT nom FROM dossier WHERE id = ?`).get(dossierId) as { nom: string }).nom;
    const taches = listerTachesBrutes(dossierId);
    const dependances = dependancesDossier(dossierId);
    deps.push(...dependances);
    for (const t of taches) {
      toutes.push({ ...t, dossierNom: nom, prerequisBloquants: prerequisBloquants(t.id, taches, dependances) });
    }
  }
  return classerPourAccueil(toutes, deps, aujourdhuiISO());
}

export function timelineDossier(acteur: Acteur, dossierId: string) {
  exiger(acteur, dossierId, "lire", "taches");
  return construireTimeline(listerTachesBrutes(dossierId), dependancesDossier(dossierId), aujourdhuiISO());
}

export function classementDossier(acteur: Acteur, dossierId: string) {
  exiger(acteur, dossierId, "lire", "taches");
  return classerPourAccueil(listerTachesBrutes(dossierId), dependancesDossier(dossierId), aujourdhuiISO());
}

