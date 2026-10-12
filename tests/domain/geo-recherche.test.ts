// Chercher un endroit et trouver l'adresse la plus proche d'un point (issue #48) : lecture des
// réponses du service d'adresses, sans réseau. Communes, rues et codes postaux sont fictifs ; seule
// la forme des réponses est celle du service.

import { describe, expect, it } from "vitest";
import {
  NB_ENDROITS_MAX,
  communesDuCodePostal,
  estCodePostal,
  formaterDistance,
  fusionnerEndroits,
  interpreterReponseInverse,
  interpreterResultatsRecherche,
  noteEndroit,
  type Endroit,
} from "@/domain/geo";

const element = (type: string, label: string, postcode: string, coordinates: unknown, id: string) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties: { type, label, postcode, id },
});

const endroit = (id: string, libelle: string, nature: Endroit["nature"] = "commune", codePostal: string | null = "00100"): Endroit => ({
  id,
  libelle,
  nature,
  codePostal,
  position: { latitudeMicrodeg: 46_500_000, longitudeMicrodeg: 2_500_000 },
  parties: { voie: null, commune: null },
});

describe("propositions du service pour un texte cherché", () => {
  it("lit chaque proposition : nature, position, et code postal devant le nom d'une commune", () => {
    const reponse = {
      type: "FeatureCollection",
      features: [
        element("municipality", "Ville-Fictive", "00100", [2.5, 46.5], "00101"),
        element("street", "Rue des Tilleuls 00100 Ville-Fictive", "00100", [2.51, 46.51], "00101_0042"),
        element("housenumber", "12 Rue des Tilleuls 00100 Ville-Fictive", "00100", [2.512, 46.512], "00101_0042_00012"),
        element("locality", "Les Essarts 00100 Ville-Fictive", "00100", [2.52, 46.52], "00101_b001"),
        element("inconnu", "Ailleurs 00100 Ville-Fictive", "00100", [2.53, 46.53], "x1"),
      ],
    };
    expect(interpreterResultatsRecherche(reponse)).toMatchObject([
      { id: "commune:00101", libelle: "00100 Ville-Fictive", nature: "commune", codePostal: "00100", position: { latitudeMicrodeg: 46_500_000, longitudeMicrodeg: 2_500_000 } },
      { id: "rue:00101_0042", libelle: "Rue des Tilleuls 00100 Ville-Fictive", nature: "rue", codePostal: "00100", position: { latitudeMicrodeg: 46_510_000, longitudeMicrodeg: 2_510_000 } },
      { id: "adresse:00101_0042_00012", libelle: "12 Rue des Tilleuls 00100 Ville-Fictive", nature: "adresse", codePostal: "00100", position: { latitudeMicrodeg: 46_512_000, longitudeMicrodeg: 2_512_000 } },
      { id: "lieu-dit:00101_b001", libelle: "Les Essarts 00100 Ville-Fictive", nature: "lieu-dit", codePostal: "00100", position: { latitudeMicrodeg: 46_520_000, longitudeMicrodeg: 2_520_000 } },
      { id: "endroit:x1", libelle: "Ailleurs 00100 Ville-Fictive", nature: "endroit", codePostal: "00100", position: { latitudeMicrodeg: 46_530_000, longitudeMicrodeg: 2_530_000 } },
    ]);
  });

  it("ignore ce qui ne peut pas être placé ou nommé, et ne propose rien d'une réponse sans forme", () => {
    const reponse = {
      features: [
        element("municipality", "Sans-Position", "00100", ["2", "46"], "a"),
        element("municipality", "Hors-Bornes", "00100", [200, 46], "b"),
        element("municipality", "   ", "00100", [2.5, 46.5], "c"),
        null,
        element("municipality", "Ville-Fictive", "00100", [2.5, 46.5], "d"),
      ],
    };
    expect(interpreterResultatsRecherche(reponse).map((e) => e.libelle)).toEqual(["00100 Ville-Fictive"]);
    expect(interpreterResultatsRecherche(null)).toEqual([]);
    expect(interpreterResultatsRecherche({ features: "texte" })).toEqual([]);
    expect(interpreterResultatsRecherche({ features: [] })).toEqual([]);
  });

  it("sans identifiant du service, deux endroits de même nature se distinguent par leur position", () => {
    const sansId = (label: string, coordinates: number[]) => ({ geometry: { coordinates }, properties: { type: "municipality", label, postcode: "00100" } });
    const ids = interpreterResultatsRecherche({ features: [sansId("Ville-Une", [2.5, 46.5]), sansId("Ville-Deux", [2.6, 46.6])] }).map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("reconnaît un code postal saisi seul", () => {
    expect(estCodePostal("00100")).toBe(true);
    expect(estCodePostal(" 00100 ")).toBe(true);
    expect(estCodePostal("0010")).toBe(false);
    expect(estCodePostal("00100 Ville-Fictive")).toBe(false);
    expect(estCodePostal("001000")).toBe(false);
  });

  it("communes d'un code postal : celles du code exact, par ordre alphabétique", () => {
    const recues = [
      endroit("commune:3", "00100 Ville-Fictive"),
      endroit("commune:1", "00100 Bourg-Fictif"),
      endroit("commune:9", "00190 Voisine-Fictive", "commune", "00190"),
      endroit("rue:7", "Rue du 00100 00200 Ailleurs", "rue", "00200"),
      endroit("commune:2", "00100 Écart-Fictif"),
    ];
    expect(communesDuCodePostal("00100", recues).map((e) => e.libelle)).toEqual(["00100 Bourg-Fictif", "00100 Écart-Fictif", "00100 Ville-Fictive"]);
    // Aucune commune de ce code exact : celles que le service a jugées proches sont montrées, pas une liste vide.
    expect(communesDuCodePostal("00300", recues).map((e) => e.libelle)).toEqual(["00100 Bourg-Fictif", "00100 Écart-Fictif", "00100 Ville-Fictive", "00190 Voisine-Fictive"]);
    expect(communesDuCodePostal("00100", [])).toEqual([]);
  });

  it("réunit les propositions : communes devant pour un texte sans chiffre, ordre du service sinon, sans doublon", () => {
    const rueHomonyme = endroit("rue:8", "Ville-Fictive 00900 Autre-Bourg", "rue", "00900");
    const commune = endroit("commune:3", "00100 Ville-Fictive");
    const adresse = endroit("adresse:5", "12 Rue des Tilleuls 00100 Ville-Fictive", "adresse");
    expect(fusionnerEndroits("Ville-Fictive", [rueHomonyme, commune], [commune]).map((e) => e.id)).toEqual(["commune:3", "rue:8"]);
    expect(fusionnerEndroits("12 rue des Tilleuls", [adresse, rueHomonyme], [commune]).map((e) => e.id)).toEqual(["adresse:5", "rue:8", "commune:3"]);
    expect(fusionnerEndroits("Ville-Fictive", [], [])).toEqual([]);
  });

  it("limite la liste d'un texte libre", () => {
    const beaucoup = Array.from({ length: NB_ENDROITS_MAX + 4 }, (_, i) => endroit(`rue:${i}`, `Rue ${i} 00100 Ville-Fictive`, "rue"));
    expect(fusionnerEndroits("rue", beaucoup, [])).toHaveLength(NB_ENDROITS_MAX);
  });

  it("note d'une position choisie dans la liste : dit ce qui n'est pas une adresse précise", () => {
    expect(noteEndroit(endroit("commune:3", "00100 Ville-Fictive"))).toBe("00100 Ville-Fictive (commune)");
    expect(noteEndroit(endroit("rue:8", "Rue des Tilleuls 00100 Ville-Fictive", "rue"))).toBe("Rue des Tilleuls 00100 Ville-Fictive (rue)");
    expect(noteEndroit(endroit("adresse:5", "12 Rue des Tilleuls 00100 Ville-Fictive", "adresse"))).toBe("12 Rue des Tilleuls 00100 Ville-Fictive");
  });
});

describe("adresse connue la plus proche d'un point", () => {
  const proche = (label: unknown, distance: unknown) => ({ features: [{ geometry: { coordinates: [2.5, 46.5] }, properties: { type: "housenumber", label, distance } }] });

  it("lit le libellé et la distance, arrondie au mètre", () => {
    expect(interpreterReponseInverse(proche("12 Rue des Tilleuls 00100 Ville-Fictive", 34.6))).toMatchObject({ libelle: "12 Rue des Tilleuls 00100 Ville-Fictive", distanceMetres: 35 });
    expect(interpreterReponseInverse(proche("12 Rue des Tilleuls 00100 Ville-Fictive", 0))).toMatchObject({ libelle: "12 Rue des Tilleuls 00100 Ville-Fictive", distanceMetres: 0 });
  });

  it("garde l'adresse sans distance si le service n'en donne pas une lisible", () => {
    expect(interpreterReponseInverse(proche("12 Rue des Tilleuls 00100 Ville-Fictive", undefined))).toMatchObject({ libelle: "12 Rue des Tilleuls 00100 Ville-Fictive", distanceMetres: null });
    expect(interpreterReponseInverse(proche("12 Rue des Tilleuls 00100 Ville-Fictive", -3))?.distanceMetres).toBeNull();
    expect(interpreterReponseInverse(proche("12 Rue des Tilleuls 00100 Ville-Fictive", "près"))?.distanceMetres).toBeNull();
  });

  it("ne renvoie rien loin de toute adresse : aucune adresse inventée", () => {
    expect(interpreterReponseInverse({ type: "FeatureCollection", features: [] })).toBeNull();
    expect(interpreterReponseInverse(proche("  ", 12))).toBeNull();
    expect(interpreterReponseInverse(proche(undefined, 12))).toBeNull();
    expect(interpreterReponseInverse(null)).toBeNull();
  });

  it("affiche une distance en mètres, puis en kilomètres", () => {
    expect(formaterDistance(0)).toBe("0 m");
    expect(formaterDistance(35)).toBe("35 m");
    expect(formaterDistance(999)).toBe("999 m");
    expect(formaterDistance(1000)).toBe("1 km");
    expect(formaterDistance(1240)).toBe("1,2 km");
  });
});
