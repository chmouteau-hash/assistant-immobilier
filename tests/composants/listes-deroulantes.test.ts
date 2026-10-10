import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fou de l'issue #16. React ne met jamais à jour le choix de départ d'une liste déroulante
// déjà affichée, puis remet le formulaire à zéro après chaque action : une liste dont le
// `defaultValue` vient d'une donnée réaffichait l'ancienne valeur après un enregistrement réussi.
// Le remède est une `key` égale à cette valeur, qui recrée la liste quand elle change.
//
// Ce test lit le code source : il ne remplace pas un essai dans un navigateur, il empêche
// d'oublier la `key` sur une nouvelle liste.

const RACINE = path.resolve(__dirname, "../../src");

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return fichiersTsx(chemin);
    return entree.name.endsWith(".tsx") ? [chemin] : [];
  });
}

/** Balises ouvrantes `<select …>` d'un source, en suivant les accolades (un `>` peut s'y trouver). */
function balisesSelect(source: string): string[] {
  const balises: string[] = [];
  let debut = source.indexOf("<select");
  while (debut !== -1) {
    let profondeur = 0;
    let fin = debut;
    for (; fin < source.length; fin++) {
      const c = source[fin];
      if (c === "{") profondeur++;
      else if (c === "}") profondeur--;
      else if (c === ">" && profondeur === 0) break;
    }
    balises.push(source.slice(debut, fin + 1));
    debut = source.indexOf("<select", fin);
  }
  return balises;
}

/** Expression de `defaultValue={…}` si elle est calculée ; `null` si l'attribut est absent ou fixe. */
function valeurDeDepartCalculee(balise: string): string | null {
  const expression = /\bdefaultValue=\{([^}]*)\}/.exec(balise)?.[1].trim();
  if (expression === undefined) return null;
  return /^(["'])[^"']*\1$/.test(expression) ? null : expression;
}

describe("listes déroulantes et valeur enregistrée (issue #16)", () => {
  it("reconnaît une valeur de départ calculée, pas une valeur fixe", () => {
    expect(valeurDeDepartCalculee(`<select name="statut" defaultValue={idee.statut}>`)).toBe("idee.statut");
    expect(valeurDeDepartCalculee(`<select name="scenarioId" defaultValue={i.scenarioId ?? ""}>`)).toBe(`i.scenarioId ?? ""`);
    expect(valeurDeDepartCalculee(`<select name="type" defaultValue="particulier">`)).toBeNull();
    expect(valeurDeDepartCalculee(`<select name="lieuId" defaultValue={""}>`)).toBeNull();
    expect(valeurDeDepartCalculee(`<select name="posteId">`)).toBeNull();
  });

  it("isole la balise même si un attribut contient un chevron", () => {
    const source = `<p><select name="a" onChange={(e) => suivre(e)} defaultValue={v}><option /></select></p>`;
    expect(balisesSelect(source)).toEqual([`<select name="a" onChange={(e) => suivre(e)} defaultValue={v}>`]);
  });

  it("toute liste dont la valeur de départ vient d'une donnée porte une `key`", () => {
    const oublis: string[] = [];
    for (const fichier of fichiersTsx(RACINE)) {
      for (const balise of balisesSelect(readFileSync(fichier, "utf8"))) {
        if (valeurDeDepartCalculee(balise) !== null && !/\bkey=\{/.test(balise)) {
          oublis.push(`${path.relative(RACINE, fichier).replaceAll("\\", "/")} : ${balise.replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(oublis).toEqual([]);
  });
});
