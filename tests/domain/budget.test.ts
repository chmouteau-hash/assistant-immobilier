import { describe, expect, it } from "vitest";
import { calculerMarge, synthetiserPoste, synthetiserScenario, type LigneMontant, type Poste } from "@/domain/budget";

const postes: Poste[] = [
  { id: "toiture", nom: "Toiture", scenarioId: "S1" },
  { id: "menuiseries", nom: "Menuiseries", scenarioId: "S1" },
  { id: "piscine", nom: "Piscine", scenarioId: "S1" },
  { id: "autre", nom: "Hors scénario", scenarioId: "S2" },
];

const ligne = (posteId: string, typeMontant: LigneMontant["typeMontant"], montantCentimes: number, source: LigneMontant["source"] = "saisie"): LigneMontant => ({
  posteId,
  typeMontant,
  montantCentimes,
  source,
  confiance: source === "estimation" ? "estime" : "connu",
});

describe("synthetiserPoste", () => {
  it("un poste sans ligne est « à renseigner », jamais zéro", () => {
    const s = synthetiserPoste(postes[0], []);
    expect(s.statut).toBe("a_renseigner");
    expect(s.referenceCentimes).toBeNull();
    expect(s.estimationCentimes).toBeNull();
  });

  it("la référence suit la nature la plus avancée : estimation < devis < engagement < facture", () => {
    const l = [ligne("toiture", "estimation", 1_800_000, "estimation"), ligne("toiture", "devis", 2_100_000)];
    const s = synthetiserPoste(postes[0], l);
    expect(s.referenceCentimes).toBe(2_100_000);
    expect(s.natureReference).toBe("devis");
    expect(s.referenceEstEstimation).toBe(false);
    expect(s.ecartDevisEstimationCentimes).toBe(300_000);
    expect(s.statut).toBe("chiffre");
  });

  it("écart facture/devis et reste à payer", () => {
    const l = [ligne("toiture", "devis", 2_100_000), ligne("toiture", "facture", 2_050_000), ligne("toiture", "paiement", 1_000_000)];
    const s = synthetiserPoste(postes[0], l);
    expect(s.ecartFactureDevisCentimes).toBe(-50_000);
    expect(s.resteAPayerCentimes).toBe(1_050_000);
    expect(s.statut).toBe("facture");
  });

  it("payé quand les paiements couvrent la facture", () => {
    const l = [ligne("toiture", "facture", 100), ligne("toiture", "paiement", 60), ligne("toiture", "paiement", 40)];
    expect(synthetiserPoste(postes[0], l).statut).toBe("paye");
  });

  it("refuse un montant non entier", () => {
    expect(() => synthetiserPoste(postes[0], [ligne("toiture", "devis", 10.5)])).toThrow(/centimes entiers/);
  });
});

describe("synthetiserScenario", () => {
  it("un total avec un poste à renseigner est incomplet", () => {
    const l = [ligne("toiture", "devis", 2_100_000), ligne("menuiseries", "estimation", 900_000, "estimation")];
    const s = synthetiserScenario("S1", postes, l, { tauxImprevusPourMille: 100 });
    expect(s.nbPostes).toBe(3);
    expect(s.nbPostesARenseigner).toBe(1);
    expect(s.complet).toBe(false);
    expect(s.totalReferenceCentimes).toBe(3_000_000);
    expect(s.nbPostesSurEstimation).toBe(1);
    expect(s.margeImprevusCentimes).toBe(300_000);
    expect(s.totalAvecImprevusCentimes).toBe(3_300_000);
  });

  it("ignore les postes d'un autre scénario", () => {
    const s = synthetiserScenario("S2", postes, [ligne("autre", "devis", 1)], { tauxImprevusPourMille: 0 });
    expect(s.nbPostes).toBe(1);
    expect(s.complet).toBe(true);
    expect(s.totalReferenceCentimes).toBe(1);
  });

  it("un scénario sans poste n'est pas complet et n'a pas de total", () => {
    const s = synthetiserScenario("S3", postes, [], { tauxImprevusPourMille: 100 });
    expect(s.complet).toBe(false);
    expect(s.totalReferenceCentimes).toBeNull();
    expect(s.totalAvecImprevusCentimes).toBeNull();
  });

  it("est déterministe : même entrée, même sortie", () => {
    const l = [ligne("toiture", "devis", 123_456), ligne("menuiseries", "facture", 654_321), ligne("piscine", "estimation", 1, "estimation")];
    const a = synthetiserScenario("S1", postes, l, { tauxImprevusPourMille: 150 });
    const b = synthetiserScenario("S1", postes, l, { tauxImprevusPourMille: 150 });
    expect(a).toEqual(b);
  });
});

describe("calculerMarge", () => {
  it("arithmétique entière, arrondi au centime le plus proche", () => {
    expect(calculerMarge(1000, 150)).toBe(150);
    expect(calculerMarge(1001, 150)).toBe(150); // 150,15 → 150
    expect(calculerMarge(1004, 150)).toBe(151); // 150,6 → 151
    expect(calculerMarge(0, 150)).toBe(0);
    expect(calculerMarge(-1000, 150)).toBe(-150);
  });
  it("refuse un taux non entier ou négatif", () => {
    expect(() => calculerMarge(1000, 1.5)).toThrow();
    expect(() => calculerMarge(1000, -1)).toThrow();
  });
});
