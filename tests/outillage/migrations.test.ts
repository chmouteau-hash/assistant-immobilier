import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Garde-fou des migrations. Une migration livrée qui change ne casse aucun autre test : ils
// repartent tous d'une base neuve, qui prend le fichier tel qu'il est. Seul
// `scripts/controle-migrations.mjs` le voit, dans la CI. Ce test joue ce script sur un dépôt git
// jetable, créé dans le dossier temporaire du système : il ne lit ni ne touche l'historique du
// projet, et ignore les réglages git du poste.

const SCRIPT = path.resolve(__dirname, "../../scripts/controle-migrations.mjs");
const MIGRATIONS = "src/lib/db/migrations";

let racine: string;
let depot: string;
let env: NodeJS.ProcessEnv;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: depot, env, encoding: "utf8", stdio: "pipe" }).trim();
}

function ecrire(nom: string, sql: string): void {
  writeFileSync(path.join(depot, MIGRATIONS, nom), sql);
}

function commiter(message: string): void {
  git("add", "-A");
  git("commit", "-q", "-m", message);
}

function controler(reference = "main"): { code: number | null; sortie: string } {
  const resultat = spawnSync(process.execPath, [SCRIPT, reference], { cwd: depot, env, encoding: "utf8" });
  return { code: resultat.status, sortie: resultat.stdout + resultat.stderr };
}

beforeEach(() => {
  racine = mkdtempSync(path.join(tmpdir(), "controle-migrations-"));
  depot = path.join(racine, "depot");
  mkdirSync(path.join(depot, MIGRATIONS), { recursive: true });
  const reglages = path.join(racine, "gitconfig");
  writeFileSync(reglages, "[user]\n\tname = Essai\n\temail = essai@exemple.invalid\n");
  env = { ...process.env, GIT_CONFIG_GLOBAL: reglages, GIT_CONFIG_NOSYSTEM: "1" };

  git("init", "-q", "-b", "main");
  ecrire("001_base.sql", "CREATE TABLE lieu (id INTEGER PRIMARY KEY);\n");
  commiter("base");
  git("switch", "-q", "-c", "travail");
});

afterEach(() => rmSync(racine, { recursive: true, force: true }));

describe("Une migration déjà livrée ne change plus", { timeout: 30_000 }, () => {
  it("laisse passer une branche qui ne touche pas aux migrations", () => {
    writeFileSync(path.join(depot, "LISEZMOI.md"), "Essai\n");
    commiter("autre chose");
    expect(controler()).toMatchObject({ code: 0 });
  });

  it("laisse passer une migration ajoutée, et la nomme", () => {
    ecrire("002_surface.sql", "ALTER TABLE lieu ADD COLUMN surface INTEGER;\n");
    commiter("migration 002");
    const { code, sortie } = controler();
    expect(code).toBe(0);
    expect(sortie).toContain("002_surface.sql");
  });

  it("arrête sur une migration livrée modifiée", () => {
    ecrire("001_base.sql", "CREATE TABLE lieu (id INTEGER PRIMARY KEY, nom TEXT);\n");
    commiter("retouche de 001");
    const { code, sortie } = controler();
    expect(code).toBe(1);
    expect(sortie).toContain("001_base.sql : modifiée");
  });

  it("arrête sur une migration livrée renommée", () => {
    renameSync(path.join(depot, MIGRATIONS, "001_base.sql"), path.join(depot, MIGRATIONS, "001_socle.sql"));
    commiter("renommage de 001");
    const { code, sortie } = controler();
    expect(code).toBe(1);
    expect(sortie).toContain("001_base.sql : retirée ou renommée");
  });

  it("voit une modification qui n'est pas encore commitée", () => {
    ecrire("001_base.sql", "CREATE TABLE lieu (id INTEGER PRIMARY KEY, nom TEXT);\n");
    expect(controler()).toMatchObject({ code: 1 });
  });

  it("ne prend pas pour un retrait une migration arrivée entre-temps sur main", () => {
    git("switch", "-q", "main");
    ecrire("002_surface.sql", "ALTER TABLE lieu ADD COLUMN surface INTEGER;\n");
    commiter("migration 002, par une autre PR");
    git("switch", "-q", "travail");
    ecrire("003_ville.sql", "ALTER TABLE lieu ADD COLUMN ville TEXT;\n");
    commiter("migration 003");
    expect(controler()).toMatchObject({ code: 0 });
  });

  it("se joue comme dans la CI : sur le commit de fusion, comparé à l'ancien main", () => {
    const ancienMain = git("rev-parse", "main");
    ecrire("001_base.sql", "CREATE TABLE lieu (id INTEGER PRIMARY KEY, nom TEXT);\n");
    commiter("retouche de 001");
    git("switch", "-q", "main");
    writeFileSync(path.join(depot, "LISEZMOI.md"), "Essai\n");
    commiter("main avance");
    git("merge", "-q", "--no-ff", "-m", "fusion d'essai", "travail");
    expect(controler(ancienMain)).toMatchObject({ code: 1 });
  });

  it("s'arrête, sans conclure, quand la référence est inconnue", () => {
    const { code, sortie } = controler("branche-inconnue");
    expect(code).toBe(2);
    expect(sortie).toContain("impossible");
  });
});
