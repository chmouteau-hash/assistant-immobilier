import { describe, expect, it } from "vitest";
import { aRenseigner, confianceParDefaut, estUnFait, etiquetteProvenance, validerValeurTracee } from "@/domain/provenance";
import { formaterSurface, parserSurface } from "@/domain/mesure";
import { formaterMontant, parserMontant } from "@/lib/montant";

describe("validerValeurTracee", () => {
  it("une valeur absente est « à renseigner » sans source", () => {
    expect(validerValeurTracee(aRenseigner<number>())).toEqual({ valide: true });
    expect(validerValeurTracee({ valeur: null, source: null, confiance: "connu" }).valide).toBe(false);
    expect(validerValeurTracee({ valeur: null, source: "saisie", confiance: "a_renseigner" }).valide).toBe(false);
  });

  it("une valeur renseignée exige une source et n'est pas « à renseigner »", () => {
    expect(validerValeurTracee({ valeur: 10, source: null, confiance: "connu" }).valide).toBe(false);
    expect(validerValeurTracee({ valeur: 10, source: "saisie", confiance: "a_renseigner" }).valide).toBe(false);
    expect(validerValeurTracee({ valeur: 10, source: "saisie", confiance: "connu" }).valide).toBe(true);
  });

  it("une estimation n'est jamais « connue »", () => {
    expect(validerValeurTracee({ valeur: 10, source: "estimation", confiance: "connu" }).valide).toBe(false);
    expect(validerValeurTracee({ valeur: 10, source: "estimation", confiance: "estime" }).valide).toBe(true);
    expect(validerValeurTracee({ valeur: 10, source: "estimation", confiance: "a_confirmer" }).valide).toBe(true);
  });

  it("une suggestion de l'IA reste « à confirmer »", () => {
    expect(validerValeurTracee({ valeur: 10, source: "suggestion_ia", confiance: "a_confirmer" }).valide).toBe(true);
    expect(validerValeurTracee({ valeur: 10, source: "suggestion_ia", confiance: "estime" }).valide).toBe(false);
    expect(validerValeurTracee({ valeur: 10, source: "suggestion_ia", confiance: "connu" }).valide).toBe(false);
  });

  it("une source externe n'est pas « connue »", () => {
    expect(validerValeurTracee({ valeur: 10, source: "source_externe", confiance: "connu" }).valide).toBe(false);
    expect(validerValeurTracee({ valeur: 10, source: "source_externe", confiance: "a_confirmer" }).valide).toBe(true);
  });

  it("confiance par défaut selon la source", () => {
    expect(confianceParDefaut("saisie")).toBe("connu");
    expect(confianceParDefaut("import")).toBe("connu");
    expect(confianceParDefaut("estimation")).toBe("estime");
    expect(confianceParDefaut("source_externe")).toBe("a_confirmer");
    expect(confianceParDefaut("suggestion_ia")).toBe("a_confirmer");
  });
});

describe("étiquettes", () => {
  it("affiche toujours source et statut, jamais 0 pour une inconnue", () => {
    expect(etiquetteProvenance(aRenseigner<number>(), formaterSurface)).toBe("À renseigner");
    expect(etiquetteProvenance({ valeur: 9200, source: "import", confiance: "connu", note: "plan du 12/03/2027" }, formaterSurface)).toBe(
      "92 m² — source : pièce importée (plan du 12/03/2027), statut : connu",
    );
    // Intl insère des espaces insécables dans les montants : on les normalise avant de comparer.
    const etiquette = etiquetteProvenance({ valeur: 1_800_000, source: "estimation", confiance: "a_confirmer", note: "devis non reçu" }, formaterMontant);
    expect(etiquette.replace(/\s/g, " ")).toBe("18 000,00 € — source : estimation (devis non reçu), statut : à confirmer");
  });

  it("seul « connu » est un fait", () => {
    expect(estUnFait({ valeur: 1, source: "saisie", confiance: "connu" })).toBe(true);
    expect(estUnFait({ valeur: 1, source: "estimation", confiance: "estime" })).toBe(false);
    expect(estUnFait(aRenseigner())).toBe(false);
  });
});

describe("montants et surfaces en entiers", () => {
  it("parse sans flottant", () => {
    expect(parserMontant("1 234,56")).toBe(123_456);
    expect(parserMontant("0,1")).toBe(10);
    expect(parserMontant("0.2")).toBe(20);
    expect(parserMontant("abc")).toBeNull();
    expect(parserMontant("")).toBeNull();
    expect(parserMontant("1,234")).toBeNull();
  });
  it("0,1 + 0,2 = 0,3 en centimes", () => {
    expect(parserMontant("0,1")! + parserMontant("0,2")!).toBe(parserMontant("0,3"));
  });
  it("surfaces", () => {
    expect(parserSurface("92,5")).toBe(9250);
    expect(parserSurface("92")).toBe(9200);
    expect(parserSurface("-1")).toBeNull();
    expect(formaterSurface(9250)).toBe("92,5 m²");
    expect(formaterSurface(9205)).toBe("92,05 m²");
    expect(formaterSurface(9200)).toBe("92 m²");
  });
});
