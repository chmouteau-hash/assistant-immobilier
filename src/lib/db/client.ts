// Connexion à la base locale — un seul fichier SQLite sur le PC, jamais de serveur distant.
//
// `node:sqlite` est natif à Node (stable depuis la 24) : zéro dépendance npm, zéro compilation
// native (pas de node-gyp, pas de Visual Studio Build Tools à installer sur le PC de Christophe
// pour faire tourner l'application — un frein classique de `better-sqlite3` sous Windows).
//
// Le fichier vit dans `data/dossier.sqlite`, **exclu du dépôt git** (voir .gitignore) : c'est le
// principe déjà posé par la démonstration précédente (index.html, stockage navigateur) — les
// données du dossier immobilier ne quittent pas le PC, y compris vers le dépôt GitHub privé.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const CHEMIN_DONNEES = path.join(process.cwd(), "data", "dossier.sqlite");
const CHEMIN_SCHEMA = path.join(process.cwd(), "src", "lib", "db", "schema.sql");

let instance: DatabaseSync | null = null;

/**
 * Connexion partagée à la base locale. Le schéma est rejoué à chaque démarrage via des
 * `CREATE TABLE IF NOT EXISTS` / `INSERT OR IGNORE` : idempotent, donc sans risque sur une base
 * déjà peuplée.
 */
export function obtenirBase(): DatabaseSync {
  if (instance) return instance;
  mkdirSync(path.dirname(CHEMIN_DONNEES), { recursive: true });
  instance = new DatabaseSync(CHEMIN_DONNEES);
  instance.exec("PRAGMA foreign_keys = ON;");
  instance.exec(readFileSync(CHEMIN_SCHEMA, "utf8"));
  return instance;
}

/**
 * Exécute `fn` dans une transaction SQLite : soit toutes les écritures passent, soit aucune.
 * Utilisé partout où une opération métier doit s'accompagner de son événement d'audit — un
 * événement ne doit jamais exister sans son effet, ni l'inverse (même principe qu'Ergonomia,
 * `inserer_audit` appelé dans la transaction de l'opération).
 */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = obtenirBase();
  db.exec("BEGIN");
  try {
    const resultat = fn(db);
    db.exec("COMMIT");
    return resultat;
  } catch (erreur) {
    db.exec("ROLLBACK");
    throw erreur;
  }
}
