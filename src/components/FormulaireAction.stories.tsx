// Histoires Storybook de `FormulaireAction`, l'enveloppe de tous les formulaires de l'application.
// L'action est fictive : rien ne s'enregistre, et l'onglet « Actions » de Storybook montre les
// champs qu'elle a reçus. Trois histoires se jouent toutes seules (fonction `play`) : elles
// remplissent le formulaire et l'envoient, pour montrer l'état qui suit.

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EtatFormulaire } from "@/app/dossiers/actions";
import { ENREGISTRE, actionFictive } from "../../.storybook/doublures/action-fictive";
import { FormulaireAction } from "./FormulaireAction";
import { Champ, classeSaisie } from "./ui";

const champs = (
  <>
    <input type="hidden" name="dossierId" value="dossier-fictif" />
    <Champ label="Description" large>
      <input name="description" required className={classeSaisie} />
    </Champ>
    <Champ label="Échéance (vide = inconnue)">
      <input name="echeance" type="date" className={classeSaisie} />
    </Champ>
  </>
);

const meta = {
  title: "Formulaires/FormulaireAction",
  component: FormulaireAction,
  args: {
    titre: "Ajouter une action",
    bouton: "Ajouter",
    children: champs,
    action: actionFictive<EtatFormulaire>("action", () => ENREGISTRE),
  },
} satisfies Meta<typeof FormulaireAction>;

export default meta;
type Histoire = StoryObj<typeof meta>;

export const Encadre: Histoire = { name: "Encadré" };

/** `compact` : sur une ligne, sans cadre, pour un formulaire glissé dans une fiche. */
export const Compact: Histoire = { args: { compact: true, titre: undefined, bouton: "OK" } };

export const Reussite: Histoire = {
  name: "Réussite",
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Description"), "Demander un devis (fictif)");
    await userEvent.click(canvas.getByRole("button", { name: "Ajouter" }));
    await canvas.findByText("Enregistré.");
  },
};

/**
 * L'action refuse : le message s'affiche, et la saisie reste en place. Sans ce composant, React 19
 * viderait le formulaire, erreur ou pas.
 */
export const Refus: Histoire = {
  args: {
    action: actionFictive<EtatFormulaire>("action", () => ({ erreur: "L'échéance doit être une date au format AAAA-MM-JJ, ou laissée vide (inconnue).", ok: false })),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Description"), "Demander un devis (fictif)");
    await userEvent.click(canvas.getByRole("button", { name: "Ajouter" }));
    await canvas.findByRole("alert");
  },
};

/** L'action ne répond pas encore : le bouton est désactivé, pour qu'on n'envoie pas deux fois. */
export const EnCours: Histoire = {
  name: "En cours",
  args: { action: () => new Promise<EtatFormulaire>(() => {}) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Description"), "Demander un devis (fictif)");
    await userEvent.click(canvas.getByRole("button", { name: "Ajouter" }));
  },
};
