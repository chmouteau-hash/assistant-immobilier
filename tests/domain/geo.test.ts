// Positions en microdegrés : conversions sans virgule flottante stockée, bornes, et lecture de la
// réponse du service d'adresses (format GeoJSON de la Base Adresse Nationale, données publiques).

import { describe, expect, it } from "vitest";
import { formaterCoordonnee, formaterPosition, interpreterReponseGeocodage, parserCoordonnee, validerPosition, versDegres, versMicrodegres } from "@/domain/geo";

describe("coordonnées en microdegrés", () => {
  it("lit une saisie à virgule ou à point, avec ou sans signe", () => {
    expect(parserCoordonnee("48,868546")).toBe(48_868_546);
    expect(parserCoordonnee("48.868546")).toBe(48_868_546);
    expect(parserCoordonnee("2")).toBe(2_000_000);
    expect(parserCoordonnee("-1,5")).toBe(-1_500_000);
    expect(parserCoordonnee(" 2,33 ")).toBe(2_330_000);
  });

  it("ignore au-delà de la sixième décimale et refuse ce qui n'est pas un nombre", () => {
    expect(parserCoordonnee("48,8685461234")).toBe(48_868_546);
    expect(parserCoordonnee("")).toBeNull();
    expect(parserCoordonnee("nord")).toBeNull();
    expect(parserCoordonnee("48,8,6")).toBeNull();
    expect(parserCoordonnee("48°")).toBeNull();
  });

  it("s'affiche sans zéros inutiles et revient à la même valeur", () => {
    expect(formaterCoordonnee(48_868_546)).toBe("48,868546");
    expect(formaterCoordonnee(2_330_310)).toBe("2,33031");
    expect(formaterCoordonnee(2_000_000)).toBe("2");
    expect(formaterCoordonnee(-1_500_000)).toBe("-1,5");
    expect(formaterCoordonnee(-500)).toBe("-0,0005");
    for (const v of [48_868_546, 2_330_310, 0, -1_500_000, 90_000_000]) expect(parserCoordonnee(formaterCoordonnee(v))).toBe(v);
    expect(formaterPosition({ latitudeMicrodeg: 48_868_546, longitudeMicrodeg: 2_330_310 })).toBe("lat. 48,868546 · long. 2,33031");
  });

  it("convertit un nombre à virgule venu de la carte, dans les deux sens", () => {
    expect(versMicrodegres(48.8685461)).toBe(48_868_546);
    expect(versMicrodegres(-0.0000004)).toBe(0);
    expect(versDegres(2_330_310)).toBe(2.33031);
  });

  it("tient les bornes : latitude ±90, longitude ±180, entiers seulement", () => {
    expect(validerPosition({ latitudeMicrodeg: 90_000_000, longitudeMicrodeg: -180_000_000 }).valide).toBe(true);
    expect(validerPosition({ latitudeMicrodeg: 90_000_001, longitudeMicrodeg: 0 })).toMatchObject({ valide: false, motif: expect.stringContaining("latitude") });
    expect(validerPosition({ latitudeMicrodeg: 0, longitudeMicrodeg: -180_000_001 })).toMatchObject({ valide: false, motif: expect.stringContaining("longitude") });
    expect(validerPosition({ latitudeMicrodeg: 1.5, longitudeMicrodeg: 0 }).valide).toBe(false);
  });
});

describe("réponse du service d'adresses", () => {
  const reponse = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [2.33031, 48.868546] },
        properties: { label: "1 Rue de la Paix 75002 Paris", score: 0.96406, city: "Paris" },
      },
    ],
    query: "1 rue de la Paix Paris",
  };

  it("lit la première correspondance : [longitude, latitude], libellé, score", () => {
    expect(interpreterReponseGeocodage(reponse)).toEqual({
      position: { latitudeMicrodeg: 48_868_546, longitudeMicrodeg: 2_330_310 },
      libelle: "1 Rue de la Paix 75002 Paris",
      score: 0.96406,
    });
  });

  it("ne renvoie rien sans correspondance ni forme attendue : aucune position inventée", () => {
    expect(interpreterReponseGeocodage({ type: "FeatureCollection", features: [], query: "rue inexistante" })).toBeNull();
    expect(interpreterReponseGeocodage(null)).toBeNull();
    expect(interpreterReponseGeocodage("texte")).toBeNull();
    expect(interpreterReponseGeocodage({ features: [{ geometry: { coordinates: ["2", "48"] } }] })).toBeNull();
    expect(interpreterReponseGeocodage({ features: [{ geometry: { coordinates: [200, 48] } }] })).toBeNull();
  });

  it("se contente d'un libellé neutre et d'un score absent si le service ne les donne pas", () => {
    expect(interpreterReponseGeocodage({ features: [{ geometry: { coordinates: [2.33031, 48.868546] }, properties: {} }] })).toEqual({
      position: { latitudeMicrodeg: 48_868_546, longitudeMicrodeg: 2_330_310 },
      libelle: "adresse reconnue",
      score: null,
    });
  });
});
