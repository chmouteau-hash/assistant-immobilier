// Export complet d'un dossier — portabilité (RGPD art. 20) et sauvegarde lisible.
//
// Produit une archive ZIP (archiveur maison, `src/lib/zip.ts`) contenant :
//   - dossier.json : toutes les données du dossier, table par table, telles qu'en base ;
//   - fichiers/<id>.<ext> : les originaux déposés (nommés par identifiant, comme sur le disque) ;
//   - LISEZMOI.txt : ce que contient l'archive et comment relire le JSON.
// Réservé au propriétaire (action `exporter`) : l'archive contient aussi les droits et le journal.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cheminFichiers, obtenirBase, versObjets } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { exiger, participationsDe, type Acteur } from "./acces";
import { obtenirDossier } from "./dossiers";
import { creerZip, type EntreeZip } from "./zip";

type Table = Record<string, unknown>[];

function lire(sql: string, ...params: Array<string | number>): Table {
  return versObjets<Record<string, unknown>>(obtenirBase().prepare(sql).all(...params));
}

export type ExportDossier = {
  format: { nom: string; version: number; exporteLe: string; schemaVersion: number | null };
  dossier: Record<string, unknown>;
  participations: Table;
  personnes: Table;
  lieux: Table;
  batiments: Table;
  pieces: Table;
  idees: Table;
  scenarios: Table;
  hypotheses: Table;
  postesBudget: Table;
  lignesBudget: Table;
  documents: Table;
  extractions: Table;
  taches: Table;
  dependances: Table;
  decisions: Table;
  sources: Table;
  echangesIA: Table;
  journalAudit: Table;
};

export function construireExport(acteur: Acteur, dossierId: string): ExportDossier {
  exiger(acteur, dossierId, "exporter", "identite");
  const db = obtenirBase();
  const dossier = obtenirDossier(acteur, dossierId);
  const schema = (db.prepare(`SELECT MAX(version) AS v FROM schema_migration`).get() as { v: number | null }).v;
  const participations = participationsDe(db, dossierId);

  return {
    format: { nom: "assistant-immobilier/export-dossier", version: 1, exporteLe: new Date().toISOString(), schemaVersion: schema },
    dossier: { ...dossier },
    participations: participations.map((p) => ({ ...p })),
    personnes: lire(`SELECT id, nom, email, type, profession FROM personne WHERE id IN (SELECT personne_id FROM participation WHERE dossier_id = ?)`, dossierId),
    lieux: lire(`SELECT * FROM lieu WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    batiments: lire(`SELECT * FROM batiment WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    pieces: lire(`SELECT * FROM piece WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    idees: lire(`SELECT * FROM idee WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    scenarios: lire(`SELECT * FROM scenario WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    hypotheses: lire(`SELECT * FROM hypothese WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    postesBudget: lire(`SELECT * FROM poste_budget WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    lignesBudget: lire(`SELECT * FROM ligne_budget WHERE scenario_id IN (SELECT id FROM scenario WHERE dossier_id = ?) ORDER BY created_at`, dossierId),
    documents: lire(`SELECT * FROM document WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    extractions: lire(`SELECT * FROM extraction_document WHERE document_id IN (SELECT id FROM document WHERE dossier_id = ?) ORDER BY created_at`, dossierId),
    taches: lire(`SELECT * FROM tache WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    dependances: lire(`SELECT d.* FROM dependance_tache d JOIN tache t ON t.id = d.tache_id WHERE t.dossier_id = ?`, dossierId),
    decisions: lire(`SELECT * FROM decision WHERE dossier_id = ? ORDER BY date_decision`, dossierId),
    sources: lire(`SELECT * FROM source_reference WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    echangesIA: lire(`SELECT * FROM ia_echange WHERE dossier_id = ? ORDER BY created_at`, dossierId),
    journalAudit: lire(`SELECT * FROM audit_evenement WHERE dossier_id = ? ORDER BY dt_evenement`, dossierId),
  };
}

const LISEZMOI = `Export d'un dossier — Assistant immobilier

Contenu :
- dossier.json : toutes les données du dossier, table par table (noms de colonnes en camelCase).
  Montants en centimes d'euro (entiers), surfaces en centièmes de m², dates ISO.
  Chaque donnée sensible porte sa source (saisie, import, estimation, source_externe, suggestion_ia)
  et sa confiance (connu, estime, a_confirmer, a_renseigner). Une valeur null = « à renseigner ».
- fichiers/ : les documents et photos déposés, nommés par identifiant. La correspondance avec le
  nom d'origine, le type et le rattachement est dans dossier.json → documents (cheminRelatif).
- journalAudit (dans dossier.json) : qui a changé quoi, quand, pourquoi.

Cette archive contient des données personnelles : à conserver sur un support privé.
`;

/** Archive ZIP complète du dossier. Les fichiers absents du disque sont signalés dans le JSON. */
export function exporterDossierZip(acteur: Acteur, dossierId: string): { nomFichier: string; archive: Buffer } {
  const exporte = construireExport(acteur, dossierId);
  const entrees: EntreeZip[] = [];
  const manquants: string[] = [];
  for (const d of exporte.documents) {
    const relatif = String(d.cheminRelatif);
    const absolu = path.join(cheminFichiers(), relatif);
    if (!existsSync(absolu)) {
      manquants.push(relatif);
      continue;
    }
    entrees.push({ nom: `fichiers/${path.basename(relatif)}`, contenu: readFileSync(absolu), date: new Date(String(d.createdAt)) });
  }
  const json = { ...exporte, fichiersManquants: manquants };
  entrees.unshift(
    { nom: "LISEZMOI.txt", contenu: Buffer.from(LISEZMOI, "utf8") },
    { nom: "dossier.json", contenu: Buffer.from(JSON.stringify(json, null, 2), "utf8") },
  );

  enregistrerEvenement(obtenirBase(), {
    nomEntite: "dossier",
    entiteId: dossierId,
    action: "modification",
    acteurId: acteur.personneId,
    dossierId,
    motif: `Export complet (${exporte.documents.length} document(s), ${manquants.length} manquant(s))`,
  });

  const nomSur = String(exporte.dossier.nom).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "dossier";
  const date = exporte.format.exporteLe.slice(0, 10);
  return { nomFichier: `export-${nomSur}-${date}.zip`, archive: creerZip(entrees) };
}
