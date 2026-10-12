// Histoires Storybook de `CarteLieux`, la carte de l'écran Lieux.
//
// Ce qui sort du PC : afficher une de ces histoires demande les tuiles du fond de carte à
// `data.geopf.fr`, comme l'écran Lieux de l'application. C'est la seule chose : les positions sont
// fictives, l'adresse « la plus proche » est écrite ici à la main, et rien ne s'enregistre. Pour
// la même raison, ce composant n'a pas de page « Docs » : elle afficherait toutes les cartes
// d'un coup. Dans l'ordre du menu, ces histoires viennent en dernier (`.storybook/preview.tsx`).

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { action } from "storybook/actions";
import type { EtatAdresseProche, EtatFormulaire } from "@/app/dossiers/actions";
import { CONFIANCES, LIBELLES_CONFIANCE, LIBELLES_SOURCE, SOURCES } from "@/domain/provenance";
import type { Reference } from "@/lib/references";
import { ENREGISTRE, actionFictive, lireChamps } from "../../.storybook/doublures/action-fictive";
import { CarteLieux, type LieuSurCarte, type VoisinSurCarte } from "./CarteLieux";

const sources: Reference[] = SOURCES.map((code) => ({ code, libelle: LIBELLES_SOURCE[code] }));
const confiances: Reference[] = CONFIANCES.map((code) => ({ code, libelle: LIBELLES_CONFIANCE[code] }));

// Deux lieux situés, et un troisième sans position : la carte ne le montre pas.
const LIEUX: LieuSurCarte[] = [
  { id: "lieu-a", nom: "Bien fictif A", position: { latitudeMicrodeg: 48868546, longitudeMicrodeg: 2330310 } },
  { id: "lieu-b", nom: "Bien fictif B", position: { latitudeMicrodeg: 48860000, longitudeMicrodeg: 2345000 } },
  { id: "lieu-c", nom: "Bien fictif C", position: null },
];

// Un bien du même secteur, et un autre à plus de 30 km : la carte ne dézoome pas jusqu'à lui.
const VOISINS: VoisinSurCarte[] = [
  { id: "voisin-proche", nom: "Bien voisin fictif", dossierNom: "Autre dossier fictif", lien: "/dossiers/autre-dossier-fictif/lieux#lieu-voisin-proche", position: { latitudeMicrodeg: 48875000, longitudeMicrodeg: 2320000 } },
  { id: "voisin-loin", nom: "Bien lointain fictif", dossierNom: "Autre dossier fictif", lien: "/dossiers/autre-dossier-fictif/lieux#lieu-voisin-loin", position: { latitudeMicrodeg: 49300000, longitudeMicrodeg: 2600000 } },
];

const noterAdresseProche = action("actionAdresseProche");

/** Répond toujours la même adresse fictive, à 35 m du point cliqué. */
async function adresseProcheFictive(donnees: FormData): Promise<EtatAdresseProche> {
  noterAdresseProche(lireChamps(donnees));
  return {
    erreur: null,
    adresse: { libelle: "12 Rue des Tilleuls 00100 Ville-Fictive", distanceMetres: 35, parties: { voie: "12 Rue des Tilleuls", commune: { codePostal: "00100", ville: "Ville-Fictive" } } },
  };
}

const meta = {
  title: "Lieux/CarteLieux",
  component: CarteLieux,
  tags: ["!autodocs"],
  args: {
    dossierId: "dossier-fictif",
    lieux: LIEUX,
    voisins: [],
    peutEcrire: true,
    action: actionFictive<EtatFormulaire>("action", () => ENREGISTRE),
    sources,
    confiances,
    aPlacer: null,
    actionAdresseProche: adresseProcheFictive,
    actionSituerParClic: actionFictive<EtatFormulaire>("actionSituerParClic", () => ENREGISTRE),
    chemin: "/dossiers/dossier-fictif/lieux",
  },
} satisfies Meta<typeof CarteLieux>;

export default meta;
type Histoire = StoryObj<typeof meta>;

/** Déplacer un repère fait apparaître le formulaire qui confirme la nouvelle position. */
export const LieuxDuDossier: Histoire = { name: "Lieux du dossier" };

/** Les biens des autres dossiers que l'acteur peut lire : d'une autre couleur, et ils ne se déplacent pas. */
export const AvecLesAutresDossiers: Histoire = { name: "Avec les biens des autres dossiers", args: { voisins: VOISINS } };

/** Sans le droit d'écrire les lieux : les repères ne se déplacent pas. */
export const LectureSeule: Histoire = { name: "Lecture seule", args: { peutEcrire: false, voisins: VOISINS } };

/**
 * Mode « Choisir l'endroit sur la carte », pour un lieu sans adresse. Cliquer sur la carte pose un
 * point et fait apparaître l'adresse la plus proche, avec la case qui propose de l'enregistrer.
 */
export const ChoisirLEndroit: Histoire = {
  name: "Choisir l'endroit",
  args: { aPlacer: { id: "lieu-c", nom: "Bien fictif C", adresse: null } },
};

/** Le lieu à situer a déjà une adresse : après le clic, la case qui la remplacerait n'est pas cochée. */
export const ChoisirLEndroitAvecAdresse: Histoire = {
  name: "Choisir l'endroit, lieu qui a déjà une adresse",
  args: { aPlacer: { id: "lieu-c", nom: "Bien fictif C", adresse: "12 rue Fictive, 00100 Ville-Fictive" } },
};
