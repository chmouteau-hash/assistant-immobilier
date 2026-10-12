// Histoires Storybook de `RechercheEndroit` : chercher un endroit, puis y situer un lieu.
//
// Aucune histoire n'appelle le service d'adresses : la liste des endroits est écrite ici à la main,
// et rien ne s'enregistre. Les histoires qui montrent une réponse se jouent toutes seules (fonction
// `play`) : elles tapent un texte et cliquent sur « Chercher ».

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EtatFormulaire, EtatRecherche } from "@/app/dossiers/actions";
import type { Endroit } from "@/domain/geo";
import { ENREGISTRE, actionFictive } from "../../.storybook/doublures/action-fictive";
import { RechercheEndroit } from "./RechercheEndroit";

const COMMUNE = { codePostal: "00100", ville: "Ville-Fictive" };
const POSITION = { latitudeMicrodeg: 48868546, longitudeMicrodeg: 2330310 };

const ENDROITS: Endroit[] = [
  { id: "commune", libelle: "00100 Ville-Fictive", nature: "commune", codePostal: "00100", position: POSITION, parties: { voie: null, commune: COMMUNE } },
  { id: "rue", libelle: "Rue des Tilleuls 00100 Ville-Fictive", nature: "rue", codePostal: "00100", position: POSITION, parties: { voie: "Rue des Tilleuls", commune: COMMUNE } },
  { id: "adresse", libelle: "12 Rue des Tilleuls 00100 Ville-Fictive", nature: "adresse", codePostal: "00100", position: POSITION, parties: { voie: "12 Rue des Tilleuls", commune: COMMUNE } },
  { id: "lieu-dit", libelle: "Les Essarts 00100 Ville-Fictive", nature: "lieu-dit", codePostal: "00100", position: POSITION, parties: { voie: "Les Essarts", commune: COMMUNE } },
];

/** Une recherche fictive : elle répond `resultats` pour n'importe quel texte. */
function chercher(resultats: Endroit[] | null, erreur: string | null = null) {
  return actionFictive<EtatRecherche>("actionChercher", (champs) => ({ erreur, texte: String(champs.recherche ?? ""), resultats }));
}

const meta = {
  title: "Lieux/RechercheEndroit",
  component: RechercheEndroit,
  args: {
    dossierId: "dossier-fictif",
    lieuId: "lieu-fictif",
    adresseActuelle: null,
    actionChercher: chercher(ENDROITS),
    actionSituer: actionFictive<EtatFormulaire>("actionSituer", () => ENREGISTRE),
  },
} satisfies Meta<typeof RechercheEndroit>;

export default meta;
type Histoire = StoryObj<typeof meta>;

export const AvantLaRecherche: Histoire = { name: "Avant la recherche" };

/**
 * Le lieu n'a pas encore d'adresse : la case qui propose d'enregistrer celle de l'endroit choisi
 * est cochée au départ.
 */
export const PlusieursEndroits: Histoire = {
  name: "Plusieurs endroits",
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox"), "tilleuls");
    await userEvent.click(canvas.getByRole("button", { name: "Chercher" }));
    await canvas.findAllByRole("button", { name: "Situer ici" });
  },
};

/** Le lieu a déjà une adresse : elle n'est jamais remplacée d'office, la case n'est pas cochée. */
export const LieuQuiADejaUneAdresse: Histoire = {
  name: "Lieu qui a déjà une adresse",
  args: { adresseActuelle: "12 rue Fictive, 00100 Ville-Fictive" },
  play: PlusieursEndroits.play,
};

export const AucunEndroit: Histoire = {
  name: "Aucun endroit",
  args: { actionChercher: chercher([]) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox"), "tilleuls");
    await userEvent.click(canvas.getByRole("button", { name: "Chercher" }));
    await canvas.findByText(/Aucun endroit trouvé/);
  },
};

export const ServiceIndisponible: Histoire = {
  name: "Service indisponible",
  args: { actionChercher: chercher(null, "Le service d'adresses ne répond pas : vérifiez la connexion") },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox"), "tilleuls");
    await userEvent.click(canvas.getByRole("button", { name: "Chercher" }));
    await canvas.findByRole("alert");
  },
};
