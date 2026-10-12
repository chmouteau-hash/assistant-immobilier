// Fabrique d'actions fictives pour les histoires. Un composant reçoit ses Server Actions en
// propriété, ou les importe (voir `actions.ts`, à côté) ; ici, on lui en donne une fausse, qui :
// - n'écrit rien et n'appelle aucun serveur ;
// - montre dans l'onglet « Actions » de Storybook les champs que le formulaire a envoyés, champs
//   cachés compris : c'est ce qu'une vraie Server Action recevrait ;
// - répond ce que l'histoire a choisi (réussite, message d'erreur, liste de résultats), tout de
//   suite ou après un délai, pour voir l'état « en cours ».

import { action } from "storybook/actions";
import type { EtatFormulaire } from "@/app/dossiers/actions";

export type Champs = Record<string, FormDataEntryValue>;

/** La réponse d'une action qui a réussi : le formulaire affiche « Enregistré. » */
export const ENREGISTRE: EtatFormulaire = { erreur: null, ok: true };

/** Ce qu'un formulaire a envoyé, sous une forme lisible dans l'onglet « Actions ». */
export function lireChamps(donnees: FormData): Champs {
  return Object.fromEntries(donnees);
}

export function attendre(ms: number): Promise<void> {
  return new Promise((suite) => setTimeout(suite, ms));
}

export function actionFictive<Etat>(nom: string, repondre: (champs: Champs) => Etat, delaiMs = 0) {
  const noter = action(nom);
  return async (_etat: Etat, donnees: FormData): Promise<Etat> => {
    const champs = lireChamps(donnees);
    noter(champs);
    if (delaiMs > 0) await attendre(delaiMs);
    return repondre(champs);
  };
}
