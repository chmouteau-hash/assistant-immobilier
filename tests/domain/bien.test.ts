// Statut d'un bien : les règles pures de domain/bien.ts (issue #2, DECISIONS.md du 2026-10-28).

import { describe, expect, it } from "vitest";
import { estStatutBien, motifExige, statutInitial, typeApresStatut, verifierTypeEtStatut, STATUTS_BIEN } from "@/domain/bien";

describe("statut d'un bien", () => {
  it("connaît les cinq statuts, et rien d'autre", () => {
    expect(STATUTS_BIEN).toEqual(["repere", "visite", "offre_faite", "ecarte", "acquis"]);
    expect(estStatutBien("visite")).toBe(true);
    expect(estStatutBien("vendu")).toBe(false);
  });

  it("demande un motif pour écarter ou acquérir, pas pour les étapes de la recherche", () => {
    expect(STATUTS_BIEN.filter(motifExige)).toEqual(["ecarte", "acquis"]);
  });

  it("part d'« acquis » pour un bien acquis, et d'« à renseigner » sinon", () => {
    expect(statutInitial("bien_acquis")).toBe("acquis");
    expect(statutInitial("bien_candidat")).toBeNull();
    expect(statutInitial("terrain")).toBeNull();
  });

  it("range un bien candidat acquis en « Bien acquis », et l'en sort quand on revient sur l'achat", () => {
    expect(typeApresStatut("bien_candidat", "acquis")).toBe("bien_acquis");
    expect(typeApresStatut("bien_candidat", "visite")).toBe("bien_candidat");
    expect(typeApresStatut("bien_acquis", "offre_faite")).toBe("bien_candidat");
    expect(typeApresStatut("bien_acquis", "acquis")).toBe("bien_acquis");
  });

  it("laisse un terrain à son type, quel que soit son statut", () => {
    for (const statut of STATUTS_BIEN) expect(typeApresStatut("terrain", statut)).toBe("terrain");
  });

  it("refuse un type qui contredit le statut", () => {
    expect(verifierTypeEtStatut("bien_acquis", "visite").valide).toBe(false);
    expect(verifierTypeEtStatut("bien_acquis", null).valide).toBe(false);
    expect(verifierTypeEtStatut("bien_candidat", "acquis").valide).toBe(false);
    expect(verifierTypeEtStatut("bien_candidat", null).valide).toBe(true);
    expect(verifierTypeEtStatut("terrain", "acquis").valide).toBe(true);
    expect(verifierTypeEtStatut("bien_acquis", "acquis").valide).toBe(true);
  });
});
