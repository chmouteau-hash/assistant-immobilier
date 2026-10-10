// Issue #20 : une section hors périmètre doit répondre « page introuvable », comme un dossier
// inconnu, et non par une erreur serveur. Le refus reste journalisé.
//
// `next/headers` et `next/navigation` n'existent que pendant une requête : ils sont remplacés ici
// par le strict nécessaire (le cookie de l'acteur simulé, et un `notFound` reconnaissable).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requete, PageIntrouvable } = vi.hoisted(() => ({
  requete: { acteurSimule: undefined as string | undefined },
  PageIntrouvable: class PageIntrouvable extends Error {},
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (nom === "acteur_simule" && requete.acteurSimule ? { value: requete.acteurSimule } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new PageIntrouvable();
  },
}));

import { reinitialiserBasePourTests } from "@/lib/db/client";
import { creerDossier, journalAudit } from "@/lib/dossiers";
import { inviterPersonne } from "@/lib/personnes";
import { obtenirActeurPourSection } from "@/lib/acteur-courant";
import type { Acteur } from "@/lib/acces";

const moi: Acteur = { personneId: "utilisateur-local", nom: "Utilisateur local" };

describe("acteur d'une page de section", () => {
  beforeEach(() => {
    reinitialiserBasePourTests();
    requete.acteurSimule = undefined;
  });

  it("le propriétaire entre dans toutes les sections", async () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    for (const section of ["lieux", "budget", "taches", "droits", "ia"] as const) {
      expect(await obtenirActeurPourSection(d.id, section)).toMatchObject({ personneId: moi.personneId, simule: false });
    }
  });

  it("un professionnel entre dans son périmètre ; ailleurs, la page est introuvable et le refus est tracé", async () => {
    const d = creerDossier(moi, { nom: "Pilote" });
    const p = inviterPersonne(moi, { dossierId: d.id, nom: "Notaire", type: "professionnel", profession: "notaire", role: "professionnel", perimetre: ["documents", "lieux"], finalite: "Acte de vente" });
    requete.acteurSimule = p.personneId;

    expect(await obtenirActeurPourSection(d.id, "documents")).toMatchObject({ personneId: p.personneId, simule: true });
    await expect(obtenirActeurPourSection(d.id, "budget")).rejects.toBeInstanceOf(PageIntrouvable);
    await expect(obtenirActeurPourSection(d.id, "droits")).rejects.toBeInstanceOf(PageIntrouvable);

    const refus = journalAudit(moi, d.id).filter((e) => e.action === "acces_refuse" && e.acteurId === p.personneId);
    expect(refus.map((e) => e.motif).sort()).toEqual(["lire sur budget", "lire sur droits"]);
  });

  it("un dossier inconnu répond de la même façon", async () => {
    await expect(obtenirActeurPourSection("n-existe-pas", "lieux")).rejects.toBeInstanceOf(PageIntrouvable);
  });
});

describe("pages de section d'un dossier", () => {
  const RACINE = path.resolve(__dirname, "../../src/app/dossiers/[id]");
  // La vue d'ensemble a sa propre règle : elle renvoie vers la première section lisible.
  const VUE_ENSEMBLE = path.join(RACINE, "page.tsx");

  function pages(dossier: string): string[] {
    return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) return pages(chemin);
      return entree.name === "page.tsx" ? [chemin] : [];
    });
  }

  it("chacune demande son acteur par `obtenirActeurPourSection`", () => {
    const sections = pages(RACINE).filter((p) => p !== VUE_ENSEMBLE);
    expect(sections.length).toBeGreaterThanOrEqual(10);
    const oublis = sections.filter((p) => !/\bawait obtenirActeurPourSection\(id, "[a-z]+"\)/.test(readFileSync(p, "utf8")));
    expect(oublis.map((p) => path.relative(RACINE, p).replaceAll("\\", "/"))).toEqual([]);
    expect(readFileSync(VUE_ENSEMBLE, "utf8")).toMatch(/notFound\(\)/);
  });
});
