-- Migration 007 — prix demandé et statut d'un bien (issue #2, bloc « Bien »).
--
-- Le prix demandé est une valeur tracée, comme l'adresse ou la surface d'une pièce : montant en
-- CENTIMES entiers, source et confiance, « à renseigner » tant qu'il n'est pas connu. Le prix lu
-- sur une annonce est une source externe : au mieux « à confirmer » (domain/provenance.ts).
--
-- Le statut suit le bien de la recherche à l'achat : repéré, visité, offre faite, écarté, acquis
-- (DECISIONS.md, 2026-10-28). Il est « à renseigner » (NULL) tant qu'on ne l'a pas dit : on ne
-- devine pas si un bien déjà saisi a été visité. Un lieu du type « Bien acquis » est acquis.
--
-- Le type « Bien acquis » et le statut « acquis » disent la même chose : ils ne doivent pas se
-- contredire. Un bien acquis a le statut « acquis » ; un bien candidat ne l'a jamais (l'acquérir
-- le range en « Bien acquis », lib/structure.ts). Un terrain peut avoir n'importe quel statut :
-- son type dit sa nature, pas l'étape de l'achat. La règle est dans domain/bien.ts et redite ici.
-- Elle passe par des déclencheurs, pas par un CHECK : SQLite (3.53) vérifie le CHECK d'une colonne
-- ajoutée sur toutes les lignes existantes, avant que l'UPDATE ci-dessous ait pu les mettre en règle.

CREATE TABLE IF NOT EXISTS ref_statut_bien (
  code    TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ref_statut_bien (code, libelle, ordre) VALUES
  ('repere',      'Repéré',      1),
  ('visite',      'Visité',      2),
  ('offre_faite', 'Offre faite', 3),
  ('ecarte',      'Écarté',      4),
  ('acquis',      'Acquis',      5);

ALTER TABLE lieu ADD COLUMN prix_demande_centimes INTEGER
  CHECK (prix_demande_centimes IS NULL OR prix_demande_centimes > 0);
ALTER TABLE lieu ADD COLUMN prix_demande_source TEXT REFERENCES ref_source_donnee (code);
ALTER TABLE lieu ADD COLUMN prix_demande_confiance TEXT NOT NULL DEFAULT 'a_renseigner' REFERENCES ref_confiance (code)
  CHECK ((prix_demande_centimes IS NULL AND prix_demande_confiance = 'a_renseigner' AND prix_demande_source IS NULL)
      OR (prix_demande_centimes IS NOT NULL AND prix_demande_confiance != 'a_renseigner' AND prix_demande_source IS NOT NULL))
  CHECK (NOT (prix_demande_source = 'estimation' AND prix_demande_confiance = 'connu'))
  CHECK (NOT (prix_demande_source = 'suggestion_ia' AND prix_demande_confiance != 'a_confirmer'))
  CHECK (NOT (prix_demande_source = 'source_externe' AND prix_demande_confiance = 'connu'));

ALTER TABLE lieu ADD COLUMN statut_bien TEXT REFERENCES ref_statut_bien (code);
UPDATE lieu SET statut_bien = 'acquis' WHERE type_lieu = 'bien_acquis';

CREATE TRIGGER IF NOT EXISTS lieu_statut_bien_coherent_creation
BEFORE INSERT ON lieu
WHEN (NEW.type_lieu = 'bien_acquis' AND NEW.statut_bien IS NOT 'acquis')
  OR (NEW.type_lieu = 'bien_candidat' AND NEW.statut_bien IS 'acquis')
BEGIN
  SELECT RAISE(ABORT, 'Un bien acquis a le statut « acquis », un bien candidat ne l''a jamais.');
END;

CREATE TRIGGER IF NOT EXISTS lieu_statut_bien_coherent_modification
BEFORE UPDATE OF type_lieu, statut_bien ON lieu
WHEN (NEW.type_lieu = 'bien_acquis' AND NEW.statut_bien IS NOT 'acquis')
  OR (NEW.type_lieu = 'bien_candidat' AND NEW.statut_bien IS 'acquis')
BEGIN
  SELECT RAISE(ABORT, 'Un bien acquis a le statut « acquis », un bien candidat ne l''a jamais.');
END;
