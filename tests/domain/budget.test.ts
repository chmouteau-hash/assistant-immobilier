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

  it("le montant prévu suit la nature la plus engageante : estimation < devis < engagement", () => {
    const l = [ligne("toiture", "estimation", 1_800_000, "estimation"), ligne("toiture", "devis", 2_100_000)];
    const s = synthetiserPoste(postes[0], l);
    expect(s.referenceCentimes).toBe(2_100_000);
    expect(s.natureReference).toBe("devis");
    expect(s.referenceEstEstimation).toBe(false);
    expect(s.ecartDevisEstimationCentimes).toBe(300_000);
    expect(s.statut).toBe("chiffre");

    const engage = synthetiserPoste(postes[0], [...l, ligne("toiture", "engagement", 2_000_000)]);
    expect(engage).toMatchObject({ referenceCentimes: 2_000_000, natureReference: "engagement", statut: "engage" });
  });

  it("une facture partielle ne fait pas baisser la référence tant que le poste n'est pas soldé", () => {
    const acompte = [ligne("toiture", "devis", 1_000_000), ligne("toiture", "facture", 300_000)];
    expect(synthetiserPoste(postes[0], acompte)).toMatchObject({ referenceCentimes: 1_000_000, natureReference: "devis", factureCentimes: 300_000, solde: false });

    // Deux factures s'additionnent ; dès que le facturé atteint ou dépasse le prévu, il devient la référence.
    const atteint = [...acompte, ligne("toiture", "facture", 700_000)];
    expect(synthetiserPoste(postes[0], atteint)).toMatchObject({ referenceCentimes: 1_000_000, natureReference: "facture" });
    const depasse = [...atteint, ligne("toiture", "facture", 50_000)];
    expect(synthetiserPoste(postes[0], depasse)).toMatchObject({ referenceCentimes: 1_050_000, natureReference: "facture" });

    // L'engagement, s'il existe, est le montant prévu : il passe avant le devis.
    const engage = [...acompte, ligne("toiture", "engagement", 900_000)];
    expect(synthetiserPoste(postes[0], engage)).toMatchObject({ referenceCentimes: 900_000, natureReference: "engagement" });
  });

  it("une fois le poste soldé, la référence est le total facturé, même inférieur au devis", () => {
    const l = [ligne("toiture", "devis", 1_000_000), ligne("toiture", "facture", 300_000), ligne("toiture", "facture", 650_000)];
    const s = synthetiserPoste({ ...postes[0], solde: true }, l);
    expect(s).toMatchObject({ referenceCentimes: 950_000, natureReference: "facture", solde: true, ecartFactureDevisCentimes: -50_000 });
  });

  it("un poste qui n'a qu'une estimation suit la même règle : le plus élevé des deux", () => {
    const l = [ligne("toiture", "estimation", 1_800_000, "estimation"), ligne("toiture", "facture", 420_000)];
    expect(synthetiserPoste(postes[0], l)).toMatchObject({ referenceCentimes: 1_800_000, natureReference: "estimation", referenceEstEstimation: true });
    expect(synthetiserPoste({ ...postes[0], solde: true }, l)).toMatchObject({ referenceCentimes: 420_000, natureReference: "facture", referenceEstEstimation: false });
  });

  it("une facture seule est la référence ; un poste soldé sans facture retenue garde son montant prévu", () => {
    expect(synthetiserPoste(postes[0], [ligne("toiture", "facture", 100)])).toMatchObject({ referenceCentimes: 100, natureReference: "facture" });
    const ecartee = [ligne("toiture", "devis", 1_000_000), { ...ligne("toiture", "facture", 300_000), ecartee: true }];
    expect(synthetiserPoste({ ...postes[0], solde: true }, ecartee)).toMatchObject({ referenceCentimes: 1_000_000, natureReference: "devis", factureCentimes: null });
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

  it("le total du scénario ne baisse pas à cause d'une facture partielle", () => {
    const options = { tauxImprevusPourMille: 100 };
    const devis = [ligne("toiture", "devis", 1_000_000), ligne("menuiseries", "devis", 500_000), ligne("piscine", "devis", 100_000)];
    expect(synthetiserScenario("S1", postes, devis, options).totalReferenceCentimes).toBe(1_600_000);

    const apres = synthetiserScenario("S1", postes, [...devis, ligne("toiture", "facture", 300_000)], options);
    expect(apres.totalReferenceCentimes).toBe(1_600_000);
    expect(apres.totalFactureCentimes).toBe(300_000);
    expect(apres.totalAvecImprevusCentimes).toBe(1_760_000);

    // Une fois la toiture soldée à 300 000, le total suit le facturé.
    const soldes = postes.map((p) => (p.id === "toiture" ? { ...p, solde: true } : p));
    expect(synthetiserScenario("S1", soldes, [...devis, ligne("toiture", "facture", 300_000)], options).totalReferenceCentimes).toBe(900_000);
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
