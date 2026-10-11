import { describe, expect, it } from "vitest";
import { detecterQuestionsManquantes, FournisseurReglesLocales } from "@/domain/ia/questions-manquantes";
import { libelleFournisseur, type ContexteAutorise } from "@/domain/ia/types";

const MAINTENANT = "2026-10-09T10:00:00.000Z";

describe("nom affiché d'un fournisseur", () => {
  it("un libellé pour chaque fournisseur connu, le code tel quel pour un inconnu", () => {
    expect(libelleFournisseur("regles_locales")).toBe("Règles locales");
    expect(libelleFournisseur("anthropic")).toBe("Modèle distant (Claude)");
    expect(libelleFournisseur(new FournisseurReglesLocales().nom)).toBe("Règles locales");
    expect(libelleFournisseur("autre_fournisseur")).toBe("autre_fournisseur");
  });
});

describe("règles locales (assistant sans modèle)", () => {
  it("ne regarde que les sections présentes dans le contexte", () => {
    const ctx: ContexteAutorise = { dossier: { nom: "Pilote", typeProjet: "recherche_bien", stade: null }, sections: ["identite"] };
    expect(detecterQuestionsManquantes(ctx, MAINTENANT)).toEqual([]);
  });

  it("sans l'identité du dossier, aucune remarque sur le type de projet", () => {
    const ctx: ContexteAutorise = { sections: ["scenarios"], scenarios: [] };
    expect(detecterQuestionsManquantes(ctx, MAINTENANT)).toEqual([]);
  });

  it("signale les pièces sans surface, les postes à renseigner et les extractions en attente", () => {
    const ctx: ContexteAutorise = {
      dossier: { nom: "Pilote", typeProjet: null, stade: null },
      sections: ["identite", "lieux", "scenarios", "documents"],
      lieux: [{ nom: "Bien X", type: "bien_candidat", adresseRenseignee: false, batiments: [{ nom: "Ancien", pieces: [{ nom: "Grande pièce", surfaceCentiemes: null, surfaceConfiance: "a_renseigner" }] }] }],
      scenarios: [{ nom: "Rénovation", statut: "a_etudier", nbPostes: 2, nbPostesARenseigner: 1, nbPostesSurEstimation: 1, totalReferenceCentimes: 100, hypothesesOuvertes: ["Toiture saine"] }],
      documents: [{ nom: "facture", type: "facture", rattache: false, extractionsEnAttente: 2 }],
    };
    const elements = detecterQuestionsManquantes(ctx, MAINTENANT);
    const textes = elements.map((e) => e.constat.texte);
    expect(textes).toContainEqual(expect.stringMatching(/type de projet/));
    expect(textes).toContainEqual(expect.stringMatching(/pas d'adresse/));
    expect(textes).toContainEqual(expect.stringMatching(/1 pièce\(s\) sans surface/));
    expect(textes).toContainEqual(expect.stringMatching(/Un seul scénario/));
    expect(textes).toContainEqual(expect.stringMatching(/1 poste\(s\) sans aucun montant/));
    expect(textes).toContainEqual(expect.stringMatching(/Hypothèse ouverte/));
    expect(textes).toContainEqual(expect.stringMatching(/2 champ\(s\) extrait/));
    expect(textes).toContainEqual(expect.stringMatching(/rattachés à aucun/));
  });

  it("chaque élément porte au moins une source datée du dossier et la règle appliquée", () => {
    const ctx: ContexteAutorise = { dossier: { nom: "P", typeProjet: null, stade: null }, sections: ["identite"] };
    for (const e of detecterQuestionsManquantes(ctx, MAINTENANT)) {
      expect(e.constat.sources.some((s) => s.type === "dossier" && s.date === MAINTENANT)).toBe(true);
      expect(e.constat.sources.some((s) => s.type === "regle_locale" && s.reference)).toBe(true);
      expect(["faible", "moyen", "eleve"]).toContain(e.incertitude);
    }
  });

  it("le fournisseur renvoie une réponse complète : fournisseur, date, périmètre, avertissement", async () => {
    const f = new FournisseurReglesLocales();
    const r = await f.repondre({ dossier: { nom: "P", typeProjet: null, stade: null }, sections: ["identite"] }, "que manque-t-il ?", MAINTENANT);
    expect(r.fournisseur).toBe("regles_locales");
    expect(r.modele).toBeNull();
    expect(r.dateReponse).toBe(MAINTENANT);
    expect(r.perimetreUtilise).toEqual(["identite"]);
    expect(r.avertissement).toMatch(/professionnel/);
    expect(r.elements.length).toBeGreaterThan(0);
  });
});
