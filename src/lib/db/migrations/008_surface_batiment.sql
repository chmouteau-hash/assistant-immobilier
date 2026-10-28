-- Migration 008 — surface d'un bâtiment (issue #2, bloc « Bâtiment »).
--
-- Un bâtiment a sa propre surface, comme une pièce : valeur tracée en CENTIÈMES de m² entiers,
-- source et confiance, « à renseigner » tant qu'elle n'est pas connue. Elle ne se calcule pas à
-- partir des pièces : une surface d'annonce ou de plan n'est pas la somme des pièces saisies, et
-- l'écran montre les deux côte à côte (DECISIONS.md, 2026-10-28).
--
-- Mêmes contraintes que la surface d'une pièce (migration 002), plus deux que le domaine pose déjà
-- (domain/provenance.ts) : une surface est positive, et une source externe n'est jamais « connue ».
-- Les bâtiments déjà saisis restent « à renseigner » : les valeurs par défaut passent les CHECK.

ALTER TABLE batiment ADD COLUMN surface_centiemes INTEGER
  CHECK (surface_centiemes IS NULL OR surface_centiemes > 0);
ALTER TABLE batiment ADD COLUMN surface_source TEXT REFERENCES ref_source_donnee (code);
ALTER TABLE batiment ADD COLUMN surface_confiance TEXT NOT NULL DEFAULT 'a_renseigner' REFERENCES ref_confiance (code)
  CHECK ((surface_centiemes IS NULL AND surface_confiance = 'a_renseigner' AND surface_source IS NULL)
      OR (surface_centiemes IS NOT NULL AND surface_confiance != 'a_renseigner' AND surface_source IS NOT NULL))
  CHECK (NOT (surface_source = 'estimation' AND surface_confiance = 'connu'))
  CHECK (NOT (surface_source = 'suggestion_ia' AND surface_confiance != 'a_confirmer'))
  CHECK (NOT (surface_source = 'source_externe' AND surface_confiance = 'connu'));
