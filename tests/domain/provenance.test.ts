import { describe, expect, it } from "vitest";
import {
  aRenseigner,
  confianceParDefaut,
  estUnFait,
  etiquetteProvenance,
  reserveDeConfiance,
  validerValeurTracee,
  CONFIANCES,
  LIBELLES_CONFIANCE,
  LIBELLES_SOURCE,
  QUESTION_CONFIANCE,
  QUESTION_SOURCE,
  REPONSES_CONFIANCE,
  REPONSES_SOURCE,
  SOURCES,
} from "@/domain/provenance";
import { formaterSurface, formaterTaille, parserSurface } from "@/domain/mesure";
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
      "92 m² — source : document importé (plan du 12/03/2027), statut : connu",
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
  it("taille d'un fichier : jamais « 0 Ko » pour un fichier qui existe", () => {
    expect(formaterTaille(0)).toBe("0 octet");
    expect(formaterTaille(1)).toBe("1 octet");
    expect(formaterTaille(127)).toBe("127 octets");
    expect(formaterTaille(1023)).toBe("1023 octets");
    expect(formaterTaille(1024)).toBe("1 Ko");
    expect(formaterTaille(1536)).toBe("2 Ko");
    expect(formaterTaille(1024 * 1024 - 1)).toBe("1024 Ko");
    expect(formaterTaille(1024 * 1024)).toBe("1 Mo");
    expect(formaterTaille(1.5 * 1024 * 1024)).toBe("1,5 Mo");
    expect(formaterTaille(20 * 1024 * 1024)).toBe("20 Mo");
  });
});

describe("questions de provenance (issue #15)", () => {
  it("chaque origine a une réponse en clair, qui reprend le nom affiché sur la pastille", () => {
    for (const s of SOURCES) expect(REPONSES_SOURCE[s].toLowerCase()).toContain(LIBELLES_SOURCE[s].toLowerCase());
  });

  it("chaque niveau de certitude a une réponse en clair, qui reprend le nom affiché sur la pastille", () => {
    for (const c of CONFIANCES) expect(REPONSES_CONFIANCE[c].toLowerCase()).toContain(LIBELLES_CONFIANCE[c].toLowerCase());
  });

  it("les deux champs sont posés comme des questions", () => {
    expect(QUESTION_SOURCE.endsWith("?")).toBe(true);
    expect(QUESTION_CONFIANCE.endsWith("?")).toBe(true);
  });

  it("un document importé porte un seul nom, sans le mot « pièce » qui désigne aussi une salle", () => {
    expect(LIBELLES_SOURCE.import).toBe("document importé");
    for (const s of SOURCES) expect(LIBELLES_SOURCE[s] + REPONSES_SOURCE[s]).not.toMatch(/pièce/i);
  });
});

describe("réserve à dire quand plusieurs valeurs tiennent sur une ligne", () => {
  const valeur = (confiance: "connu" | "estime" | "a_confirmer") => ({ valeur: "texte (fictif)", source: "saisie" as const, confiance });

  it("tout est connu : aucune réserve", () => {
    expect(reserveDeConfiance([valeur("connu"), valeur("connu")])).toBeNull();
    expect(reserveDeConfiance([valeur("connu")])).toBeNull();
  });

  it("la confiance la plus faible l'emporte, et « à confirmer » passe avant « estimé »", () => {
    expect(reserveDeConfiance([valeur("connu"), valeur("estime")])).toBe("estime");
    expect(reserveDeConfiance([valeur("estime"), valeur("a_confirmer")])).toBe("a_confirmer");
    expect(reserveDeConfiance([valeur("a_confirmer"), valeur("connu")])).toBe("a_confirmer");
  });

  it("une valeur absente ne compte pas : rien de renseigné, rien à réserver", () => {
    expect(reserveDeConfiance([aRenseigner(), valeur("connu")])).toBeNull();
    expect(reserveDeConfiance([aRenseigner(), valeur("estime")])).toBe("estime");
    expect(reserveDeConfiance([aRenseigner(), aRenseigner()])).toBeNull();
    expect(reserveDeConfiance([])).toBeNull();
  });
});
