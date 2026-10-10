import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/**
 * Adresses IPv4 locales du PC (Wi-Fi, Ethernet). En développement, Next.js refuse les requêtes
 * venant d'un autre nom d'hôte que celui de démarrage : pour tester depuis un téléphone sur le même
 * réseau (http://192.168.x.x:3000), chaque adresse doit être déclarée dans `allowedDevOrigins`.
 * Calculé au démarrage : rien à écrire à la main quand l'adresse change.
 */
function adressesLocales(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a!.address);
}

const originesSupplementaires = (process.env.ASSISTANT_ORIGINES_DEV ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o !== "");

const nextConfig: NextConfig = {
  // Noms d'hôte (sans schéma ni port) autorisés à charger les ressources du serveur de
  // développement. Sans effet en production (`next start`).
  allowedDevOrigins: [...adressesLocales(), ...originesSupplementaires],
  experimental: {
    serverActions: {
      // Dépôt de photos et de PDF via Server Action (défaut : 1 Mo). La limite métier par fichier
      // est dans src/lib/documents.ts (ASSISTANT_FICHIER_MAX_OCTETS, 20 Mo par défaut).
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
