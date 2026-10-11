-- Migration 004 — poste soldé.
--
-- Une facture partielle (un acompte) faisait tomber la référence d'un poste, et le total de son
-- scénario, au montant facturé. Tant qu'un poste n'est pas « soldé », sa référence reste le plus
-- élevé entre le montant prévu et le total facturé ; une fois soldé (plus aucune facture attendue),
-- elle devient le total facturé (DECISIONS.md, 2026-10-10 et 2026-10-11).
--
-- Solder ou rouvrir un poste exige un motif, journalisé. « Soldé » n'est pas « payé » : payé dit
-- que les paiements couvrent les factures reçues, et se calcule ; soldé se déclare.

ALTER TABLE poste_budget ADD COLUMN solde INTEGER NOT NULL DEFAULT 0 CHECK (solde IN (0, 1));
