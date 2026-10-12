// Histoires Storybook de `Pastille` et de `EtiquetteSourceConfiance` (ui.tsx).

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EtiquetteSourceConfiance, Pastille } from "./ui";

const meta = {
  title: "Éléments de base/Pastille",
  component: Pastille,
  args: { children: "jalon", ton: "neutre" },
} satisfies Meta<typeof Pastille>;

export default meta;
type Histoire = StoryObj<typeof meta>;

export const Neutre: Histoire = {};

/** Une valeur qui manque, ou qui n'est pas encore sûre. */
export const Attention: Histoire = { args: { ton: "attention", children: "À renseigner" } };

/** Une valeur connue. */
export const Ok: Histoire = { name: "OK", args: { ton: "ok", children: "saisie · connu" } };

/** Ce qui vient de l'assistant, et attend une confirmation humaine. */
export const IA: Histoire = { name: "IA", args: { ton: "ia", children: "suggestion de l'IA · à confirmer" } };

export const LesQuatreTons: Histoire = {
  name: "Les quatre tons",
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Pastille>neutre</Pastille>
      <Pastille ton="attention">attention</Pastille>
      <Pastille ton="ok">ok</Pastille>
      <Pastille ton="ia">ia</Pastille>
    </div>
  ),
};

/**
 * `EtiquetteSourceConfiance` choisit le ton toute seule : vert si la valeur est connue, violet si
 * elle vient de l'IA, orange sinon. Les mots viennent de `domain/provenance.ts`.
 */
export const SourceEtConfiance: Histoire = {
  name: "Étiquette source · confiance",
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <EtiquetteSourceConfiance source="saisie" confiance="connu" />
      <EtiquetteSourceConfiance source="estimation" confiance="estime" />
      <EtiquetteSourceConfiance source="source_externe" confiance="a_confirmer" />
      <EtiquetteSourceConfiance source="suggestion_ia" confiance="a_confirmer" />
    </div>
  ),
};
