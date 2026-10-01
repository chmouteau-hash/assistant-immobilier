// Écriture du journal d'audit — point d'écriture unique (voir schema.sql pour la garantie
// d'ajout seul, tenue par un déclencheur, pas par ce module).
//
// Toute fonction qui modifie une entité importante (changer le statut d'un scénario, par
// exemple) appelle `enregistrerEvenement` **dans la même transaction** que l'écriture
// métier — voir `transaction()` dans client.ts.

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export type ChangementChamp = {
  champ: string;
  avant: string | number | null;
  apres: string | number | null;
};

export type ActionAudit = "creation" | "modification" | "transition_statut" | "suppression";

export function enregistrerEvenement(
  db: DatabaseSync,
  params: {
    nomEntite: string;
    entiteId: string;
    action: ActionAudit;
    motif?: string;
    changements?: ChangementChamp[];
  },
): void {
  db.prepare(
    `INSERT INTO audit_evenement (id, nom_entite, entite_id, action, motif, changements)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    params.nomEntite,
    params.entiteId,
    params.action,
    params.motif ?? null,
    params.changements ? JSON.stringify(params.changements) : null,
  );
}

export type EvenementAudit = {
  id: string;
  nomEntite: string;
  entiteId: string;
  action: string;
  motif: string | null;
  changements: ChangementChamp[] | null;
  dtEvenement: string;
};

/** Historique d'une entité précise, du plus récent au plus ancien. */
export function historiqueDe(db: DatabaseSync, nomEntite: string, entiteId: string): EvenementAudit[] {
  const lignes = db
    .prepare(
      `SELECT id, nom_entite, entite_id, action, motif, changements, dt_evenement
       FROM audit_evenement
       WHERE nom_entite = ? AND entite_id = ?
       ORDER BY dt_evenement DESC`,
    )
    .all(nomEntite, entiteId) as Array<{
    id: string;
    nom_entite: string;
    entite_id: string;
    action: string;
    motif: string | null;
    changements: string | null;
    dt_evenement: string;
  }>;

  return lignes.map((ligne) => ({
    id: ligne.id,
    nomEntite: ligne.nom_entite,
    entiteId: ligne.entite_id,
    action: ligne.action,
    motif: ligne.motif,
    changements: ligne.changements ? JSON.parse(ligne.changements) : null,
    dtEvenement: ligne.dt_evenement,
  }));
}
