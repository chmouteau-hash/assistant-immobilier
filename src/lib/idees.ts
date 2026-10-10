// Idées — carnet libre (« terrasse », « piscine intérieure », « puits canadien »…), chacune avec
// un statut idée / à étudier / retenue / écartée, rattachable à un scénario, un bâtiment ou une
// pièce. Passer à « retenue » ou « écartée » demande un motif et crée une décision.

import { randomUUID } from "node:crypto";
import { obtenirBase, transaction, versObjet, versObjets } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { exiger, type Acteur } from "./acces";
import { interdit, invalide } from "./erreurs";
import { estSource } from "../domain/provenance";

export type Idee = {
  id: string;
  dossierId: string;
  titre: string;
  description: string | null;
  statut: string;
  scenarioId: string | null;
  batimentId: string | null;
  pieceId: string | null;
  source: string;
  createdAt: string;
};

const COLONNES = `id, dossier_id, titre, description, statut, scenario_id, batiment_id, piece_id, source, created_at`;

function lireBrut(id: string): Idee {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES} FROM idee WHERE id = ?`).get(id);
  if (!ligne) throw interdit();
  return versObjet<Idee>(ligne as Record<string, unknown>);
}

export function listerIdees(acteur: Acteur, dossierId: string): Idee[] {
  exiger(acteur, dossierId, "lire", "idees");
  return versObjets<Idee>(obtenirBase().prepare(`SELECT ${COLONNES} FROM idee WHERE dossier_id = ? ORDER BY created_at`).all(dossierId));
}

function verifierAppartenance(db: ReturnType<typeof obtenirBase>, table: "scenario" | "batiment" | "piece", id: string | null | undefined, dossierId: string): string | null {
  if (!id) return null;
  const ligne = db.prepare(`SELECT dossier_id FROM ${table} WHERE id = ?`).get(id) as { dossier_id: string } | undefined;
  if (!ligne || ligne.dossier_id !== dossierId) throw invalide(`L'élément rattaché (${table}) n'appartient pas à ce dossier.`);
  return id;
}

export function creerIdee(
  acteur: Acteur,
  params: {
    dossierId: string;
    titre: string;
    description?: string;
    scenarioId?: string | null;
    batimentId?: string | null;
    pieceId?: string | null;
    source?: string;
  },
): Idee {
  exiger(acteur, params.dossierId, "ecrire", "idees");
  const titre = params.titre.trim();
  if (titre === "") throw invalide("Le titre de l'idée est obligatoire.");
  const source = params.source && estSource(params.source) ? params.source : "saisie";

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO idee (id, dossier_id, titre, description, scenario_id, batiment_id, piece_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      params.dossierId,
      titre,
      params.description?.trim() || null,
      verifierAppartenance(db, "scenario", params.scenarioId, params.dossierId),
      verifierAppartenance(db, "batiment", params.batimentId, params.dossierId),
      verifierAppartenance(db, "piece", params.pieceId, params.dossierId),
      source,
    );
    enregistrerEvenement(db, { nomEntite: "idee", entiteId: id, action: "creation", acteurId: acteur.personneId, dossierId: params.dossierId });
    return lireBrut(id);
  });
}

export function changerStatutIdee(acteur: Acteur, params: { ideeId: string; nouveauStatut: string; motif: string }): Idee {
  const avant = lireBrut(params.ideeId);
  exiger(acteur, avant.dossierId, "ecrire", "idees");
  const motif = params.motif.trim();
  const decisionnel = params.nouveauStatut === "retenue" || params.nouveauStatut === "ecartee";
  if (decisionnel && motif === "") throw invalide("Un motif est obligatoire pour retenir ou écarter une idée.");
  if (avant.statut === params.nouveauStatut) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE idee SET statut = ? WHERE id = ?`).run(params.nouveauStatut, params.ideeId);
    enregistrerEvenement(db, {
      nomEntite: "idee",
      entiteId: params.ideeId,
      action: "transition_statut",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      motif: motif || undefined,
      changements: [{ champ: "statut", avant: avant.statut, apres: params.nouveauStatut }],
    });
    if (decisionnel) {
      const decisionId = randomUUID();
      db.prepare(`INSERT INTO decision (id, dossier_id, idee_id, choix, motif, decide_par) VALUES (?, ?, ?, ?, ?, ?)`).run(
        decisionId,
        avant.dossierId,
        params.ideeId,
        `Idée « ${avant.titre} » ${params.nouveauStatut === "retenue" ? "retenue" : "écartée"}`,
        motif,
        acteur.personneId,
      );
      enregistrerEvenement(db, { nomEntite: "decision", entiteId: decisionId, action: "creation", acteurId: acteur.personneId, dossierId: avant.dossierId, motif });
    }
    return lireBrut(params.ideeId);
  });
}

export function rattacherIdee(acteur: Acteur, params: { ideeId: string; scenarioId: string | null }): Idee {
  const avant = lireBrut(params.ideeId);
  exiger(acteur, avant.dossierId, "ecrire", "idees");
  return transaction((db) => {
    const scenarioId = verifierAppartenance(db, "scenario", params.scenarioId, avant.dossierId);
    db.prepare(`UPDATE idee SET scenario_id = ? WHERE id = ?`).run(scenarioId, params.ideeId);
    enregistrerEvenement(db, {
      nomEntite: "idee",
      entiteId: params.ideeId,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      changements: [{ champ: "scenario_id", avant: avant.scenarioId, apres: scenarioId }],
    });
    return lireBrut(params.ideeId);
  });
}
