// Écriture du journal d'audit — point d'écriture unique (voir migrations/001_base.sql pour la
// garantie d'ajout seul, tenue par un déclencheur, pas par ce module).
//
// Toute fonction qui modifie une décision, un budget ou une provenance appelle
// `enregistrerEvenement` **dans la même transaction** que l'écriture métier — voir
// `transaction()` dans client.ts. Depuis la V1, chaque événement porte l'acteur et le dossier.

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { versObjets } from "./client";

export type ChangementChamp = {
  champ: string;
  avant: string | number | null;
  apres: string | number | null;
};

export type ActionAudit =
  | "creation"
  | "modification"
  | "transition_statut"
  | "suppression"
  | "revocation"
  | "validation"
  | "ia_requete"
  | "acces_refuse";

export function enregistrerEvenement(
  db: DatabaseSync,
  params: {
    nomEntite: string;
    entiteId: string;
    action: ActionAudit;
    acteurId: string | null;
    dossierId: string | null;
    motif?: string;
    changements?: ChangementChamp[];
  },
): void {
  db.prepare(
    `INSERT INTO audit_evenement (id, nom_entite, entite_id, action, motif, changements, acteur_id, dossier_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    params.nomEntite,
    params.entiteId,
    params.action,
    params.motif ?? null,
    params.changements ? JSON.stringify(params.changements) : null,
    params.acteurId,
    params.dossierId,
  );
}

export type EvenementAudit = {
  id: string;
  nomEntite: string;
  entiteId: string;
  action: string;
  motif: string | null;
  changements: ChangementChamp[] | null;
  acteurId: string | null;
  dossierId: string | null;
  dtEvenement: string;
};

const COLONNES = `id, nom_entite, entite_id, action, motif, changements, acteur_id, dossier_id, dt_evenement`;

function hydrater(lignes: unknown[]): EvenementAudit[] {
  return versObjets<Omit<EvenementAudit, "changements"> & { changements: string | null }>(lignes).map((e) => ({
    ...e,
    changements: e.changements ? (JSON.parse(e.changements) as ChangementChamp[]) : null,
  }));
}

/** Historique d'une entité précise, du plus récent au plus ancien. */
export function historiqueDe(db: DatabaseSync, nomEntite: string, entiteId: string): EvenementAudit[] {
  return hydrater(
    db
      .prepare(`SELECT ${COLONNES} FROM audit_evenement WHERE nom_entite = ? AND entite_id = ? ORDER BY dt_evenement DESC`)
      .all(nomEntite, entiteId),
  );
}

/** Journal complet d'un dossier, du plus récent au plus ancien. */
export function journalDossier(db: DatabaseSync, dossierId: string, limite = 200): EvenementAudit[] {
  return hydrater(
    db
      .prepare(`SELECT ${COLONNES} FROM audit_evenement WHERE dossier_id = ? ORDER BY dt_evenement DESC LIMIT ?`)
      .all(dossierId, limite),
  );
}
