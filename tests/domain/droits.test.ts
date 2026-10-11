import { describe, expect, it } from "vitest";
import { peut, peutRetirerProprietaire, sectionsLisibles, SECTIONS, type Participation } from "@/domain/droits";

const participations: Participation[] = [
  { personneId: "christophe", role: "proprietaire", perimetre: [], revoqueeLe: null },
  { personneId: "compagne", role: "contributeur", perimetre: [], revoqueeLe: null },
  { personneId: "ami", role: "lecteur", perimetre: [], revoqueeLe: null },
  { personneId: "notaire", role: "professionnel", perimetre: ["documents", "lieux"], revoqueeLe: null },
  { personneId: "ancien-artisan", role: "professionnel", perimetre: ["budget"], revoqueeLe: "2026-09-01T00:00:00Z" },
];

describe("peut", () => {
  it("un inconnu n'a aucun accès (isolation entre dossiers)", () => {
    for (const s of SECTIONS) expect(peut(participations, "inconnu", "lire", s)).toBe(false);
  });

  it("le propriétaire peut tout", () => {
    expect(peut(participations, "christophe", "gerer_droits", "droits")).toBe(true);
    expect(peut(participations, "christophe", "activer_ia", "ia")).toBe(true);
    expect(peut(participations, "christophe", "supprimer_dossier", "identite")).toBe(true);
  });

  it("le contributeur écrit mais ne gère ni droits ni IA", () => {
    expect(peut(participations, "compagne", "ecrire", "budget")).toBe(true);
    expect(peut(participations, "compagne", "ecrire", "scenarios")).toBe(true);
    expect(peut(participations, "compagne", "lire", "droits")).toBe(true);
    expect(peut(participations, "compagne", "gerer_droits", "droits")).toBe(false);
    expect(peut(participations, "compagne", "activer_ia", "ia")).toBe(false);
    expect(peut(participations, "compagne", "supprimer_dossier", "identite")).toBe(false);
    expect(peut(participations, "compagne", "exporter", "identite")).toBe(false);
    expect(peut(participations, "christophe", "exporter", "identite")).toBe(true);
    expect(peut(participations, "notaire", "exporter", "documents")).toBe(false);
  });

  it("le lecteur lit tout sauf les droits, n'écrit rien", () => {
    expect(peut(participations, "ami", "lire", "budget")).toBe(true);
    expect(peut(participations, "ami", "lire", "droits")).toBe(false);
    expect(peut(participations, "ami", "ecrire", "taches")).toBe(false);
  });

  it("le professionnel ne voit que son périmètre et ne touche ni aux droits ni à l'IA", () => {
    expect(peut(participations, "notaire", "lire", "documents")).toBe(true);
    expect(peut(participations, "notaire", "lire", "lieux")).toBe(true);
    expect(peut(participations, "notaire", "lire", "budget")).toBe(false);
    expect(peut(participations, "notaire", "lire", "personnes")).toBe(false);
    expect(peut(participations, "notaire", "ecrire", "documents")).toBe(true); // dépose une pièce
    expect(peut(participations, "notaire", "ecrire", "lieux")).toBe(false); // ne modifie pas le bien
    expect(peut(participations, "notaire", "activer_ia", "ia")).toBe(false);
    expect(sectionsLisibles(participations, "notaire")).toEqual(["lieux", "documents"]);
  });

  it("qui écrit les lieux lit aussi les idées, le budget et les documents", () => {
    // Le refus de retirer un objet non vide nomme ce qui y est rattaché (lib/structure.ts) : la
    // phrase ne doit rien apprendre à quelqu'un qui ne pourrait pas le lire ailleurs.
    const roles: Participation[] = [
      { personneId: "proprietaire", role: "proprietaire", perimetre: [], revoqueeLe: null },
      { personneId: "contributeur", role: "contributeur", perimetre: [], revoqueeLe: null },
      { personneId: "lecteur", role: "lecteur", perimetre: [], revoqueeLe: null },
      { personneId: "pro-lieux", role: "professionnel", perimetre: ["lieux"], revoqueeLe: null },
      { personneId: "pro-tout", role: "professionnel", perimetre: [...SECTIONS], revoqueeLe: null },
    ];
    const ecrivent = roles.filter((p) => peut(roles, p.personneId, "ecrire", "lieux")).map((p) => p.personneId);
    expect(ecrivent).toEqual(["proprietaire", "contributeur"]);
    for (const id of ecrivent) for (const s of ["idees", "budget", "documents"] as const) expect(peut(roles, id, "lire", s)).toBe(true);
  });

  it("un accès révoqué ne vaut plus rien", () => {
    expect(peut(participations, "ancien-artisan", "lire", "budget")).toBe(false);
  });

  it("un professionnel n'accède jamais à « droits » ni « ia », même listés dans son périmètre", () => {
    const p: Participation[] = [{ personneId: "pro", role: "professionnel", perimetre: ["droits", "ia", "budget"], revoqueeLe: null }];
    expect(peut(p, "pro", "lire", "droits")).toBe(false);
    expect(peut(p, "pro", "lire", "ia")).toBe(false);
    expect(peut(p, "pro", "lire", "budget")).toBe(true);
  });
});

describe("peutRetirerProprietaire", () => {
  it("refuse de retirer le dernier propriétaire actif", () => {
    expect(peutRetirerProprietaire(participations, "christophe")).toBe(false);
    const deux: Participation[] = [...participations, { personneId: "associe", role: "proprietaire", perimetre: [], revoqueeLe: null }];
    expect(peutRetirerProprietaire(deux, "christophe")).toBe(true);
  });
  it("ne contraint pas les autres rôles", () => {
    expect(peutRetirerProprietaire(participations, "notaire")).toBe(true);
  });
});
