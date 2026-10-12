// Configuration de Storybook : l'atelier qui affiche chaque composant de `src/components` seul,
// dans ses différents états, sans lancer l'application ni ouvrir la base (`npm run storybook`).
//
// Ce que ce fichier garantit :
// - Rien ne part vers l'éditeur de Storybook : ni statistiques d'usage, ni recherche de
//   nouveautés. Les scripts de `package.json` le redisent (`--disable-telemetry`,
//   `--no-version-updates`), pour que le réglage tienne même si ce fichier ne se charge pas.
// - Les données privées ne sont pas servies. Le serveur de Storybook (Vite) donne à qui le demande
//   tout fichier du dossier du projet, et ce dossier contient `data/` et `sauvegardes/` : sans
//   `DONNEES_PRIVEES`, la base se téléchargeait à l'adresse `/data/dossier.sqlite`. Second verrou,
//   dans `package.json` : `--host 127.0.0.1`, parce que Storybook écoute sinon sur tout le réseau.
// - Aucun code serveur n'entre dans l'atelier. Storybook tourne dans le navigateur, où ni `lib`
//   ni la base SQLite n'existent, et une histoire ne doit rien écrire dans un dossier : un
//   composant qui importe les Server Actions reçoit à leur place les doublures de
//   `doublures/actions.ts`.
//
// `tests/outillage/storybook.test.ts` échoue si l'un de ces réglages disparaît.

import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";

// Ce que Vite refuse par défaut. Donner sa propre liste remplace celle-ci : on la reprend.
const REFUS_DE_VITE = [".env", ".env.*", "*.{crt,pem}", "**/.git/**"];

/**
 * Les données privées, telles que `.gitignore` les nomme : une entrée ajoutée là-bas s'ajoute ici.
 * Un motif sans barre oblique vaut pour le nom du fichier, où qu'il soit.
 */
export const DONNEES_PRIVEES = ["*.sqlite", "*.sqlite-*", "**/data/fichiers/**", "**/data/avant-restauration-*/**", "**/sauvegardes/**"];

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  // Le guide de démarrage de Storybook propose de publier l'atelier chez son éditeur : retiré.
  features: { sidebarOnboardingChecklist: false, menuOnboardingChecklist: false },
  async viteFinal(configVite) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(configVite, {
      server: { fs: { deny: [...REFUS_DE_VITE, ...DONNEES_PRIVEES] } },
      resolve: {
        alias: [{ find: /^@\/app\/dossiers\/actions$/, replacement: fileURLToPath(new URL("./doublures/actions.ts", import.meta.url)) }],
      },
    });
  },
};

export default config;
