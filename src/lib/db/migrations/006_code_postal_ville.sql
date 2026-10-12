-- Migration 006 — code postal et ville d'un lieu.
--
-- L'adresse d'un lieu tenait dans un seul champ de texte. Le code postal et la ville ont désormais
-- chacun leur colonne (issue #52) : en recherche d'un bien, on connaît la commune avant l'adresse.
--
-- Les deux forment UNE valeur tracée, à part de l'adresse : source + confiance, « à renseigner »
-- tant que ni l'un ni l'autre n'est connu. Elle ne peut pas partager la provenance de l'adresse :
-- la contrainte de la migration 002 interdit toute source tant que `adresse` est vide, et une
-- contrainte SQLite ne se modifie pas sans reconstruire la table.
--
-- Le code postal est français : cinq chiffres, gardés en texte (« 01000 » commence par un zéro).
-- Les adresses déjà saisies ne sont pas découpées : ce serait deviner. Elles restent dans `adresse`.

ALTER TABLE lieu ADD COLUMN code_postal TEXT
  CHECK (code_postal IS NULL OR (length(code_postal) = 5 AND code_postal NOT GLOB '*[^0-9]*'));
ALTER TABLE lieu ADD COLUMN ville TEXT
  CHECK (ville IS NULL OR length(trim(ville)) > 0);
ALTER TABLE lieu ADD COLUMN commune_source TEXT REFERENCES ref_source_donnee (code);
ALTER TABLE lieu ADD COLUMN commune_confiance TEXT NOT NULL DEFAULT 'a_renseigner' REFERENCES ref_confiance (code)
  CHECK ((code_postal IS NULL AND ville IS NULL AND commune_confiance = 'a_renseigner' AND commune_source IS NULL)
      OR ((code_postal IS NOT NULL OR ville IS NOT NULL) AND commune_confiance != 'a_renseigner' AND commune_source IS NOT NULL));
