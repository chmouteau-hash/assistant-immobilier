// Accès aux tâches — priorité 3 du cadrage (« Faire avancer le projet »), ce qui alimente la vue
// d'accueil « Aujourd'hui / À débloquer / À explorer » (principe 5).

import { randomUUID } from "node:crypto";
import { obtenirBase, transaction } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { invalide, introuvable } from "./erreurs";
import { obtenirDossier } from "./dossiers";
import type { Reference } from "./dossiers";

export type Tache = {
  id: string;
  dossierId: string;
  scenarioId: string | null;
  description: string;
  echeance: string | null; // ISO YYYY-MM-DD, ou null si inconnue
  responsable: string | null;
  statut: string;
  source: string;
  createdAt: string;
};

/** Une tâche vue depuis l'accueil, tous dossiers confondus — porte le nom du dossier d'origine. */
export type TacheAvecDossier = Tache & { dossierNom: string };

export function listerStatutsTache(): Reference[] {
  const db = obtenirBase();
  const lignes = db
    .prepare(`SELECT code, libelle FROM ref_statut_tache WHERE is_active = 1 ORDER BY ordre`)
    .all() as Array<{ code: string; libelle: string }>;
  return lignes.map((l) => ({ code: l.code, libelle: l.libelle }));
}

function ligneVersTache(ligne: {
  id: string;
  dossier_id: string;
  scenario_id: string | null;
  description: string;
  echeance: string | null;
  responsable: string | null;
  statut: string;
  source: string;
  created_at: string;
}): Tache {
  return {
    id: ligne.id,
    dossierId: ligne.dossier_id,
    scenarioId: ligne.scenario_id,
    description: ligne.description,
    echeance: ligne.echeance,
    responsable: ligne.responsable,
    statut: ligne.statut,
    source: ligne.source,
    createdAt: ligne.created_at,
  };
}

const COLONNES_TACHE = `id, dossier_id, scenario_id, description, echeance, responsable, statut, source, created_at`;

export function listerTachesDossier(dossierId: string): Tache[] {
  const db = obtenirBase();
  const lignes = db
    .prepare(
      `SELECT ${COLONNES_TACHE} FROM tache WHERE dossier_id = ?
       ORDER BY (echeance IS NULL), echeance, created_at`,
    )
    .all(dossierId) as Parameters<typeof ligneVersTache>[0][];
  return lignes.map(ligneVersTache);
}

export function obtenirTache(id: string): Tache {
  const db = obtenirBase();
  const ligne = db.prepare(`SELECT ${COLONNES_TACHE} FROM tache WHERE id = ?`).get(id) as
    | Parameters<typeof ligneVersTache>[0]
    | undefined;
  if (!ligne) throw introuvable("Tâche");
  return ligneVersTache(ligne);
}

/**
 * Tâches de TOUS les dossiers, classées pour l'accueil :
 * - `aujourdhui` : échéance connue, dépassée ou du jour, pas encore faite ;
 * - `aDebloquer` : statut `bloque`, quelle que soit l'échéance ;
 * - `aExplorer` : le reste des tâches non faites (pas d'échéance, ou échéance future).
 *
 * Une tâche n'apparaît que dans UNE catégorie (la première qui s'applique, dans cet ordre) —
 * sinon une tâche bloquée et en retard compterait deux fois dans l'accueil.
 */
export function listerTachesPourAccueil(): {
  aujourdhui: TacheAvecDossier[];
  aDebloquer: TacheAvecDossier[];
  aExplorer: TacheAvecDossier[];
} {
  const db = obtenirBase();
  const lignes = db
    .prepare(
      `SELECT t.id, t.dossier_id, t.scenario_id, t.description, t.echeance, t.responsable,
              t.statut, t.source, t.created_at, d.nom AS dossier_nom
       FROM tache t JOIN dossier d ON d.id = t.dossier_id
       WHERE t.statut != 'fait'
       ORDER BY (t.echeance IS NULL), t.echeance, t.created_at`,
    )
    .all() as Array<Parameters<typeof ligneVersTache>[0] & { dossier_nom: string }>;

  const aujourdhuiISO = new Date().toISOString().slice(0, 10);
  const aujourdhui: TacheAvecDossier[] = [];
  const aDebloquer: TacheAvecDossier[] = [];
  const aExplorer: TacheAvecDossier[] = [];

  for (const ligne of lignes) {
    const tache = { ...ligneVersTache(ligne), dossierNom: ligne.dossier_nom };
    if (tache.echeance !== null && tache.echeance <= aujourdhuiISO) {
      aujourdhui.push(tache);
    } else if (tache.statut === "bloque") {
      aDebloquer.push(tache);
    } else {
      aExplorer.push(tache);
    }
  }

  return { aujourdhui, aDebloquer, aExplorer };
}

export function creerTache(params: {
  dossierId: string;
  scenarioId?: string | null;
  description: string;
  echeance?: string | null;
  responsable?: string | null;
}): Tache {
  const description = params.description.trim();
  if (description === "") throw invalide("La description de la tâche est obligatoire.");
  obtenirDossier(params.dossierId);

  if (params.echeance) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.echeance)) {
      throw invalide("L'échéance doit être une date au format AAAA-MM-JJ, ou laissée vide.");
    }
  }

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO tache (id, dossier_id, scenario_id, description, echeance, responsable)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.dossierId,
      params.scenarioId || null,
      description,
      params.echeance || null,
      params.responsable?.trim() || null,
    );
    enregistrerEvenement(db, { nomEntite: "tache", entiteId: id, action: "creation" });
    return obtenirTache(id);
  });
}

export function changerStatutTache(params: { tacheId: string; nouveauStatut: string }): Tache {
  const avant = obtenirTache(params.tacheId);
  if (avant.statut === params.nouveauStatut) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE tache SET statut = ? WHERE id = ?`).run(params.nouveauStatut, params.tacheId);
    enregistrerEvenement(db, {
      nomEntite: "tache",
      entiteId: params.tacheId,
      action: "transition_statut",
      changements: [{ champ: "statut", avant: avant.statut, apres: params.nouveauStatut }],
    });
    return obtenirTache(params.tacheId);
  });
}
