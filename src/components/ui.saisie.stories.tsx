// Histoires Storybook des champs de saisie (ui.tsx) : `Champ`, `Select`, et les deux questions de
// provenance posées dans les formulaires.

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CONFIANCES, LIBELLES_CONFIANCE, LIBELLES_SOURCE, REPONSE_HABITUELLE, SOURCES } from "@/domain/provenance";
import type { Reference } from "@/lib/references";
import { Champ, QuestionConfiance, QuestionSource, Select, classeSaisie } from "./ui";

// Dans l'application, ces listes se lisent dans les tables `ref_*`. Ici, les mêmes codes, écrits
// à la main : une histoire n'ouvre pas la base.
const STATUTS: Reference[] = [
  { code: "a_faire", libelle: "À faire" },
  { code: "en_cours", libelle: "En cours" },
  { code: "bloque", libelle: "Bloquée" },
  { code: "fait", libelle: "Faite" },
];
const SCENARIOS: Reference[] = [
  { code: "scenario-1", libelle: "Scénario fictif A" },
  { code: "scenario-2", libelle: "Scénario fictif B" },
];
const sources: Reference[] = SOURCES.map((code) => ({ code, libelle: LIBELLES_SOURCE[code] }));
const confiances: Reference[] = CONFIANCES.map((code) => ({ code, libelle: LIBELLES_CONFIANCE[code] }));

const meta = {
  title: "Éléments de base/Champs de saisie",
  component: Champ,
  args: { label: "Description", children: <input name="description" className={classeSaisie} /> },
} satisfies Meta<typeof Champ>;

export default meta;
type Histoire = StoryObj<typeof meta>;

export const Texte: Histoire = {};

/** `large` : dans une ligne de formulaire, le champ prend la place qui reste. */
export const Large: Histoire = {
  args: { large: true },
  decorators: [
    (Story) => (
      <div className="flex flex-wrap items-end gap-2">
        <Story />
        <Champ label="Responsable">
          <input name="responsable" className={`${classeSaisie} w-28`} />
        </Champ>
      </div>
    ),
  ],
};

export const ListeDeroulante: Histoire = {
  name: "Liste déroulante",
  args: { label: "Statut", children: <Select name="statut" options={STATUTS} defaultValue="en_cours" /> },
};

/** `vide` ajoute un premier choix sans valeur, choisi quand rien n'est enregistré. */
export const ListeAvecChoixVide: Histoire = {
  name: "Liste avec un choix vide",
  args: { label: "Scénario", children: <Select name="scenarioId" options={SCENARIOS} vide="— aucun —" /> },
};

/**
 * Les deux questions qui suivent une valeur tracée. Les réponses proposées viennent de
 * `domain/provenance.ts`, pas des libellés des tables de référence.
 */
export const QuestionsDeProvenance: Histoire = {
  name: "Questions de provenance",
  render: () => (
    <div className="flex flex-wrap items-end gap-2">
      <QuestionSource name="surfaceSource" sources={sources} defaultValue="saisie" />
      <QuestionConfiance name="surfaceConfiance" confiances={confiances} vide={REPONSE_HABITUELLE} />
    </div>
  ),
};
