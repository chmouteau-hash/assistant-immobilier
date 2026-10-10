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
  const description = params.description.trim();
  if (description === "") throw invalide("La description de l'action est obligatoire.");
  if (params.echeance && !/^\d{4}-\d{2}-\d{2}$/.test(params.echeance)) {
    throw invalide("L'échéance doit être une date au format AAAA-MM-JJ, ou laissée vide (inconnue).");
  }
  const db = obtenirBase();
  if (params.scenarioId) {
    const s = db.prepare(`SELECT dossier_id FROM scenario WHERE id = ?`).get(params.scenarioId) as { dossier_id: string } | undefined;
    if (!s || s.dossier_id !== params.dossierId) throw invalide("Le scénario indiqué n'appartient pas à ce dossier.");
  }
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

