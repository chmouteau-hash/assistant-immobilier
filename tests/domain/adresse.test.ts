// L'adresse d'un lieu en trois parties : la voie, le code postal et la ville (issue #52). Fonctions
// pures, sans base ni réseau. Communes, voies et codes postaux sont fictifs ; seule la forme des
// réponses est celle du service d'adresses.

import { describe, expect, it } from "vitest";
import {
  communeDesignee,
  demandeDepuisAdresse,
  formaterAdresseComplete,
  formaterCommune,
  interpreterReponseInverse,
  interpreterResultatsRecherche,
  lireCommune,
  type Endroit,
} from "@/domain/geo";

const element = (proprietes: Record<string, unknown>) => ({ type: "Feature", geometry: { type: "Point", coordinates: [2.5, 46.5] }, properties: proprietes });
const parties = (proprietes: Record<string, unknown>) => interpreterResultatsRecherche({ features: [element(proprietes)] })[0]?.parties;

describe("saisie d'un code postal et d'une ville", () => {
  it("deux champs vides : la commune est à renseigner", () => {
    expect(lireCommune("", "")).toEqual({ valide: true, commune: null });
    expect(lireCommune("   ", "  ")).toEqual({ valide: true, commune: null });
  });

  it("l'un des deux peut manquer : rien n'est complété ni deviné", () => {
    expect(lireCommune("00100", "")).toEqual({ valide: true, commune: { codePostal: "00100", ville: null } });
    expect(lireCommune("", "Ville-Fictive")).toEqual({ valide: true, commune: { codePostal: null, ville: "Ville-Fictive" } });
  });

  it("retire les espaces mis par habitude, et garde le zéro du début", () => {
    expect(lireCommune(" 00 100 ", "  Ville   Fictive ")).toEqual({ valide: true, commune: { codePostal: "00100", ville: "Ville Fictive" } });
    expect(lireCommune("01000", "Bourg-Fictif")).toEqual({ valide: true, commune: { codePostal: "01000", ville: "Bourg-Fictif" } });
  });

  it("refuse un code postal qui n'a pas cinq chiffres", () => {
    for (const saisie of ["0010", "001000", "0010A", "2A004", "zéro"]) {
      const lecture = lireCommune(saisie, "Ville-Fictive");
      expect(lecture.valide, saisie).toBe(false);
      if (!lecture.valide) expect(lecture.motif).toMatch(/cinq chiffres/);
    }
  });

  it("refuse une ville sans lettre, ou trop longue", () => {
    expect(lireCommune("00100", "12345")).toMatchObject({ valide: false, motif: expect.stringMatching(/au moins une lettre/) });
    expect(lireCommune("00100", "V".repeat(101))).toMatchObject({ valide: false, motif: expect.stringMatching(/trop long/) });
    expect(lireCommune("00100", "V".repeat(100)).valide).toBe(true);
  });
});

describe("affichage d'une commune et d'une adresse", () => {
  it("la commune : ce qui est connu, dans l'ordre code postal puis ville", () => {
    expect(formaterCommune({ codePostal: "00100", ville: "Ville-Fictive" })).toBe("00100 Ville-Fictive");
    expect(formaterCommune({ codePostal: "00100", ville: null })).toBe("00100");
    expect(formaterCommune({ codePostal: null, ville: "Ville-Fictive" })).toBe("Ville-Fictive");
  });

  it("l'adresse sur une ligne, ou rien si tout manque", () => {
    expect(formaterAdresseComplete("12 rue des Tilleuls", { codePostal: "00100", ville: "Ville-Fictive" })).toBe("12 rue des Tilleuls, 00100 Ville-Fictive");
    expect(formaterAdresseComplete("12 rue des Tilleuls", null)).toBe("12 rue des Tilleuls");
    expect(formaterAdresseComplete(null, { codePostal: null, ville: "Ville-Fictive" })).toBe("Ville-Fictive");
    expect(formaterAdresseComplete(null, null)).toBeNull();
  });
});

describe("ce que le service rend, partie par partie", () => {
  it("une adresse : la voie, le code postal et la ville, chacun à part", () => {
    expect(parties({ type: "housenumber", label: "12 Rue des Tilleuls 00100 Ville-Fictive", name: "12 Rue des Tilleuls", postcode: "00100", city: "Ville-Fictive" })).toEqual({
      voie: "12 Rue des Tilleuls",
      commune: { codePostal: "00100", ville: "Ville-Fictive" },
    });
    expect(parties({ type: "street", label: "Rue des Tilleuls 00100 Ville-Fictive", name: "Rue des Tilleuls", postcode: "00100", city: "Ville-Fictive" })?.voie).toBe("Rue des Tilleuls");
    expect(parties({ type: "locality", label: "Les Essarts 00100 Ville-Fictive", name: "Les Essarts", postcode: "00100", city: "Ville-Fictive" })?.voie).toBe("Les Essarts");
  });

  it("une commune n'a pas de voie : son nom est celui de la ville", () => {
    expect(parties({ type: "municipality", label: "Ville-Fictive", name: "Ville-Fictive", postcode: "00100", city: "Ville-Fictive" })).toEqual({
      voie: null,
      commune: { codePostal: "00100", ville: "Ville-Fictive" },
    });
    expect(parties({ type: "municipality", label: "Ville-Fictive", postcode: "00100" })).toEqual({ voie: null, commune: { codePostal: "00100", ville: "Ville-Fictive" } });
  });

  it("sans code postal ni ville lisibles, rien n'est découpé : le libellé entier reste dans la voie", () => {
    expect(parties({ type: "housenumber", label: "12 Rue des Tilleuls 00100 Ville-Fictive" })).toEqual({ voie: "12 Rue des Tilleuls 00100 Ville-Fictive", commune: null });
  });

  it("un code postal mal formé n'est pas gardé", () => {
    expect(parties({ type: "housenumber", label: "12 Rue des Tilleuls Ville-Fictive", name: "12 Rue des Tilleuls", postcode: "0010", city: "Ville-Fictive" })).toEqual({
      voie: "12 Rue des Tilleuls",
      commune: { codePostal: null, ville: "Ville-Fictive" },
    });
  });

  it("l'adresse la plus proche d'un point porte les mêmes parties", () => {
    const reponse = { features: [element({ type: "housenumber", label: "12 Rue des Tilleuls 00100 Ville-Fictive", name: "12 Rue des Tilleuls", postcode: "00100", city: "Ville-Fictive", distance: 35 })] };
    expect(interpreterReponseInverse(reponse)).toEqual({
      libelle: "12 Rue des Tilleuls 00100 Ville-Fictive",
      distanceMetres: 35,
      parties: { voie: "12 Rue des Tilleuls", commune: { codePostal: "00100", ville: "Ville-Fictive" } },
    });
  });
});

