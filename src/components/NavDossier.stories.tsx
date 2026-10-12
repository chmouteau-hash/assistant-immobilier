// Histoires Storybook de `NavDossier`, la barre d'onglets d'un dossier. L'onglet courant se déduit
// de l'adresse de la page : chaque histoire en donne une fausse (`nextjs.navigation.pathname`).
// Un clic sur un onglet ne mène nulle part : Storybook le note dans l'onglet « Actions ».

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LIBELLES_SECTION } from "@/domain/droits";
import { NavDossier, type OngletDossier } from "./NavDossier";

const DOSSIER = "/dossiers/dossier-fictif";

// Les onglets d'un propriétaire, dans l'ordre de `app/dossiers/[id]/layout.tsx`.
const ONGLETS: OngletDossier[] = [
  { href: DOSSIER, libelle: "Vue d'ensemble" },
  { href: `${DOSSIER}/lieux`, libelle: LIBELLES_SECTION.lieux },
  { href: `${DOSSIER}/idees`, libelle: LIBELLES_SECTION.idees },
  { href: `${DOSSIER}/scenarios`, libelle: LIBELLES_SECTION.scenarios },
  { href: `${DOSSIER}/budget`, libelle: LIBELLES_SECTION.budget },
  { href: `${DOSSIER}/documents`, libelle: LIBELLES_SECTION.documents },
  { href: `${DOSSIER}/actions`, libelle: LIBELLES_SECTION.taches },
  { href: `${DOSSIER}/personnes`, libelle: LIBELLES_SECTION.personnes },
  { href: `${DOSSIER}/assistant`, libelle: LIBELLES_SECTION.ia },
  { href: `${DOSSIER}/journal`, libelle: "Journal d'audit" },
];

const meta = {
  title: "Dossier/NavDossier",
  component: NavDossier,
  args: { onglets: ONGLETS },
  parameters: { nextjs: { navigation: { pathname: `${DOSSIER}/lieux` } } },
} satisfies Meta<typeof NavDossier>;

export default meta;
type Histoire = StoryObj<typeof meta>;

export const OngletCourant: Histoire = { name: "Onglet courant" };

/** La vue d'ensemble n'est active que sur sa propre adresse, pas sur celles des autres onglets. */
export const VueDEnsemble: Histoire = {
  name: "Vue d'ensemble",
  parameters: { nextjs: { navigation: { pathname: DOSSIER } } },
};

/** Sur la page d'un document, l'onglet « Documents et photos » reste l'onglet courant. */
export const SousPage: Histoire = {
  name: "Sous-page",
  parameters: { nextjs: { navigation: { pathname: `${DOSSIER}/documents/document-fictif` } } },
};

/** Un professionnel ne voit que les sections de son périmètre : les autres onglets n'existent pas. */
export const PerimetreReduit: Histoire = {
  name: "Périmètre réduit",
  args: { onglets: ONGLETS.filter((o) => [DOSSIER, `${DOSSIER}/lieux`, `${DOSSIER}/documents`].includes(o.href)) },
};

/**
 * À la souris, les onglets passent à la ligne. Au doigt, ils tiennent sur une seule ligne qui
 * défile : cela dépend du pointeur, pas de la largeur, et ne se voit donc que sur un téléphone.
 */
export const EcranEtroit: Histoire = {
  name: "Écran étroit",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
