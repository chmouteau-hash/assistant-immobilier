import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isFileLoadingAllowed, resolveConfig } from "vite";
import config from "../../.storybook/main";

// Garde-fou de Storybook. Laissé à ses réglages d'origine, il écoute sur tout le réseau local,
// sert tout fichier du dossier du projet (la base se téléchargeait à `/data/dossier.sqlite`) et
// envoie des statistiques d'usage à son éditeur. Ce test échoue si un réglage qui l'empêche
// disparaît de `package.json` ou de `.storybook/main.ts`.
//
// Il interroge la règle de Vite elle-même (`isFileLoadingAllowed`), pas la liste des motifs : il
// ne remplace pas un essai sur un Storybook lancé, il empêche d'oublier.

const RACINE = path.resolve(__dirname, "../..");
const chemin = (relatif: string) => path.join(RACINE, relatif).replaceAll("\\", "/");

describe("Storybook ne fait rien sortir du PC", () => {
  it("n'écoute que sur le PC, sans statistiques d'usage ni recherche de mise à jour", () => {
    const { scripts } = JSON.parse(readFileSync(path.join(RACINE, "package.json"), "utf8")) as { scripts: Record<string, string> };
    for (const reglage of ["--host 127.0.0.1", "--disable-telemetry", "--no-version-updates"]) expect(scripts.storybook).toContain(reglage);
    expect(scripts["build-storybook"]).toContain("--disable-telemetry");
    expect(config.core).toMatchObject({ disableTelemetry: true, disableWhatsNewNotifications: true });
  });

  it("son serveur refuse les données privées, et sert le reste", async () => {
    const finale = await config.viteFinal!({ root: RACINE, configFile: false }, {} as never);
    const resolue = await resolveConfig(finale, "serve");
    const prives = [
      "data/dossier.sqlite",
      "data/dossier.sqlite-wal",
      "data/fichiers/lieu-fictif/photo.jpg",
      "data/avant-restauration-2026-10-10/dossier.sqlite",
      "data/avant-restauration-2026-10-10/fichiers/devis.pdf",
      "sauvegardes/2026-10-10T08-00-00-000Z/dossier.sqlite",
      "sauvegardes/2026-10-10T08-00-00-000Z/manifeste.json",
      ".env.local",
    ];
    for (const prive of prives) expect(isFileLoadingAllowed(resolue, chemin(prive)), prive).toBe(false);
    expect(isFileLoadingAllowed(resolue, chemin("src/app/globals.css"))).toBe(true);
  });
});
