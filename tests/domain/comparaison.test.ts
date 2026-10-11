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

  it("distingue un scénario sans aucun poste d'un scénario aux postes à renseigner", () => {
    const toiture: LigneMontant = { posteId: "R-toit", typeMontant: "devis", montantCentimes: 100, source: "saisie", confiance: "connu" };
    const grosOeuvre: LigneMontant = { posteId: "N-gros", typeMontant: "devis", montantCentimes: 50, source: "saisie", confiance: "connu" };

    const melange = comparerScenarios([element("V", "Extension", postes, []), element("R", "Rénovation", postes, [toiture]), element("N", "Neuf", postes, [grosOeuvre])]);
    expect(melange.reserve).toBe("Totaux non comparables : Extension n'a aucun poste ; Rénovation a des postes à renseigner.");

    const vides = comparerScenarios([element("V", "Extension", postes, []), element("W", "Surélévation", postes, [])]);
    expect(vides.reserve).toBe("Totaux non comparables : Extension, Surélévation n'ont aucun poste.");
    expect(vides.comparable).toBe(false);
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

  it("avec moins de deux scénarios, rien à comparer : ni classement concluant, ni réserve", () => {
    // Un dossier simple peut n'avoir qu'un scénario : ce n'est pas un manque à signaler (issue #42).
    const seul = comparerScenarios([element("N", "Neuf", postes, [])]);
    expect(seul.comparable).toBe(false);
    expect(seul.reserve).toBeNull();

    // La réserve « indicative » ne vaut que pour une comparaison : un scénario seul, même estimé, n'en a pas.
    const estime = comparerScenarios([
      element("N", "Neuf", postes, [{ posteId: "N-gros", typeMontant: "estimation", montantCentimes: 150, source: "estimation", confiance: "estime" }]),
    ]);
    expect(estime.comparable).toBe(false);
    expect(estime.reserve).toBeNull();

    expect(comparerScenarios([]).reserve).toBeNull();
  });
});
