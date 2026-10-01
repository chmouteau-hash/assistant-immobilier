-- Schéma de la base locale (SQLite, fichier unique sur le PC — jamais de serveur distant).
--
-- Quatre règles tenues dès ce premier schéma, parce qu'aucune des quatre ne s'ajoute proprement
-- après coup (il faudrait réécrire toutes les tables et toutes les écritures existantes) :
--
-- 1. Statuts en table de référence (`ref_*`), jamais figés dans le code TypeScript. Les statuts
--    de scénario bougeront à l'usage (le cadrage le dit lui-même : « idée », « à étudier »,
--    « retenue », « écartée » sont encore provisoires) — en changer un ne doit pas demander de
--    toucher au code.
-- 2. Chaque donnée importante porte sa provenance (`source`), conformément au principe 3 du
--    cadrage : « chaque donnée importante indique son origine ». Une estimation ne doit jamais
--    se lire comme une donnée certaine.
-- 3. Journal d'audit en ajout seul (`audit_evenement`) : qui a changé quoi, quand, pourquoi.
--    Garanti par un déclencheur SQLite, pas par la discipline du code applicatif.
-- 4. Montants en centimes (entiers), jamais en nombre à virgule flottante — un flottant ne
--    tombe pas juste sur une somme de lignes, et un budget comparé entre scénarios doit tomber
--    juste.

PRAGMA foreign_keys = ON;

-- 1. Références -------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_statut_scenario (
  code      TEXT PRIMARY KEY,
  libelle   TEXT NOT NULL,
  ordre     INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO ref_statut_scenario (code, libelle, ordre) VALUES
  ('idee',       'Idée',        1),
  ('a_etudier',  'À étudier',   2),
  ('retenue',    'Retenue',     3),
  ('ecartee',    'Écartée',     4);

CREATE TABLE IF NOT EXISTS ref_source_donnee (
  code      TEXT PRIMARY KEY,
  libelle   TEXT NOT NULL,
  ordre     INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO ref_source_donnee (code, libelle, ordre) VALUES
  ('saisie',        'Saisie manuelle',              1),
  ('import',        'Document importé',             2),
  ('estimation',     'Estimation',                   3),
  ('source_externe', 'Source externe (annonce, pro)',4),
  ('suggestion_ia',  'Suggestion de l''IA',          5);

CREATE TABLE IF NOT EXISTS ref_type_montant (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO ref_type_montant (code, libelle, ordre) VALUES
  ('estimation', 'Estimation',  1),
  ('devis',      'Devis',       2),
  ('engagement', 'Engagement',  3),
  ('facture',    'Facture',     4),
  ('paiement',   'Paiement',    5);

CREATE TABLE IF NOT EXISTS ref_action_audit (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO ref_action_audit (code, libelle, ordre) VALUES
  ('creation',          'Création',             1),
  ('modification',      'Modification',         2),
  ('transition_statut',  'Transition de statut', 3),
  ('suppression',       'Suppression',          4);

CREATE TABLE IF NOT EXISTS ref_statut_tache (
  code      TEXT PRIMARY KEY,
  libelle   TEXT NOT NULL,
  ordre     INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO ref_statut_tache (code, libelle, ordre) VALUES
  ('a_faire',  'À faire',  1),
  ('en_cours', 'En cours', 2),
  ('bloque',   'Bloquée',  3),
  ('fait',     'Faite',    4);

-- 2. Dossier et scénarios -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dossier (
  id          TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  objectif    TEXT,
  stade       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS scenario (
  id           TEXT PRIMARY KEY,
  dossier_id   TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  nom          TEXT NOT NULL,
  description  TEXT,
  statut       TEXT NOT NULL DEFAULT 'idee' REFERENCES ref_statut_scenario (code),
  source       TEXT NOT NULL DEFAULT 'saisie' REFERENCES ref_source_donnee (code),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS scenario_dossier_idx ON scenario (dossier_id);

-- 3. Budget ---------------------------------------------------------------------------------
--
-- `montant_centimes` : entier, jamais de virgule flottante (règle 4 ci-dessus). 125000 = 1 250,00 €.

CREATE TABLE IF NOT EXISTS ligne_budget (
  id                TEXT PRIMARY KEY,
  scenario_id       TEXT NOT NULL REFERENCES scenario (id) ON DELETE CASCADE,
  poste             TEXT NOT NULL,
  montant_centimes  INTEGER NOT NULL,
  type_montant      TEXT NOT NULL REFERENCES ref_type_montant (code),
  source            TEXT NOT NULL DEFAULT 'estimation' REFERENCES ref_source_donnee (code),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ligne_budget_scenario_idx ON ligne_budget (scenario_id);

-- 4. Tâches -----------------------------------------------------------------------------------
--
-- Rattachée à un dossier, et à un scénario seulement quand elle en dépend (principe 1 du
-- cadrage : un dossier peut sauter la comparaison de scénarios, ex. « chambre à refaire »).
-- `echeance` reste NULL tant qu'elle n'est pas connue — principe 5 du cadrage : « elle n'invente
-- pas de date ». Pas de champ `depend_de` dans cette première version : les dépendances entre
-- tâches demandent de savoir, à l'usage, ce qu'on veut en faire (liste simple ? graphe ?) — voir
-- DECISIONS.md.

CREATE TABLE IF NOT EXISTS tache (
  id           TEXT PRIMARY KEY,
  dossier_id   TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  scenario_id  TEXT REFERENCES scenario (id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  echeance     TEXT, -- date ISO (YYYY-MM-DD) ou NULL si inconnue
  responsable  TEXT,
  statut       TEXT NOT NULL DEFAULT 'a_faire' REFERENCES ref_statut_tache (code),
  source       TEXT NOT NULL DEFAULT 'saisie' REFERENCES ref_source_donnee (code),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS tache_dossier_idx ON tache (dossier_id);
CREATE INDEX IF NOT EXISTS tache_echeance_idx ON tache (echeance);

-- 5. Journal d'audit (ajout seul) ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_evenement (
  id           TEXT PRIMARY KEY,
  nom_entite   TEXT NOT NULL,
  entite_id    TEXT NOT NULL,
  action       TEXT NOT NULL REFERENCES ref_action_audit (code),
  motif        TEXT,
  changements  TEXT, -- JSON : [{champ, avant, apres}]
  dt_evenement TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS audit_evenement_entite_idx
  ON audit_evenement (nom_entite, entite_id, dt_evenement DESC);

-- Garantie en base, pas dans le code : aucun appelant, présent ou futur, ne peut modifier ni
-- supprimer un événement déjà écrit. Reprend le trigger `audit_evenement_append_only`
-- d'Ergonomia (PostgreSQL), traduit ici en SQLite.
CREATE TRIGGER IF NOT EXISTS audit_evenement_pas_de_modification
BEFORE UPDATE ON audit_evenement
BEGIN
  SELECT RAISE(ABORT, 'Le journal d''audit est en ajout seul (aucune modification).');
END;

CREATE TRIGGER IF NOT EXISTS audit_evenement_pas_de_suppression
BEFORE DELETE ON audit_evenement
BEGIN
  SELECT RAISE(ABORT, 'Le journal d''audit est en ajout seul (aucune suppression).');
END;
