#!/usr/bin/env node
// Sauvegarde cohérente de la base ET des fichiers déposés, dans un dossier horodaté.
//
//   node scripts/sauvegarde.mjs [destination]      (défaut : ./sauvegardes)
//
// La base est copiée par `VACUUM INTO` (SQLite) : un instantané cohérent même si l'application
// tourne, contrairement à une copie brute du fichier qui peut attraper une écriture à moitié
// faite. Les fichiers (`data/fichiers/`) sont copiés tels quels. Un `manifeste.json` note la
// date, les chemins d'origine et la somme de contrôle de la base copiée — c'est ce que vérifie
// `restauration.mjs` avant d'écraser quoi que ce soit.
//
// Zéro dépendance : Node 24+ seulement. Aucun secret, aucune connexion réseau.

import { DatabaseSync } from "node:sqlite";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const racine = process.cwd();
const cheminBase = process.env.ASSISTANT_DB_PATH ?? path.join(racine, "data", "dossier.sqlite");
const cheminFichiers = process.env.ASSISTANT_FICHIERS_PATH ?? path.join(racine, "data", "fichiers");
const destinationRacine = process.argv[2] ?? path.join(racine, "sauvegardes");

if (!existsSync(cheminBase)) {
  console.error(`Base introuvable : ${cheminBase}`);
  process.exit(1);
}

const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(destinationRacine, horodatage);
mkdirSync(destination, { recursive: true });

// 1. Base : instantané cohérent.
const copieBase = path.join(destination, "dossier.sqlite");
const db = new DatabaseSync(cheminBase, { readOnly: true });
db.exec(`VACUUM INTO '${copieBase.replace(/\\/g, "/").replace(/'/g, "''")}'`);
db.close();

// 2. Fichiers déposés.
let nbFichiers = 0;
function compter(dossier) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if (entree.isDirectory()) compter(path.join(dossier, entree.name));
    else nbFichiers++;
  }
}
if (existsSync(cheminFichiers)) {
  cpSync(cheminFichiers, path.join(destination, "fichiers"), { recursive: true });
  compter(path.join(destination, "fichiers"));
}

// 3. Manifeste.
function lireVersionSchema(chemin) {
  const d = new DatabaseSync(chemin, { readOnly: true });
  try {
    return d.prepare("SELECT MAX(version) AS v FROM schema_migration").get()?.v ?? null;
  } catch {
    return null;
  } finally {
    d.close();
  }
}
const sha256 = createHash("sha256").update(readFileSync(copieBase)).digest("hex");
const manifeste = {
  date: new Date().toISOString(),
  origine: { base: cheminBase, fichiers: cheminFichiers },
  base: { fichier: "dossier.sqlite", sha256 },
  fichiers: { dossier: "fichiers", nombre: nbFichiers },
  version_schema: lireVersionSchema(copieBase),
};
writeFileSync(path.join(destination, "manifeste.json"), JSON.stringify(manifeste, null, 2));

console.log(`Sauvegarde écrite dans ${destination}`);
console.log(`  base : dossier.sqlite (schéma v${manifeste.version_schema}, sha256 ${sha256.slice(0, 12)}…)`);
console.log(`  fichiers : ${nbFichiers}`);
console.log("Conservez ce dossier sur un support privé (disque externe chiffré, coffre) : il contient des données personnelles.");
