#!/usr/bin/env node
// Affiche l'adresse à taper sur le téléphone pour ouvrir l'application depuis le même réseau Wi-Fi.
//
//   node scripts/adresse-reseau.mjs [port]      (défaut : 3000)
//
// Ne modifie rien. Le serveur doit être lancé avec `npm run dev:reseau` ou `npm run start:reseau`
// (écoute sur toutes les interfaces, pas seulement localhost).

import { networkInterfaces } from "node:os";

const port = process.argv[2] ?? "3000";
const adresses = Object.entries(networkInterfaces())
  .flatMap(([nom, liste]) => (liste ?? []).map((a) => ({ nom, ...a })))
  .filter((a) => a.family === "IPv4" && !a.internal);

if (adresses.length === 0) {
  console.log("Aucune adresse réseau trouvée : le PC n'est pas connecté à un réseau.");
  process.exit(0);
}

console.log("Sur le téléphone (même Wi-Fi que ce PC), ouvrir :");
for (const a of adresses) console.log(`  http://${a.address}:${port}    (${a.nom})`);
console.log("\nRappels :");
console.log("  - lancer le serveur avec `npm run dev:reseau` (ou `npm run start:reseau` après `npm run build`) ;");
console.log("  - au premier lancement, Windows demande d'autoriser Node sur le réseau privé : accepter ;");
console.log("  - sans authentification, toute personne connectée à ce Wi-Fi peut ouvrir le dossier : réseau de confiance seulement, arrêter le serveur après l'essai.");
