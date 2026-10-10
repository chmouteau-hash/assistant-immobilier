// Connexion à la base locale — un seul fichier SQLite sur le PC, jamais de serveur distant.
//
// `node:sqlite` est natif à Node (stable depuis la 24) : zéro dépendance npm, zéro compilation
// native. Le fichier vit dans `data/dossier.sqlite`, **exclu du dépôt git** : les données du
// dossier immobilier ne quittent pas le PC.
//
// Migrations versionnées : `migrations/NNN_nom.sql` appliquées dans l'ordre, une seule fois
// chacune (table `schema_migration`). Un fichier appliqué ne doit plus jamais être modifié — on
// en ajoute un nouveau. Chaque migration tourne dans une transaction : soit elle passe
// entièrement, soit la base reste à l'état précédent.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const RACINE = process.cwd();
const CHEMIN_MIGRATIONS = path.join(RACINE, "src", "lib", "db", "migrations");

/** Chemin de la base : surchargeable par variable d'environnement (tests : `:memory:`). */
export function cheminBase(): string {
  return process.env.ASSISTANT_DB_PATH ?? path.join(RACINE, "data", "dossier.sqlite");
}

/** Dossier des fichiers déposés (photos, devis, factures) — même principe, local et hors git. */
export function cheminFichiers(): string {
  return process.env.ASSISTANT_FICHIERS_PATH ?? path.join(RACINE, "data", "fichiers");
}

let instance: DatabaseSync | null = null;

function appliquerMigrations(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
    version    INTEGER PRIMARY KEY,
    nom        TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  const appliquees = new Set(
    (db.prepare(`SELECT version FROM schema_migration`).all() as Array<{ version: number }>).map((l) => l.version),
  );

  const fichiers = readdirSync(CHEMIN_MIGRATIONS)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  // Clés étrangères coupées pendant les migrations (SQLite interdit sinon `ADD COLUMN …
  // REFERENCES … DEFAULT <non NULL>`), puis vérification d'intégrité avant de les réactiver.
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    for (const fichier of fichiers) {
      const version = Number.parseInt(fichier.slice(0, 3), 10);
      if (appliquees.has(version)) continue;
      const sql = readFileSync(path.join(CHEMIN_MIGRATIONS, fichier), "utf8");
      db.exec("BEGIN");
      try {
        db.exec(sql);
        db.prepare(`INSERT INTO schema_migration (version, nom) VALUES (?, ?)`).run(version, fichier);
        db.exec("COMMIT");
      } catch (erreur) {
        db.exec("ROLLBACK");
        throw new Error(`Migration ${fichier} échouée : ${(erreur as Error).message}`);
      }
    }
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(`Intégrité référentielle violée après migration : ${JSON.stringify(violations)}`);
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function ouvrir(chemin: string): DatabaseSync {
  if (chemin !== ":memory:") mkdirSync(path.dirname(chemin), { recursive: true });
  const db = new DatabaseSync(chemin);
  appliquerMigrations(db);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

/** Connexion partagée à la base locale (migrations appliquées au premier appel). */
export function obtenirBase(): DatabaseSync {
  if (instance) return instance;
  instance = ouvrir(cheminBase());
  return instance;
}

/**
 * Tests uniquement : remplace la connexion partagée par une base NEUVE en mémoire, migrée.
 * Chaque test repart d'une base vide, sans toucher à `data/dossier.sqlite`.
 */
export function reinitialiserBasePourTests(): DatabaseSync {
  if (instance) instance.close();
  instance = ouvrir(":memory:");
  return instance;
}

/**
 * Exécute `fn` dans une transaction SQLite : soit toutes les écritures passent, soit aucune.
 * Utilisé partout où une opération métier doit s'accompagner de son événement d'audit — un
 * événement ne doit jamais exister sans son effet, ni l'inverse.
 */
let profondeurTransaction = 0;

export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = obtenirBase();
  // Réentrant : un appel imbriqué (ex. validerExtraction → creerPoste → ajouterLigne) s'exécute
  // dans la transaction englobante ; une erreur remonte et fait tout annuler d'un bloc.
  if (profondeurTransaction > 0) {
    profondeurTransaction++;
    try {
      return fn(db);
    } finally {
      profondeurTransaction--;
    }
  }
  db.exec("BEGIN");
  profondeurTransaction = 1;
  try {
    const resultat = fn(db);
    db.exec("COMMIT");
    return resultat;
  } catch (erreur) {
    db.exec("ROLLBACK");
    throw erreur;
  } finally {
    profondeurTransaction = 0;
  }
}

/**
 * `node:sqlite` renvoie des lignes à PROTOTYPE NULL, que React refuse de transmettre d'un
 * composant serveur vers un composant client. Cette fonction reconstruit un objet ordinaire en
 * convertissant `snake_case` → `camelCase`. Le type retourné est celui que déclare l'appelant :
 * c'est la liste de colonnes du SELECT qui fait foi.
 */
export function versObjet<T>(ligne: Record<string, unknown>): T {
  const resultat: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(ligne)) {
    const camel = cle.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    resultat[camel] = valeur;
  }
  return resultat as T;
}

export function versObjets<T>(lignes: unknown[]): T[] {
  return (lignes as Record<string, unknown>[]).map((l) => versObjet<T>(l));
}
