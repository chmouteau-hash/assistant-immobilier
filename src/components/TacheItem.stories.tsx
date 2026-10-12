// Histoires Storybook de `TacheItem`, une action de l'accueil ou de l'écran « Actions ».
//
// Ce composant importe deux Server Actions. Dans Storybook, il reçoit à leur place les doublures
// de `.storybook/doublures/actions.ts` : changer un statut ou corriger une action n'écrit rien, et
// l'onglet « Actions » montre ce que le formulaire a envoyé.

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { Reference } from "@/lib/references";
import type { Tache, TacheAvecDossier } from "@/lib/taches";
import { TacheItem } from "./TacheItem";

// Les codes de la table `ref_statut_tache`, écrits à la main : une histoire n'ouvre pas la base.
const STATUTS: Reference[] = [
  { code: "a_faire", libelle: "À faire" },
  { code: "en_cours", libelle: "En cours" },
  { code: "bloque", libelle: "Bloquée" },
  { code: "fait", libelle: "Faite" },
];

const TACHE: Tache = {
  id: "tache-fictive",
  dossierId: "dossier-fictif",
  scenarioId: null,
  description: "Demander un devis de toiture (fictif)",
  echeance: "2027-03-12",
  responsable: "Personne fictive",
  responsablePersonneId: null,
  statut: "a_faire",
  estJalon: false,
  source: "saisie",
  createdAt: "2026-10-01T08:00:00.000Z",
};

const SUR_L_ACCUEIL: TacheAvecDossier = { ...TACHE, dossierNom: "Dossier fictif", prerequisBloquants: ["tache-prealable-1", "tache-prealable-2"] };

const meta = {
  title: "Dossier/TacheItem",
  component: TacheItem,
  args: { tache: TACHE, statuts: STATUTS },
  // Le composant est une ligne de liste : il lui faut la liste autour.
  decorators: [
    (Story) => (
      <ul className="flex flex-col gap-2">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof TacheItem>;

export default meta;
type Histoire = StoryObj<typeof meta>;

export const AFaire: Histoire = { name: "À faire" };

export const Jalon: Histoire = { args: { tache: { ...TACHE, estJalon: true, statut: "en_cours" } } };

/** Rien n'est inventé : une échéance inconnue reste inconnue, un responsable absent est à désigner. */
export const SansEcheanceNiResponsable: Histoire = {
  name: "Sans échéance ni responsable",
  args: { tache: { ...TACHE, echeance: null, responsable: null } },
};

/** Sur l'accueil : le nom du dossier suit la description, et les prérequis non faits sont comptés. */
export const SurLAccueil: Histoire = {
  name: "Sur l'accueil",
  args: { tache: SUR_L_ACCUEIL, dossierNom: SUR_L_ACCUEIL.dossierNom },
};

/** Sans le droit d'écrire les actions : le statut se lit, la liste déroulante n'existe pas. */
export const LectureSeule: Histoire = { name: "Lecture seule", args: { peutModifier: false } };

/** Écran « Actions » du dossier : « Modifier » ouvre la correction, avec le rattachement à un scénario. */
export const Corrigeable: Histoire = {
  args: {
    corrigeable: true,
    scenarios: [
      { id: "scenario-1", nom: "Scénario fictif A" },
      { id: "scenario-2", nom: "Scénario fictif B" },
    ],
  },
};
