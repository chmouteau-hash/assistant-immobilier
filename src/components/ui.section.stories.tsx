// Histoires Storybook de `Section` et de `Vide` (ui.tsx) : le découpage d'un écran en blocs titrés,
// et la phrase qui tient lieu de contenu quand il n'y a encore rien.

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Section, Vide } from "./ui";

const meta = {
  title: "Éléments de base/Section",
  component: Section,
  args: {
    titre: "Titre de la section",
    sousTitre: "Une phrase qui dit ce que la section contient.",
    children: <p className="text-sm">Le contenu de la section vient ici.</p>,
  },
} satisfies Meta<typeof Section>;

export default meta;
type Histoire = StoryObj<typeof meta>;

export const AvecSousTitre: Histoire = { name: "Avec sous-titre" };

export const SansSousTitre: Histoire = { name: "Sans sous-titre", args: { sousTitre: undefined } };

/** `Vide` : rien à montrer encore. La phrase dit quoi faire, sans afficher 0 ni une liste vide. */
export const SectionVide: Histoire = {
  name: "Section vide",
  args: { children: <Vide>Rien pour l&apos;instant. La première saisie apparaîtra ici.</Vide> },
};
