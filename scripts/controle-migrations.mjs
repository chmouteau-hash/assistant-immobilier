#!/usr/bin/env node
// Arrête la CI si une migration déjà livrée a changé.
//
//   node scripts/controle-migrations.mjs [référence]      (défaut : origin/main)
//
// Une migration présente sur `main` s'applique à la base réelle au prochain accès, une seule fois
// (`src/lib/db/client.ts`). Si son fichier change ensuite, la base réelle garde l'ancien schéma,
// et les tests, qui repartent chaque fois d'une base neuve, passent sur le nouveau : rien ne le
// signale. Ce contrôle compare le dossier des migrations à ce qu'il était au point où la branche
// a quitté la référence. Un fichier ajouté passe ; un fichier modifié, renommé ou retiré arrête.
//
// Ne modifie rien : il lit l'historique git. Il lui faut l'historique complet (dans la CI,
// `fetch-depth: 0`).

import { execFileSync } from "node:child_process";

const DOSSIER = "src/lib/db/migrations";
const reference = process.argv[2] || "origin/main";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

let depart;
try {
  depart = git("merge-base", reference, "HEAD");
} catch {
  console.error(`Contrôle des migrations impossible : aucun point commun entre « ${reference} » et le commit courant.`);
  console.error("La référence est inconnue, ou l'historique git est incomplet (`git fetch --unshallow`).");
  process.exit(2);
}

// `--no-renames` : un fichier renommé se lit « retiré » puis « ajouté », donc refusé.
const changements = git("-c", "core.quotepath=false", "diff", "--name-status", "--no-renames", depart, "--", DOSSIER)
  .split("\n")
  .filter((ligne) => ligne !== "")
  .map((ligne) => {
    const [statut, fichier] = ligne.split("\t");
    return { statut, fichier };
  });

const NATURES = { M: "modifiée", D: "retirée ou renommée", T: "changée de type" };
const refusees = changements.filter((c) => c.statut !== "A");

if (refusees.length > 0) {
  console.error("Une migration déjà livrée ne se modifie plus : on en ajoute une.");
  for (const c of refusees) console.error(`  ${c.fichier} : ${NATURES[c.statut] ?? c.statut}`);
  console.error(`Comparaison faite avec ${depart.slice(0, 7)}, point où la branche a quitté « ${reference} ».`);
  process.exit(1);
}

const ajoutees = changements.map((c) => c.fichier);
console.log(
  ajoutees.length === 0
    ? "Migrations : aucune ne change."
    : `Migrations : ${ajoutees.length} ajoutée(s), aucune migration livrée ne change (${ajoutees.join(", ")}).`,
);
