-- Migration 003 — statut par ligne de montant.
--
-- Deux devis concurrents sur un même poste s'additionnaient (limite connue de la V1). Une ligne
-- peut désormais être « écartée » : elle reste visible et tracée, mais ne compte plus dans la
-- synthèse ni dans la comparaison. Passer une ligne à écartée (ou la réactiver) exige un motif,
-- journalisé.

CREATE TABLE IF NOT EXISTS ref_statut_ligne (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_statut_ligne (code, libelle, ordre) VALUES
  ('active',  'Active (compte dans le budget)', 1),
  ('ecartee', 'Écartée (ne compte pas)',        2);

ALTER TABLE ligne_budget ADD COLUMN statut TEXT NOT NULL DEFAULT 'active' REFERENCES ref_statut_ligne (code);
