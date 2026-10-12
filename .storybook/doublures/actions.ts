// Doublures des Server Actions, pour Storybook seulement. Une doublure tient la place d'une vraie
// fonction le temps d'un essai : même nom, même forme, aucun effet.
//
// `main.ts` met ce fichier à la place de `src/app/dossiers/actions.ts` pour tout composant qui
// l'importe. Le vrai fichier tire derrière lui `lib` et la base SQLite, qui n'existent que sur le
// serveur ; Storybook tourne dans le navigateur, et une histoire ne doit rien écrire.
//
// N'y figurent que les actions importées par un composant qui a une histoire. S'il en manque une,
// Storybook s'arrête en la nommant : l'ajouter ici, sur le même modèle. Le type de chaque doublure
// fait échouer `npm run typecheck` si elle ne correspond plus à l'action qu'elle remplace.

import type * as Actions from "@/app/dossiers/actions";
import { ENREGISTRE, actionFictive } from "./action-fictive";

export const actionChangerStatutTache: typeof Actions.actionChangerStatutTache = actionFictive("actionChangerStatutTache", () => ENREGISTRE);
export const actionModifierTache: typeof Actions.actionModifierTache = actionFictive("actionModifierTache", () => ENREGISTRE);
