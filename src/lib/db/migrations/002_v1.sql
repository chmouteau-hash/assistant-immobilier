-- Migration 002 — V1 testable : dossier flexible, provenance partout, droits, documents,
-- dépendances, décisions, assistant IA optionnel.
--
-- Appliquée par client.ts avec `PRAGMA foreign_keys = OFF` (SQLite refuse d'ajouter une colonne
-- `REFERENCES` avec une valeur par défaut non NULL quand les clés étrangères sont actives), puis
-- `PRAGMA foreign_key_check` vérifie l'intégrité avant de les réactiver.
--
-- Règles tenues (voir src/domain/provenance.ts) : toute valeur qui peut être estimée porte
-- `*_source` + `*_confiance` ; une valeur NULL est « à renseigner », jamais 0.

-- 1. Références ----------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_confiance (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_confiance (code, libelle, ordre) VALUES
  ('connu',        'Connu',         1),
  ('estime',       'Estimé',        2),
  ('a_confirmer',  'À confirmer',   3),
  ('a_renseigner', 'À renseigner',  4);

CREATE TABLE IF NOT EXISTS ref_role (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_role (code, libelle, ordre) VALUES
  ('proprietaire',  'Propriétaire du dossier',       1),
  ('contributeur',  'Contributeur',                  2),
  ('lecteur',       'Lecteur',                       3),
  ('professionnel', 'Professionnel (accès limité)',  4);

CREATE TABLE IF NOT EXISTS ref_type_projet (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_type_projet (code, libelle, ordre) VALUES
  ('travaux_cibles',     'Travaux ciblés (une pièce, une terrasse…)', 1),
  ('recherche_bien',     'Recherche d''un bien',                       2),
  ('bien_acquis',        'Bien déjà acquis à transformer',             3),
  ('construction_neuve', 'Construction neuve',                         4),
  ('projet_collectif',   'Projet collectif ou via société',            5);

CREATE TABLE IF NOT EXISTS ref_stade (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_stade (code, libelle, ordre) VALUES
  ('idee',        'Idée',                     1),
  ('recherche',   'Recherche',                2),
  ('verification','Vérification / faisabilité', 3),
  ('conception',  'Conception',               4),
  ('achat',       'Achat',                    5),
  ('chiffrage',   'Chiffrage',                6),
  ('travaux',     'Travaux',                  7),
  ('reception',   'Réception / clôture',      8);

CREATE TABLE IF NOT EXISTS ref_type_lieu (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_type_lieu (code, libelle, ordre) VALUES
  ('bien_candidat', 'Bien candidat (annonce, visite)', 1),
  ('bien_acquis',   'Bien acquis',                     2),
  ('terrain',       'Terrain',                         3);

CREATE TABLE IF NOT EXISTS ref_statut_idee (
  code      TEXT PRIMARY KEY,
  libelle   TEXT NOT NULL,
  ordre     INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO ref_statut_idee (code, libelle, ordre) VALUES
  ('idee',      'Idée',       1),
  ('a_etudier', 'À étudier',  2),
  ('retenue',   'Retenue',    3),
  ('ecartee',   'Écartée',    4);

CREATE TABLE IF NOT EXISTS ref_type_document (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_type_document (code, libelle, ordre) VALUES
  ('devis',       'Devis',                1),
  ('facture',     'Facture',              2),
  ('plan',        'Plan',                 3),
  ('photo',       'Photo',                4),
  ('courrier',    'Courrier',             5),
  ('diagnostic',  'Diagnostic',           6),
  ('annonce',     'Annonce',              7),
  ('acte',        'Document d''achat',    8),
  ('autre',       'Autre',                9);

CREATE TABLE IF NOT EXISTS ref_statut_extraction (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_statut_extraction (code, libelle, ordre) VALUES
  ('proposee', 'Proposée (à valider)', 1),
  ('validee',  'Validée',              2),
  ('corrigee', 'Corrigée puis validée',3),
  ('rejetee',  'Rejetée',              4);

CREATE TABLE IF NOT EXISTS ref_statut_hypothese (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_statut_hypothese (code, libelle, ordre) VALUES
  ('a_valider', 'À valider', 1),
  ('validee',   'Validée',   2),
  ('invalidee', 'Invalidée', 3);

INSERT OR IGNORE INTO ref_action_audit (code, libelle, ordre) VALUES
  ('revocation',  'Révocation d''un accès',     5),
  ('validation',  'Validation humaine',         6),
  ('ia_requete',  'Requête à l''assistant IA',  7),
  ('acces_refuse','Accès refusé',               8);

-- 2. Personnes et participations -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS personne (
  id                    TEXT PRIMARY KEY,
  nom                   TEXT NOT NULL,
  email                 TEXT,
  type                  TEXT NOT NULL DEFAULT 'particulier' CHECK (type IN ('particulier', 'professionnel', 'societe')),
  profession            TEXT,
  est_utilisateur_local INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- L'utilisateur local : la personne qui fait tourner l'application sur ce PC. Créée une fois.
INSERT INTO personne (id, nom, est_utilisateur_local)
SELECT 'utilisateur-local', 'Utilisateur local', 1
WHERE NOT EXISTS (SELECT 1 FROM personne WHERE est_utilisateur_local = 1);

CREATE TABLE IF NOT EXISTS participation (
  id           TEXT PRIMARY KEY,
  dossier_id   TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  personne_id  TEXT NOT NULL REFERENCES personne (id),
  role         TEXT NOT NULL REFERENCES ref_role (code),
  perimetre    TEXT NOT NULL DEFAULT '[]', -- JSON : sections visibles (professionnel)
  finalite     TEXT,                        -- pourquoi cet accès (mission du professionnel)
  revoquee_le  TEXT,                        -- NULL = active
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (dossier_id, personne_id)
);
CREATE INDEX IF NOT EXISTS participation_personne_idx ON participation (personne_id);

-- 3. Dossier : type de projet, stade, IA, imprévus ----------------------------------------------

ALTER TABLE dossier ADD COLUMN type_projet TEXT REFERENCES ref_type_projet (code);
ALTER TABLE dossier ADD COLUMN ia_activee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dossier ADD COLUMN ia_perimetre TEXT NOT NULL DEFAULT '[]';  -- JSON : sections transmises
ALTER TABLE dossier ADD COLUMN ia_fournisseur TEXT NOT NULL DEFAULT 'regles_locales';
ALTER TABLE dossier ADD COLUMN taux_imprevus_pour_mille INTEGER NOT NULL DEFAULT 100;

-- Les dossiers créés avant cette migration appartiennent à l'utilisateur local.
INSERT INTO participation (id, dossier_id, personne_id, role)
SELECT lower(hex(randomblob(16))), d.id, p.id, 'proprietaire'
FROM dossier d, personne p
WHERE p.est_utilisateur_local = 1
  AND NOT EXISTS (SELECT 1 FROM participation x WHERE x.dossier_id = d.id AND x.personne_id = p.id);

-- 4. Lieux, bâtiments, pièces -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lieu (
  id                 TEXT PRIMARY KEY,
  dossier_id         TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  nom                TEXT NOT NULL,
  type_lieu          TEXT NOT NULL REFERENCES ref_type_lieu (code),
  adresse            TEXT,  -- NULL = à renseigner
  adresse_source     TEXT REFERENCES ref_source_donnee (code),
  adresse_confiance  TEXT NOT NULL DEFAULT 'a_renseigner' REFERENCES ref_confiance (code),
  parcelle           TEXT,
  description        TEXT,
  source             TEXT NOT NULL DEFAULT 'saisie' REFERENCES ref_source_donnee (code),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((adresse IS NULL AND adresse_confiance = 'a_renseigner' AND adresse_source IS NULL)
      OR (adresse IS NOT NULL AND adresse_confiance != 'a_renseigner' AND adresse_source IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lieu_dossier_idx ON lieu (dossier_id);

CREATE TABLE IF NOT EXISTS batiment (
  id              TEXT PRIMARY KEY,
  dossier_id      TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  lieu_id         TEXT REFERENCES lieu (id) ON DELETE SET NULL,
  nom             TEXT NOT NULL,
  type            TEXT,  -- libre : « bâtiment ancien », « maison bois »…
  usage_actuel    TEXT,
  usage_envisage  TEXT,
  etat            TEXT,  -- libre : « toiture refaite », « à rénover »…
  description     TEXT,
  source          TEXT NOT NULL DEFAULT 'saisie' REFERENCES ref_source_donnee (code),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS batiment_dossier_idx ON batiment (dossier_id);

CREATE TABLE IF NOT EXISTS piece (
  id                  TEXT PRIMARY KEY,
  dossier_id          TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  batiment_id         TEXT NOT NULL REFERENCES batiment (id) ON DELETE CASCADE,
  nom                 TEXT NOT NULL,
  usage               TEXT,
  surface_centiemes   INTEGER,  -- centièmes de m² ; NULL = à renseigner
  surface_source      TEXT REFERENCES ref_source_donnee (code),
  surface_confiance   TEXT NOT NULL DEFAULT 'a_renseigner' REFERENCES ref_confiance (code),
  surface_document_id TEXT,     -- référence souple vers document(id), posée après création
  description         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((surface_centiemes IS NULL AND surface_confiance = 'a_renseigner' AND surface_source IS NULL)
      OR (surface_centiemes IS NOT NULL AND surface_confiance != 'a_renseigner' AND surface_source IS NOT NULL)),
  CHECK (NOT (surface_source = 'estimation' AND surface_confiance = 'connu')),
  CHECK (NOT (surface_source = 'suggestion_ia' AND surface_confiance != 'a_confirmer'))
);
CREATE INDEX IF NOT EXISTS piece_batiment_idx ON piece (batiment_id);

-- 5. Idées et hypothèses ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS idee (
  id           TEXT PRIMARY KEY,
  dossier_id   TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  titre        TEXT NOT NULL,
  description  TEXT,
  statut       TEXT NOT NULL DEFAULT 'idee' REFERENCES ref_statut_idee (code),
  scenario_id  TEXT REFERENCES scenario (id) ON DELETE SET NULL,
  batiment_id  TEXT REFERENCES batiment (id) ON DELETE SET NULL,
  piece_id     TEXT REFERENCES piece (id) ON DELETE SET NULL,
  source       TEXT NOT NULL DEFAULT 'saisie' REFERENCES ref_source_donnee (code),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idee_dossier_idx ON idee (dossier_id);

CREATE TABLE IF NOT EXISTS hypothese (
  id           TEXT PRIMARY KEY,
  dossier_id   TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  scenario_id  TEXT REFERENCES scenario (id) ON DELETE CASCADE,
  idee_id      TEXT REFERENCES idee (id) ON DELETE CASCADE,
  enonce       TEXT NOT NULL,
  statut       TEXT NOT NULL DEFAULT 'a_valider' REFERENCES ref_statut_hypothese (code),
  source       TEXT NOT NULL DEFAULT 'saisie' REFERENCES ref_source_donnee (code),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS hypothese_dossier_idx ON hypothese (dossier_id);

-- 6. Budget : postes, lignes enrichies -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS poste_budget (
  id           TEXT PRIMARY KEY,
  dossier_id   TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  scenario_id  TEXT NOT NULL REFERENCES scenario (id) ON DELETE CASCADE,
  nom          TEXT NOT NULL,
  categorie    TEXT,  -- libre : « gros œuvre », « énergie »…
  batiment_id  TEXT REFERENCES batiment (id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS poste_budget_scenario_idx ON poste_budget (scenario_id);

ALTER TABLE ligne_budget ADD COLUMN poste_id TEXT REFERENCES poste_budget (id) ON DELETE CASCADE;
ALTER TABLE ligne_budget ADD COLUMN confiance TEXT NOT NULL DEFAULT 'estime' REFERENCES ref_confiance (code);
ALTER TABLE ligne_budget ADD COLUMN document_id TEXT;   -- référence souple vers document(id)
ALTER TABLE ligne_budget ADD COLUMN date_piece TEXT;    -- date du devis / de la facture
ALTER TABLE ligne_budget ADD COLUMN fournisseur TEXT;

-- Les lignes créées avant la migration portaient un « poste » texte libre : on en fait des
-- postes à part entière, un par (scénario, nom).
INSERT INTO poste_budget (id, dossier_id, scenario_id, nom)
SELECT lower(hex(randomblob(16))), s.dossier_id, lb.scenario_id, lb.poste
FROM (SELECT DISTINCT scenario_id, poste FROM ligne_budget WHERE poste_id IS NULL) lb
JOIN scenario s ON s.id = lb.scenario_id;

UPDATE ligne_budget
SET poste_id = (SELECT p.id FROM poste_budget p WHERE p.scenario_id = ligne_budget.scenario_id AND p.nom = ligne_budget.poste)
WHERE poste_id IS NULL;

-- Une ancienne ligne de type « estimation » est bien « estimée » ; les autres étaient saisies à la main.
UPDATE ligne_budget SET confiance = 'connu' WHERE type_montant != 'estimation' AND source = 'saisie';

-- 7. Documents et extraction -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS document (
  id              TEXT PRIMARY KEY,
  dossier_id      TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  nom_original    TEXT NOT NULL,
  type_document   TEXT NOT NULL REFERENCES ref_type_document (code),
  mime            TEXT NOT NULL,
  taille_octets   INTEGER NOT NULL,
  sha256          TEXT NOT NULL,
  chemin_relatif  TEXT NOT NULL,   -- sous data/fichiers/, jamais un chemin absolu
  date_document   TEXT,            -- date portée par la pièce (facture du…), NULL si inconnue
  source          TEXT NOT NULL DEFAULT 'import' REFERENCES ref_source_donnee (code),
  lieu_id         TEXT REFERENCES lieu (id) ON DELETE SET NULL,
  batiment_id     TEXT REFERENCES batiment (id) ON DELETE SET NULL,
  piece_id        TEXT REFERENCES piece (id) ON DELETE SET NULL,
  scenario_id     TEXT REFERENCES scenario (id) ON DELETE SET NULL,
  poste_id        TEXT REFERENCES poste_budget (id) ON DELETE SET NULL,
  idee_id         TEXT REFERENCES idee (id) ON DELETE SET NULL,
  tache_id        TEXT REFERENCES tache (id) ON DELETE SET NULL,
  note            TEXT,
  depose_par      TEXT REFERENCES personne (id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS document_dossier_idx ON document (dossier_id);

-- Champs lus sur un document (montant, date, fournisseur, poste) : proposés, puis validés ou
-- corrigés par un humain. Rien n'entre au budget tant que le statut n'est pas validé/corrigé.
CREATE TABLE IF NOT EXISTS extraction_document (
  id               TEXT PRIMARY KEY,
  document_id      TEXT NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  champ            TEXT NOT NULL CHECK (champ IN ('montant_centimes', 'date', 'fournisseur', 'poste', 'type_montant')),
  valeur_proposee  TEXT,
  valeur_validee   TEXT,
  source           TEXT NOT NULL REFERENCES ref_source_donnee (code),  -- saisie (lecture humaine) ou suggestion_ia
  confiance        TEXT NOT NULL DEFAULT 'a_confirmer' REFERENCES ref_confiance (code),
  statut           TEXT NOT NULL DEFAULT 'proposee' REFERENCES ref_statut_extraction (code),
  validee_par      TEXT REFERENCES personne (id),
  validee_le       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS extraction_document_idx ON extraction_document (document_id);

-- 8. Actions : jalons, responsable, dépendances ---------------------------------------------------

ALTER TABLE tache ADD COLUMN est_jalon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tache ADD COLUMN responsable_personne_id TEXT REFERENCES personne (id);

CREATE TABLE IF NOT EXISTS dependance_tache (
  tache_id      TEXT NOT NULL REFERENCES tache (id) ON DELETE CASCADE,
  depend_de_id  TEXT NOT NULL REFERENCES tache (id) ON DELETE CASCADE,
  PRIMARY KEY (tache_id, depend_de_id),
  CHECK (tache_id != depend_de_id)
);

-- 9. Décisions et sources --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS decision (
  id                     TEXT PRIMARY KEY,
  dossier_id             TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  scenario_id            TEXT REFERENCES scenario (id) ON DELETE SET NULL,
  idee_id                TEXT REFERENCES idee (id) ON DELETE SET NULL,
  choix                  TEXT NOT NULL,
  motif                  TEXT NOT NULL,
  alternatives_ecartees  TEXT,
  conditions_ouvertes    TEXT,
  decide_par             TEXT REFERENCES personne (id),
  date_decision          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS decision_dossier_idx ON decision (dossier_id);

CREATE TABLE IF NOT EXISTS source_reference (
  id                 TEXT PRIMARY KEY,
  dossier_id         TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  titre              TEXT NOT NULL,
  organisme          TEXT,
  url                TEXT,
  date_source        TEXT,
  date_consultation  TEXT,
  note               TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 10. Assistant IA : journal des échanges ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS ia_echange (
  id           TEXT PRIMARY KEY,
  dossier_id   TEXT NOT NULL REFERENCES dossier (id) ON DELETE CASCADE,
  acteur_id    TEXT REFERENCES personne (id),
  fournisseur  TEXT NOT NULL,
  modele       TEXT,
  question     TEXT NOT NULL,
  perimetre    TEXT NOT NULL,  -- JSON : sections transmises
  reponse      TEXT NOT NULL,  -- JSON : ReponseIA complète (sources, incertitude…)
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ia_echange_dossier_idx ON ia_echange (dossier_id);

-- 11. Audit : qui, sur quel dossier -----------------------------------------------------------------

ALTER TABLE audit_evenement ADD COLUMN acteur_id TEXT;
ALTER TABLE audit_evenement ADD COLUMN dossier_id TEXT;
CREATE INDEX IF NOT EXISTS audit_evenement_dossier_idx ON audit_evenement (dossier_id, dt_evenement DESC);