describe("ce qu'on demande au service pour situer un lieu d'après son adresse", () => {
  const commune = { codePostal: "00100", ville: "Ville-Fictive" };

  it("avec une voie : la voie et la ville dans le texte, le code postal en filtre, une seule réponse", () => {
    expect(demandeDepuisAdresse("12 rue des Tilleuls", commune)).toEqual({ mode: "adresse", parametres: { q: "12 rue des Tilleuls Ville-Fictive", postcode: "00100", limit: "1" } });
    expect(demandeDepuisAdresse(" 12 rue des Tilleuls ", null)).toEqual({ mode: "adresse", parametres: { q: "12 rue des Tilleuls", limit: "1" } });
    expect(demandeDepuisAdresse("12 rue des Tilleuls", { codePostal: "00100", ville: null })).toEqual({ mode: "adresse", parametres: { q: "12 rue des Tilleuls", postcode: "00100", limit: "1" } });
  });

  it("sans voie, avec une ville : les communes seulement, assez nombreuses pour voir les homonymes", () => {
    expect(demandeDepuisAdresse(null, commune)).toEqual({ mode: "commune", parametres: { q: "00100 Ville-Fictive", type: "municipality", postcode: "00100", limit: "10" } });
    expect(demandeDepuisAdresse("  ", { codePostal: null, ville: "Ville-Fictive" })).toEqual({ mode: "commune", parametres: { q: "Ville-Fictive", type: "municipality", limit: "10" } });
  });

  it("une ville de deux lettres part précédée de son code postal : le service refuse moins de trois caractères", () => {
    expect(demandeDepuisAdresse(null, { codePostal: "00100", ville: "Xy" })?.parametres.q).toBe("00100 Xy");
  });

  it("avec le code postal seul : toutes ses communes", () => {
    expect(demandeDepuisAdresse(null, { codePostal: "00100", ville: null })).toEqual({ mode: "code-postal", parametres: { q: "00100", type: "municipality", limit: "50" } });
  });

  it("rien de renseigné : rien à demander", () => {
    expect(demandeDepuisAdresse(null, null)).toBeNull();
    expect(demandeDepuisAdresse("", null)).toBeNull();
  });

  it("un texte très long est coupé à 200 caractères", () => {
    expect(demandeDepuisAdresse("r".repeat(300), commune)?.parametres.q).toHaveLength(200);
  });
});

describe("la commune qu'une ville saisie désigne", () => {
  const endroit = (ville: string, codePostal: string): Endroit => ({
    id: `commune:${codePostal}-${ville}`,
    libelle: `${codePostal} ${ville}`,
    nature: "commune",
    codePostal,
    position: { latitudeMicrodeg: 46_500_000, longitudeMicrodeg: 2_500_000 },
    parties: { voie: null, commune: { codePostal, ville } },
  });

  it("une seule porte ce nom : c'est elle, quelles que soient la casse, les accents et les traits d'union", () => {
    const communes = [endroit("Sainte-Aimée-la-Fictive", "00100"), endroit("Bourg-Fictif", "00200")];
    expect(communeDesignee("sainte aimee la fictive", communes)).toEqual({ endroit: communes[0], homonymes: 1 });
    expect(communeDesignee("BOURG-FICTIF", communes)).toEqual({ endroit: communes[1], homonymes: 1 });
  });

  it("plusieurs portent ce nom : aucune n'est choisie", () => {
    const communes = [endroit("Ville-Fictive", "00100"), endroit("Ville-Fictive", "00900"), endroit("Bourg-Fictif", "00200")];
    expect(communeDesignee("Ville-Fictive", communes)).toEqual({ endroit: null, homonymes: 2 });
  });

  it("aucune ne porte ce nom : la première proposition du service, qui n'est pas une rue", () => {
    const rue: Endroit = { ...endroit("Ville-Fictive", "00100"), id: "rue:1", nature: "rue" };
    const communes = [rue, endroit("Ville-Fictive-sur-Rien", "00100"), endroit("Bourg-Fictif", "00200")];
    expect(communeDesignee("Ville-Fictiv", communes)).toEqual({ endroit: communes[1], homonymes: 0 });
    expect(communeDesignee("Ville-Fictive", [rue])).toEqual({ endroit: null, homonymes: 0 });
    expect(communeDesignee("Ville-Fictive", [])).toEqual({ endroit: null, homonymes: 0 });
  });
});
