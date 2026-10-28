// Total des surfaces des pièces d'un bâtiment (issue #2) : une pièce sans surface ne compte pas
// pour zéro, le total le dit partiel, et la confiance la plus faible l'accompagne.

import { describe, expect, it } from "vitest";
import { decrireTotalSurfaces, totalSurfacesPieces } from "@/domain/mesure";
import type { ValeurTracee } from "@/domain/provenance";

const connue = (centiemes: number): ValeurTracee<number> => ({ valeur: centiemes, source: "saisie", confiance: "connu" });
const estimee = (centiemes: number): ValeurTracee<number> => ({ valeur: centiemes, source: "estimation", confiance: "estime" });
const inconnue: ValeurTracee<number> = { valeur: null, source: null, confiance: "a_renseigner" };

describe("total des surfaces des pièces", () => {
  it("additionne les surfaces renseignées, en centièmes de m²", () => {
    expect(totalSurfacesPieces([connue(1250), connue(3000)])).toEqual({ totalCentiemes: 4250, renseignees: 2, pieces: 2, reserve: null });
    expect(decrireTotalSurfaces(totalSurfacesPieces([connue(1250), connue(3000)]))).toBe("42,5 m² (2 pièces)");
    expect(decrireTotalSurfaces(totalSurfacesPieces([connue(1200)]))).toBe("12 m² (1 pièce)");
  });

  it("ne compte pas une pièce sans surface pour zéro : le total est partiel", () => {
    const t = totalSurfacesPieces([connue(1200), inconnue, connue(1800)]);
    expect(t).toEqual({ totalCentiemes: 3000, renseignees: 2, pieces: 3, reserve: null });
    expect(decrireTotalSurfaces(t)).toBe("30 m², partiel : 2 pièces sur 3");
    expect(decrireTotalSurfaces(totalSurfacesPieces([connue(900), inconnue]))).toBe("9 m², partiel : 1 pièce sur 2");
  });

  it("garde la confiance la plus faible des surfaces renseignées", () => {
    const t = totalSurfacesPieces([connue(1200), estimee(800)]);
    expect(t.reserve).toBe("estime");
    expect(decrireTotalSurfaces(t)).toBe("20 m² (2 pièces) · estimé");
  });

  it("reste à renseigner quand aucune pièce n'a de surface, et le dit quand il n'y a pas de pièce", () => {
    expect(totalSurfacesPieces([inconnue, inconnue]).totalCentiemes).toBeNull();
    expect(decrireTotalSurfaces(totalSurfacesPieces([inconnue, inconnue]))).toBe("à renseigner (aucune des 2 pièces n'a de surface)");
    expect(decrireTotalSurfaces(totalSurfacesPieces([inconnue]))).toBe("à renseigner (la pièce n'a pas de surface)");
    expect(decrireTotalSurfaces(totalSurfacesPieces([]))).toBe("aucune pièce");
  });
});
