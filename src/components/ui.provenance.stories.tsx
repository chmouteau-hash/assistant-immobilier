// Histoires Storybook de `Provenance` (ui.tsx) : une valeur ne s'affiche jamais sans sa source et
// son degré de confiance, et une valeur absente s'affiche « À renseigner », jamais 0.

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { formaterSurface } from "@/domain/mesure";
import { formaterMontant } from "@/lib/montant";
import { Provenance } from "./ui";

const meta = {
  title: "Éléments de base/Provenance",
  component: Provenance<number>,
  // Une surface, en centièmes de m² : 9250 s'affiche « 92,5 m² ».
  args: { formater: formaterSurface },
} satisfies Meta<typeof Provenance<number>>;

export default meta;
type Histoire = StoryObj<typeof meta>;

/** L'inconnu n'est jamais 0 : une valeur absente est `null`. */
export const ARenseigner: Histoire = {
  name: "À renseigner",
  args: { valeur: { valeur: null, source: null, confiance: "a_renseigner" } },
};

export const Connue: Histoire = {
  args: { valeur: { valeur: 9250, source: "saisie", confiance: "connu" } },
};

export const Estimee: Histoire = {
  name: "Estimée",
  args: { valeur: { valeur: 8000, source: "estimation", confiance: "estime" } },
};

/** Une annonce ou le dire d'un professionnel : pas « connu » tant que ce n'est pas vérifié. */
export const AConfirmer: Histoire = {
  name: "À confirmer",
  args: { valeur: { valeur: 11000, source: "source_externe", confiance: "a_confirmer" } },
};

export const SuggestionIA: Histoire = {
  name: "Suggestion de l'IA",
  args: { valeur: { valeur: 9000, source: "suggestion_ia", confiance: "a_confirmer" } },
};

/** Un montant, en centimes. La note se lit en laissant la souris sur la valeur. */
export const Montant: Histoire = {
  args: {
    formater: formaterMontant,
    valeur: { valeur: 1234500, source: "import", confiance: "connu", note: "devis fictif" },
  },
};
