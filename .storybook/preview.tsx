// Ce qui entoure chaque histoire : la feuille de style de l'application (Tailwind compris) et le
// cadre de page de `app/layout.tsx` et de `app/dossiers/[id]/layout.tsx` (fond, couleur du texte,
// marges), pour qu'un composant se voie ici comme dans l'application.

import type { Preview } from "@storybook/nextjs-vite";
import "../src/app/globals.css";

const preview: Preview = {
  // Chaque composant reçoit une page « Docs » qui rassemble ses histoires.
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    // Les composants servent sous `src/app` (App Router) : `next/navigation` leur est fourni.
    nextjs: { appDirectory: true },
    // La carte des lieux vient en dernier : Storybook s'ouvre sur la première histoire, et celle
    // de la carte demande son fond de carte au réseau.
    options: { storySort: { order: ["Éléments de base", "Formulaires", "Dossier", "Lieux", ["RechercheEndroit", "CarteLieux"]] } },
  },
  decorators: [
    (Histoire, contexte) => (
      <div className="bg-neutral-50 px-6 py-8 text-neutral-900 antialiased" style={contexte.viewMode === "story" ? { minHeight: "100vh" } : undefined}>
        <Histoire />
      </div>
    ),
  ],
};

export default preview;
