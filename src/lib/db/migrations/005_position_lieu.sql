-- Migration 005 — position d'un lieu sur la carte.
--
-- Un lieu peut porter une position (latitude, longitude) pour être montré sur la carte de l'écran
-- Lieux. Comme l'adresse, c'est une valeur tracée : source + confiance, « à renseigner » tant
-- qu'elle n'est pas connue (DECISIONS.md, 2026-10-11, « Lieux : une carte des lieux »).
--
-- Entiers en MICRODEGRÉS (millionièmes de degré, soit environ 11 cm) : jamais de virgule flottante
-- en base, comme les montants en centimes et les surfaces en centièmes de m². La latitude va de
-- -90° à 90°, la longitude de -180° à 180°.
--
-- `position_note` garde ce que le service d'adresses a compris (« 1 Rue de la Paix 75002 Paris »)
-- quand la position vient de lui : l'écran peut dire d'après quoi le repère a été posé.

ALTER TABLE lieu ADD COLUMN latitude_microdeg INTEGER
  CHECK (latitude_microdeg IS NULL OR latitude_microdeg BETWEEN -90000000 AND 90000000);
ALTER TABLE lieu ADD COLUMN longitude_microdeg INTEGER
  CHECK (longitude_microdeg IS NULL OR longitude_microdeg BETWEEN -180000000 AND 180000000);
ALTER TABLE lieu ADD COLUMN position_source TEXT REFERENCES ref_source_donnee (code);
ALTER TABLE lieu ADD COLUMN position_confiance TEXT NOT NULL DEFAULT 'a_renseigner' REFERENCES ref_confiance (code)
  CHECK ((latitude_microdeg IS NULL AND longitude_microdeg IS NULL AND position_confiance = 'a_renseigner' AND position_source IS NULL)
      OR (latitude_microdeg IS NOT NULL AND longitude_microdeg IS NOT NULL AND position_confiance != 'a_renseigner' AND position_source IS NOT NULL));
ALTER TABLE lieu ADD COLUMN position_note TEXT;
