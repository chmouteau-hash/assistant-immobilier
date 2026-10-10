import { describe, expect, it } from "vitest";
import { comparerScenarios, type ElementsComparaison } from "@/domain/comparaison";
import { synthetiserScenario, type LigneMontant, type Poste } from "@/domain/budget";

function element(id: string, nom: string, postes: Poste[], lignes: LigneMontant[]): ElementsComparaison {
  return {
    scenarioId: id,
    nom,
    statut: "a_etudier",
    synthese: synthetiserScenario(id, postes, lignes, { tauxImprevusPourMille: 100 }),
    nbHypothesesOuvertes: 0,
    nbIdeesRetenues: 0,
    nbTachesOuvertes: 0,
  };
}

const postes: Poste[] = [
  { id: "R-toit", nom: "Toiture", scenarioId: "R" },
  { id: "R-iso", nom: "Isolation", scenarioId: "R" },
  { id: "N-gros", nom: "Gros œuvre", scenarioId: "N" },
];

describe("comparerScenarios", () => {
  it("ne classe pas quand un scénario a des postes à renseigner", () => {
    const c = comparerScenarios([
      element("R", "Rénovation", postes, [{ posteId: "R-toit", typeMontant: "devis", montantCentimes: 100, source: "saisie", confiance: "connu" }]),
      element("N", "Neuf", postes, [{ posteId: "N-gros", typeMontant: "devis", montantCentimes: 50, source: "saisie", confiance: "connu" }]),
    ]);
    expect(c.comparable).toBe(false);
    expect(c.reserve).toMatch(/Rénovation.*à renseigner/);
    expect(c.lignes.find((l) => l.nom === "Rénovation")!.rangCout).toBeNull();
    // Le scénario complet est classé, mais la comparaison globale reste non concluante.
    expect(c.lignes.find((l) => l.nom === "Neuf")!.rangCout).toBe(1);
  });

  it("classe et calcule l'écart quand tout est complet", () => {
    const c = comparerScenarios([
      element("R", "Rénovation", postes, [
        { posteId: "R-toit", typeMontant: "devis", montantCentimes: 100, source: "saisie", confiance: "connu" },
        { posteId: "R-iso", typeMontant: "devis", montantCentimes: 100, source: "saisie", confiance: "connu" },
      ]),
      element("N", "Neuf", postes, [{ posteId: "N-gros", typeMontant: "devis", montantCentimes: 150, source: "saisie", confiance: "connu" }]),
    ]);
    expect(c.comparable).toBe(true);
    expect(c.reserve).toBeNull();
    expect(c.lignes.find((l) => l.nom === "Neuf")!.rangCout).toBe(1);
    expect(c.lignes.find((l) => l.nom === "Rénovation")!.ecartAuMoinsCherCentimes).toBe(50);
  });

  it("signale une comparaison indicative si des postes reposent sur des estimations", () => {
    const c = comparerScenarios([
      element("R", "Rénovation", postes, [
        { posteId: "R-toit", typeMontant: "estimation", montantCentimes: 100, source: "estimation", confiance: "estime" },
        { posteId: "R-iso", typeMontant: "devis", montantCentimes: 100, source: "saisie", confiance: "connu" },
      ]),
      element("N", "Neuf", postes, [{ posteId: "N-gros", typeMontant: "devis", montantCentimes: 150, source: "saisie", confiance: "connu" }]),
    ]);
    expect(c.comparable).toBe(true);
    expect(c.reserve).toMatch(/indicative/);
  });

  it("exige au moins deux scénarios", () => {
    const c = comparerScenarios([element("N", "Neuf", postes, [])]);
    expect(c.comparable).toBe(false);
    expect(c.reserve).toMatch(/au moins deux/);
  });
});
