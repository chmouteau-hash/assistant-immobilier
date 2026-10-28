import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fou de la charte graphique (issue #71, DECISIONS.md du 2026-10-28). Trois règles décidées
// se lisent dans le code source :
// - le gris pâle `text-neutral-400` n'écrit plus de texte : il n'atteint que 2,58:1 sur blanc ;
// - le texte discret est toujours en italique, seul ce qui le distingue du texte d'aide, du même
//   gris ;
// - les quatre jetons de couleur restent déclarés dans le thème, sans quoi leurs classes ne
//   produiraient plus rien, sans erreur.
//
// Ce test lit le code source : il ne mesure aucun contraste à l'écran.

const RACINE = path.resolve(__dirname, "../../src");

function fichiers(dossier: string, extensions: string[]): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return fichiers(chemin, extensions);
    return extensions.some((e) => entree.name.endsWith(e)) ? [chemin] : [];
  });
}

const relatif = (chemin: string) => path.relative(RACINE, chemin).replaceAll("\\", "/");

describe("charte graphique", () => {
  const sources = fichiers(RACINE, [".tsx", ".ts", ".css"]).map((f) => ({ fichier: relatif(f), lignes: readFileSync(f, "utf8").split("\n") }));

  it("n'écrit plus de texte en gris pâle (text-neutral-400)", () => {
    const fautifs = sources.flatMap(({ fichier, lignes }) => lignes.flatMap((l, i) => (l.includes("text-neutral-400") ? [`${fichier}:${i + 1}`] : [])));
    expect(fautifs).toEqual([]);
  });

  it("met toujours le texte discret en italique", () => {
    // Les écrans seulement : le commentaire de globals.css cite la classe sans l'employer.
    const emplois = sources.filter((s) => s.fichier.endsWith(".tsx")).flatMap(({ fichier, lignes }) => lignes.flatMap((l, i) => (l.includes("text-texte-discret") ? [{ ou: `${fichier}:${i + 1}`, italique: /\bitalic\b/.test(l) }] : [])));
    expect(emplois.length).toBeGreaterThan(0);
    expect(emplois.filter((e) => !e.italique).map((e) => e.ou)).toEqual([]);
  });

  it("déclare les quatre jetons de couleur dans le thème", () => {
    const theme = /@theme\s*\{([^}]*)\}/.exec(readFileSync(path.join(RACINE, "app/globals.css"), "utf8"))?.[1] ?? "";
    for (const jeton of ["--color-accent:", "--color-accent-survol:", "--color-texte-discret:", "--color-bordure-champ:"]) {
      expect(theme, jeton).toContain(jeton);
    }
  });
});
