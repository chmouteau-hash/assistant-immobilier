#!/usr/bin/env node
// Restauration d'une sauvegarde produite par `sauvegarde.mjs`.
//
//   node scripts/restauration.mjs <dossier-de-sauvegarde> --confirmer
//
// Sans `--confirmer`, le script vérifie seulement la sauvegarde (manifeste, somme de contrôle) et
// dit ce qu'il ferait. Avec, il met d'abord de côté la base et les fichiers ACTUELS
// (`data/avant-restauration-<date>/`) puis les remplace. L'application doit être arrêtée.

import { cpSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const racine = process.cwd();
const cheminBase = process.env.ASSISTANT_DB_PATH ?? path.join(racine, "data", "dossier.sqlite");
const cheminFichiers = process.env.ASSISTANT_FICHIERS_PATH ?? path.join(racine, "data", "fichiers");
const source = process.argv[2];
const confirmer = process.argv.includes("--confirmer");

if (!source || !existsSync(path.join(source, "manifeste.json"))) {
  console.error("Usage : node scripts/restauration.mjs <dossier-de-sauvegarde> [--confirmer]");
  process.exit(1);
}

const manifeste = JSON.parse(readFileSync(path.join(source, "manifeste.json"), "utf8"));
const copieBase = path.join(source, manifeste.base.fichier);
const sha256 = createHash("sha256").update(readFileSync(copieBase)).digest("hex");
if (sha256 !== manifeste.base.sha256) {
  console.error(`Somme de contrôle différente du manifeste : la sauvegarde est altérée ou incomplète.\n  attendu ${manifeste.base.sha256}\n  obtenu  ${sha256}`);
  process.exit(2);
}
console.log(`Sauvegarde du ${manifeste.date} — schéma v${manifeste.version_schema}, ${manifeste.fichiers.nombre} fichier(s), somme de contrôle OK.`);

if (!confirmer) {
  console.log(`\nSans --confirmer, rien n'est modifié. Avec, le script :\n  1. déplace ${cheminBase} et ${cheminFichiers} dans data/avant-restauration-<date>/ ;\n  2. copie la base et les fichiers de la sauvegarde à leur place.\nArrêtez l'application avant.`);
  process.exit(0);
}

const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
const miseDeCote = path.join(path.dirname(cheminBase), `avant-restauration-${horodatage}`);
mkdirSync(miseDeCote, { recursive: true });
for (const suffixe of ["", "-wal", "-shm"]) {
  const f = `${cheminBase}${suffixe}`;
  if (existsSync(f)) renameSync(f, path.join(miseDeCote, path.basename(f)));
}
if (existsSync(cheminFichiers)) renameSync(cheminFichiers, path.join(miseDeCote, "fichiers"));

mkdirSync(path.dirname(cheminBase), { recursive: true });
cpSync(copieBase, cheminBase);
if (existsSync(path.join(source, manifeste.fichiers.dossier))) {
  cpSync(path.join(source, manifeste.fichiers.dossier), cheminFichiers, { recursive: true });
}
console.log(`Restauration faite. L'état précédent est conservé dans ${miseDeCote} (à supprimer une fois la restauration vérifiée).`);
console.log("Au prochain démarrage, les migrations plus récentes que la sauvegarde seront appliquées automatiquement.");
