# Jetons — du rôle à la classe Tailwind actuelle

Un **jeton de design** (_design token_ en anglais) est un nom donné une fois à une valeur de la
charte, que le reste du code réutilise au lieu de réécrire la valeur. Ce fichier prépare ce travail : il dit, pour chaque
rôle, quelle classe Tailwind le tient aujourd'hui, et dans quel fichier le voir.

- **Relevé du 2026-10-12**, sur le commit `22d2300` de `main`, dans `src/` et `.storybook/`.
- **Au relevé, le projet n'avait qu'un jeton** : `--font-sans`, dans le bloc `@theme` de
  `src/app/globals.css`. Tout le reste était une classe de la palette par défaut de Tailwind,
  écrite dans les pages et les composants.
- **Les noms de rôle de la première colonne sont des propositions.** Aucun n'existe dans le code.
- **Quatre jetons de couleur sont décidés et déclarés le 2026-10-28** (`DECISIONS.md`, CHARTE.md
  § 9), dans le même bloc `@theme` : `accent` (`cyan-800`, `#005f78`) et `accent-survol` (`cyan-900`, `#104e64`), pour le
  bouton principal et l'onglet courant ; `texte-discret` (`neutral-500`, `#737373`, en italique) ;
  `bordure-champ` (`#8e8e8e`, hors palette), pour les champs de saisie seulement. Les autres rôles
  gardent leurs classes.
- Les valeurs hexadécimales sont calculées à partir de `node_modules/tailwindcss/theme.css`
  (Tailwind 4.3.3) : méthode et contrôle dans [CHARTE.md](CHARTE.md), § 8.
- « Emplois » compte chaque écriture de la classe, variantes comprises (`hover:`, `disabled:`).

## Fonds

| Rôle (nom proposé) | Classe actuelle | Hex | Fichier d'usage principal | Emplois |
| --- | --- | --- | --- | --- |
| `fond-page` | `bg-neutral-50` | `#fafafa` | `src/app/layout.tsx:22` ; recopié dans `.storybook/preview.tsx:21` | 2 |
| `fond-carte` | `bg-white` | `#ffffff` | `src/app/dossiers/[id]/page.tsx` (4 emplois) ; champ : `src/components/ui.tsx:29` | 16 |
| `fond-carte-imbriquee` | `bg-neutral-50` | `#fafafa` | `src/app/dossiers/[id]/lieux/page.tsx:180` ; `src/components/CarteLieux.tsx:359` et `:382` | 3 |
| `fond-retrait` | `bg-neutral-100` | `#f5f5f5` | `src/app/dossiers/[id]/budget/page.tsx:76` ; aussi `src/app/dossiers/[id]/assistant/page.tsx:85`, `src/app/page.tsx:49`, `src/components/CarteLieux.tsx:327` | 4 |
| `fond-barre-onglets` | `bg-neutral-50/95` | `#fafafa` à 95 % | `src/components/NavDossier.tsx:40` | 1 |
| `fond-inverse` | `bg-neutral-900` | `#171717` | `src/components/CarteLieux.tsx:232` (repère d'un lieu) ; l'onglet courant et le bouton principal prennent le jeton `accent` depuis le 2026-10-28 | 3 |
| `fond-survol` | `hover:bg-neutral-200`, `hover:bg-neutral-100` | `#e5e5e5`, `#f5f5f5` | `src/components/NavDossier.tsx:52` ; `src/app/page.tsx:67` | 1 + 1 |

## Textes

| Rôle (nom proposé) | Classe actuelle | Hex | Fichier d'usage principal | Emplois |
| --- | --- | --- | --- | --- |
| `texte-principal` | `text-neutral-900` | `#171717` | `src/app/layout.tsx:22` | 9 |
| `texte-titre-section` | `text-neutral-800` | `#262626` | `src/components/ui.tsx:103` | 3 |
| `texte-secondaire` | `text-neutral-600` | `#525252` | `src/components/ui.tsx:21` (libellé de champ) | 34 |
| `texte-aide` | `text-neutral-500` | `#737373` | `src/components/ui.tsx:104` (sous-titre) et `:117` (état vide) | 78 |
| `texte-discret` | `text-texte-discret italic` (jeton, depuis le 2026-10-28 ; `text-neutral-400` avant) | `#737373` | `src/components/TacheItem.tsx:36` | 14 |
| `texte-inverse` | `text-white` | `#ffffff` | `src/components/NavDossier.tsx:52` | 3 |
| `texte-case-a-cocher` | `text-neutral-700` | `#404040` | `src/components/RechercheEndroit.tsx:79`, `src/components/CarteLieux.tsx:394` | 2 |

`texte-discret` n'atteignait pas le contraste demandé (2,58:1 sur blanc pour 4,5:1 attendu) ; ses
14 emplois, listés dans [CHARTE.md](CHARTE.md), § 8, sont à 4,74:1 sur blanc depuis le 2026-10-28.

## Bordures

| Rôle (nom proposé) | Classe actuelle | Hex | Fichier d'usage principal | Emplois |
| --- | --- | --- | --- | --- |
| `bordure-carte` | `border-neutral-200` | `#e5e5e5` | `src/app/dossiers/[id]/page.tsx` et `src/app/dossiers/[id]/lieux/page.tsx` (4 emplois chacun) | 25 |
| `bordure-separateur` | `border-neutral-100` | `#f5f5f5` | `src/app/dossiers/[id]/budget/page.tsx:141` et `:206` | 5 |
| `bordure-champ` | `border-bordure-champ` (jeton, depuis le 2026-10-28 ; `border-neutral-300` avant) | `#8e8e8e` | `src/components/ui.tsx:29` ; le cadre pointillé (`src/components/FormulaireAction.tsx:70`) et le filet de la frise (`src/app/dossiers/[id]/actions/page.tsx:72`) gardent `border-neutral-300` | 1 |
| `bordure-bouton-principal` | `border-accent` (jeton `accent`, depuis le 2026-10-28 ; `border-neutral-900` avant) | `#005f78` | `src/components/FormulaireAction.tsx:79`, `src/components/RechercheEndroit.tsx:59` | 2 |
| `bordure-bouton-secondaire` | `border-neutral-400` | `#a1a1a1` | `src/app/page.tsx:67` ; au survol d'un dossier : `src/app/dossiers/page.tsx:38` | 2 |

## États

| Rôle (nom proposé) | Classe actuelle | Hex | Fichier d'usage principal | Emplois |
| --- | --- | --- | --- | --- |
| `attention-fond` | `bg-amber-100` | `#fef3c6` | `src/components/ui.tsx:92` ; `src/app/page.tsx:54` | 2 |
| `attention-texte` | `text-amber-800` | `#973c00` | `src/components/ui.tsx:92` | 9 |
| `attente-texte` | `text-amber-700` | `#bb4d00` | `src/components/TacheItem.tsx:39` ; `src/app/dossiers/[id]/actions/page.tsx:78` | 2 |
| `consigne-fond`, `consigne-bordure` | `bg-amber-50`, `border-amber-300` | `#fffbeb`, `#ffd230` | `src/components/CarteLieux.tsx:317` | 1 + 1 |
| `valide-fond`, `valide-texte` | `bg-green-100`, `text-green-800` | `#dbfce7`, `#016630` | `src/components/ui.tsx:93` | 1 + 1 |
| `reussite-texte` | `text-green-700` | `#008236` | `src/components/FormulaireAction.tsx:88` | 1 |
| `erreur-texte` | `text-red-600` | `#e7000b` | `src/components/FormulaireAction.tsx:84` ; `src/components/RechercheEndroit.tsx:67` | 2 |
| `danger-fond` | `bg-red-50` | `#fef2f2` | `src/app/dossiers/[id]/page.tsx:201` ; `src/app/dossiers/[id]/journal/page.tsx:38` | 2 |
| `danger-bordure` | `border-red-200` | `#ffc9c9` | `src/app/dossiers/[id]/page.tsx:201` | 1 |
| `danger-titre`, `danger-texte` | `text-red-800`, `text-red-900` | `#9f0712`, `#82181a` | `src/app/dossiers/[id]/page.tsx:202` et `:203` | 1 + 1 |
| `ia-fond`, `ia-texte` | `bg-violet-100`, `text-violet-800` | `#ede9fe`, `#5d0ec0` | `src/components/ui.tsx:94` | 1 + 1 |
| `ia-bordure`, `ia-fond-leger` | `border-violet-200`, `bg-violet-50` | `#ddd6ff`, `#f5f3ff` | `src/app/dossiers/[id]/assistant/page.tsx:93` et `:108` | 1 + 1 |
| `neutre-fond`, `neutre-texte` (pastille) | `bg-neutral-100`, `text-neutral-700` | `#f5f5f5`, `#404040` | `src/components/ui.tsx:91` | 1 + 1 |

## Carte des lieux et frise des actions

| Rôle (nom proposé) | Classe actuelle | Hex | Fichier d'usage principal | Emplois |
| --- | --- | --- | --- | --- |
| `repere-dossier` | `bg-neutral-900` | `#171717` | `src/components/CarteLieux.tsx:232` (repère) et `:337` (légende) | 2 |
| `repere-autre-dossier` | `bg-sky-600` | `#0084d1` | `src/components/CarteLieux.tsx:233` (repère) et `:339` (légende) | 2 |
| `repere-contour` | `border-white` + `shadow-md` | `#ffffff` | `src/components/CarteLieux.tsx:228` | 1 |
| `repere-point-choisi` | `border-neutral-900` + `bg-white/70` + `shadow-md` | `#171717`, `#ffffff` à 70 % | `src/components/CarteLieux.tsx:205` | 1 |
| `fiche-mise-en-avant` | `ring-2` + `ring-neutral-900` | `#171717` | `src/components/CarteLieux.tsx:89` | 1 |
| `frise-fait` | `bg-green-500` | `#00c950` | `src/app/dossiers/[id]/actions/page.tsx:75` | 1 |
| `frise-en-retard` | `bg-red-500` | `#fb2c36` | `src/app/dossiers/[id]/actions/page.tsx:75` | 1 |
| `frise-aujourdhui` | `bg-amber-500` | `#fe9a00` | `src/app/dossiers/[id]/actions/page.tsx:75` | 1 |
| `frise-a-venir` | `bg-neutral-400` | `#a1a1a1` | `src/app/dossiers/[id]/actions/page.tsx:75` | 1 |

## Rayons

| Rôle (nom proposé) | Classe actuelle | Valeur | Fichier d'usage principal | Emplois |
| --- | --- | --- | --- | --- |
| `rayon-courant` | `rounded` | 0,25 rem | `src/components/ui.tsx:29` (champ), `src/components/TacheItem.tsx:29` (carte) | 29 |
| `rayon-large` | `rounded-lg` | 0,5 rem | `src/components/FormulaireAction.tsx:70` ; `src/app/page.tsx:47`, `src/app/dossiers/page.tsx:38`, `src/app/dossiers/[id]/page.tsx:201` | 4 |
| `rayon-rond` | `rounded-full` | `calc(infinity * 1px)` | `src/components/ui.tsx:96` (pastille) ; `src/app/dossiers/[id]/actions/page.tsx:75` ; `src/components/CarteLieux.tsx:205`, `:228`, `:337`, `:339` | 6 |

Les valeurs sont lues dans le CSS que Tailwind produit pour ces trois classes.

## Typographie

| Rôle (nom proposé) | Classe ou réglage actuel | Valeur | Fichier d'usage principal | Emplois |
| --- | --- | --- | --- | --- |
| `police-texte` | jeton `--font-sans` (aucune classe) | `Arial, Helvetica, sans-serif` | `src/app/globals.css:9` | 1 |
| `police-chasse-fixe` | balises `<code>` et `<pre>` (aucune classe) | pile par défaut de Tailwind, police du poste | `src/app/page.tsx:49`, `src/app/dossiers/[id]/assistant/page.tsx:85` | 2 |
| `taille-tres-petite` | `text-xs` | 0,75 rem | `src/app/dossiers/[id]/lieux/page.tsx` (19 emplois) | 82 |
| `taille-petite` | `text-sm` | 0,875 rem | `src/app/dossiers/[id]/page.tsx` (8 emplois) | 58 |
| `taille-titre-page` | `text-xl` | 1,25 rem | `src/app/dossiers/[id]/layout.tsx:48`, `src/app/dossiers/page.tsx:27` | 2 |
| `taille-titre-accueil` | `text-2xl` | 1,5 rem | `src/app/page.tsx:42` | 1 |
| `graisse-moyenne` | `font-medium` | 500 | `src/app/dossiers/[id]/page.tsx` et `src/app/dossiers/[id]/lieux/page.tsx` (6 emplois chacun) | 34 |
| `graisse-titre` | `font-semibold` | 600 | `src/components/ui.tsx:103` | 6 |

## Valeurs écrites en dur, hors Tailwind

| Valeur | Égale à | Fichiers |
| --- | --- | --- |
| `#171717` | `neutral-900` | `src/app/layout.tsx:12`, `src/app/manifest.ts:13`, `src/app/icon.svg:2`, `src/app/apple-icon.tsx:11`, `public/icone.svg:2` |
| `#fafafa` | `neutral-50` | `src/app/manifest.ts:12`, `src/app/icon.svg:3` à `:5`, `src/app/apple-icon.tsx:13` à `:15`, `public/icone.svg:3` à `:5` |

Ces fichiers ne passent pas par Tailwind (icône, manifeste, barre du navigateur) : une classe ne peut
pas les atteindre. Un changement de `fond-page` ou de `texte-principal` s'y reporte à la main.

## Styles réécrits à plusieurs endroits

Chacun est un candidat à un composant ou à une constante, comme `classeSaisie` l'est déjà pour les
champs.

| Style | Chaîne de classes | Emplois | Où |
| --- | --- | --- | --- |
| Bouton principal | `min-h-10 rounded border border-neutral-900 px-3 py-2 font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-50` | 2, identiques | `src/components/FormulaireAction.tsx:79`, `src/components/RechercheEndroit.tsx:59` |
| Carte | `rounded border border-neutral-200 bg-white` | 12, dans 8 fichiers | par exemple `src/components/TacheItem.tsx:29`, `src/app/dossiers/[id]/page.tsx:107` |
| Carte au rayon large | `rounded-lg border border-neutral-200 bg-white` | 2 | `src/app/page.tsx:47`, `src/app/dossiers/page.tsx:38` |
| Lien de retour | `text-sm text-neutral-500 hover:underline` | 4 | `src/app/page.tsx:43`, `src/app/dossiers/page.tsx:24`, `src/app/dossiers/[id]/layout.tsx:45`, `src/app/dossiers/[id]/documents/[docId]/page.tsx:76` |
| Titre d'un bloc repliable | `cursor-pointer` suivi de `text-neutral-500`, `text-xs text-neutral-500` ou `text-neutral-600` | 7 + 11 + 5 | par exemple `src/components/TacheItem.tsx:54` |
| Cadre de page | `bg-neutral-50 text-neutral-900 antialiased` | 2 | `src/app/layout.tsx:21` et `:22` ; recopié à dessein dans `.storybook/preview.tsx:21` |

## Annexe — inventaire complet

Chaque classe de couleur, de rayon et de typographie écrite dans `src/` et `.storybook/`, avec le
nombre d'emplois par fichier. Les fichiers d'histoires (`*.stories.tsx`) n'emploient aucune classe
de couleur. Une mention de `bg-white` dans un commentaire (`src/app/globals.css:13`) n'est pas
comptée.

Aucune classe de dégradé (`from-`, `via-`, `to-`), aucune valeur de couleur arbitraire (`bg-[…]`) et
aucune variante `dark:`, `focus:` ou `focus-visible:` n'est écrite.

### Couleurs

| Classe | Emplois | Fichiers (nombre d'emplois) |
| --- | --- | --- |
| `bg-amber-50` | 1 | `src/components/CarteLieux.tsx` (1) |
| `bg-amber-100` | 2 | `src/app/page.tsx` (1), `src/components/ui.tsx` (1) |
| `bg-amber-500` | 1 | `src/app/dossiers/[id]/actions/page.tsx` (1) |
| `bg-green-100` | 1 | `src/components/ui.tsx` (1) |
| `bg-green-500` | 1 | `src/app/dossiers/[id]/actions/page.tsx` (1) |
| `bg-neutral-50` | 5 | `src/components/CarteLieux.tsx` (2), `.storybook/preview.tsx` (1), `src/app/dossiers/[id]/lieux/page.tsx` (1), `src/app/layout.tsx` (1) |
| `bg-neutral-50/95` | 1 | `src/components/NavDossier.tsx` (1) |
| `bg-neutral-100` | 6 (dont 1 avec `hover:`) | `src/app/page.tsx` (2), `src/app/dossiers/[id]/assistant/page.tsx` (1), `src/app/dossiers/[id]/budget/page.tsx` (1), `src/components/CarteLieux.tsx` (1), `src/components/ui.tsx` (1) |
| `bg-neutral-200` | 1 (dont 1 avec `hover:`) | `src/components/NavDossier.tsx` (1) |
| `bg-neutral-400` | 1 | `src/app/dossiers/[id]/actions/page.tsx` (1) |
| `bg-neutral-900` | 5 (dont 2 avec `hover:`) | `src/components/CarteLieux.tsx` (2), `src/components/FormulaireAction.tsx` (1), `src/components/NavDossier.tsx` (1), `src/components/RechercheEndroit.tsx` (1) |
| `bg-red-50` | 2 | `src/app/dossiers/[id]/journal/page.tsx` (1), `src/app/dossiers/[id]/page.tsx` (1) |
| `bg-red-500` | 1 | `src/app/dossiers/[id]/actions/page.tsx` (1) |
| `bg-sky-600` | 2 | `src/components/CarteLieux.tsx` (2) |
| `bg-violet-50` | 1 | `src/app/dossiers/[id]/assistant/page.tsx` (1) |
| `bg-violet-100` | 1 | `src/components/ui.tsx` (1) |
| `bg-white` | 16 | `src/app/dossiers/[id]/page.tsx` (4), `src/app/dossiers/[id]/scenarios/page.tsx` (2), `src/app/dossiers/[id]/assistant/page.tsx` (1), `src/app/dossiers/[id]/documents/page.tsx` (1), `src/app/dossiers/[id]/idees/page.tsx` (1), `src/app/dossiers/[id]/lieux/page.tsx` (1), `src/app/dossiers/[id]/personnes/page.tsx` (1), `src/app/dossiers/page.tsx` (1), `src/app/page.tsx` (1), `src/components/RechercheEndroit.tsx` (1), `src/components/TacheItem.tsx` (1), `src/components/ui.tsx` (1) |
| `bg-white/70` | 1 | `src/components/CarteLieux.tsx` (1) |
| `border-amber-300` | 1 | `src/components/CarteLieux.tsx` (1) |
| `border-neutral-100` | 5 | `src/app/dossiers/[id]/budget/page.tsx` (2), `src/app/dossiers/[id]/actions/page.tsx` (1), `src/app/dossiers/[id]/scenarios/page.tsx` (1), `src/components/RechercheEndroit.tsx` (1) |
| `border-neutral-200` | 25 | `src/app/dossiers/[id]/lieux/page.tsx` (4), `src/app/dossiers/[id]/page.tsx` (4), `src/app/dossiers/[id]/scenarios/page.tsx` (3), `src/components/CarteLieux.tsx` (3), `src/app/dossiers/[id]/budget/page.tsx` (1), `src/app/dossiers/[id]/documents/[docId]/page.tsx` (1), `src/app/dossiers/[id]/documents/page.tsx` (1), `src/app/dossiers/[id]/idees/page.tsx` (1), `src/app/dossiers/[id]/journal/page.tsx` (1), `src/app/dossiers/[id]/personnes/page.tsx` (1), `src/app/dossiers/page.tsx` (1), `src/app/page.tsx` (1), `src/components/NavDossier.tsx` (1), `src/components/RechercheEndroit.tsx` (1), `src/components/TacheItem.tsx` (1) |
| `border-neutral-300` | 3 | `src/app/dossiers/[id]/actions/page.tsx` (1), `src/components/FormulaireAction.tsx` (1), `src/components/ui.tsx` (1) |
| `border-neutral-400` | 2 (dont 1 avec `hover:`) | `src/app/dossiers/page.tsx` (1), `src/app/page.tsx` (1) |
| `border-neutral-900` | 3 | `src/components/CarteLieux.tsx` (1), `src/components/FormulaireAction.tsx` (1), `src/components/RechercheEndroit.tsx` (1) |
| `border-red-200` | 1 | `src/app/dossiers/[id]/page.tsx` (1) |
| `border-violet-200` | 1 | `src/app/dossiers/[id]/assistant/page.tsx` (1) |
| `border-white` | 1 | `src/components/CarteLieux.tsx` (1) |
| `ring-neutral-900` | 1 | `src/components/CarteLieux.tsx` (1) |
| `text-amber-700` | 2 | `src/app/dossiers/[id]/actions/page.tsx` (1), `src/components/TacheItem.tsx` (1) |
| `text-amber-800` | 9 | `src/app/dossiers/[id]/page.tsx` (2), `src/app/dossiers/[id]/scenarios/page.tsx` (2), `src/components/CarteLieux.tsx` (2), `src/app/dossiers/[id]/assistant/page.tsx` (1), `src/app/page.tsx` (1), `src/components/ui.tsx` (1) |
| `text-green-700` | 1 | `src/components/FormulaireAction.tsx` (1) |
| `text-green-800` | 1 | `src/components/ui.tsx` (1) |
| `text-neutral-400` | 14 | `src/app/dossiers/[id]/budget/page.tsx` (2), `src/app/dossiers/[id]/page.tsx` (2), `src/app/dossiers/[id]/scenarios/page.tsx` (2), `src/app/page.tsx` (2), `src/components/TacheItem.tsx` (2), `src/app/dossiers/[id]/actions/page.tsx` (1), `src/app/dossiers/[id]/documents/[docId]/page.tsx` (1), `src/app/dossiers/[id]/lieux/page.tsx` (1), `src/app/dossiers/[id]/personnes/page.tsx` (1) |
| `text-neutral-500` | 78 | `src/app/dossiers/[id]/lieux/page.tsx` (17), `src/app/dossiers/[id]/budget/page.tsx` (11), `src/app/dossiers/[id]/page.tsx` (8), `src/app/dossiers/[id]/assistant/page.tsx` (6), `src/app/dossiers/[id]/scenarios/page.tsx` (5), `src/app/dossiers/page.tsx` (5), `src/app/dossiers/[id]/personnes/page.tsx` (4), `src/components/CarteLieux.tsx` (4), `src/app/dossiers/[id]/actions/page.tsx` (3), `src/app/dossiers/[id]/documents/[docId]/page.tsx` (3), `src/app/dossiers/[id]/idees/page.tsx` (2), `src/app/dossiers/[id]/layout.tsx` (2), `src/app/page.tsx` (2), `src/components/ui.tsx` (2), `src/app/dossiers/[id]/documents/page.tsx` (1), `src/app/dossiers/[id]/journal/page.tsx` (1), `src/components/RechercheEndroit.tsx` (1), `src/components/TacheItem.tsx` (1) |
| `text-neutral-600` | 34 | `src/app/dossiers/[id]/lieux/page.tsx` (8), `src/components/CarteLieux.tsx` (5), `src/app/dossiers/[id]/budget/page.tsx` (4), `src/app/dossiers/[id]/documents/[docId]/page.tsx` (4), `src/components/RechercheEndroit.tsx` (3), `src/app/dossiers/[id]/assistant/page.tsx` (2), `src/app/dossiers/[id]/actions/page.tsx` (1), `src/app/dossiers/[id]/idees/page.tsx` (1), `src/app/dossiers/[id]/personnes/page.tsx` (1), `src/app/dossiers/[id]/scenarios/page.tsx` (1), `src/app/dossiers/page.tsx` (1), `src/app/page.tsx` (1), `src/components/NavDossier.tsx` (1), `src/components/ui.tsx` (1) |
| `text-neutral-700` | 3 | `src/components/CarteLieux.tsx` (1), `src/components/RechercheEndroit.tsx` (1), `src/components/ui.tsx` (1) |
| `text-neutral-800` | 3 | `src/app/dossiers/[id]/assistant/page.tsx` (1), `src/components/CarteLieux.tsx` (1), `src/components/ui.tsx` (1) |
| `text-neutral-900` | 9 (dont 1 avec `hover:`) | `src/app/dossiers/[id]/budget/page.tsx` (4), `.storybook/preview.tsx` (1), `src/app/dossiers/[id]/lieux/page.tsx` (1), `src/app/layout.tsx` (1), `src/components/CarteLieux.tsx` (1), `src/components/NavDossier.tsx` (1) |
| `text-red-600` | 2 | `src/components/FormulaireAction.tsx` (1), `src/components/RechercheEndroit.tsx` (1) |
| `text-red-800` | 1 | `src/app/dossiers/[id]/page.tsx` (1) |
| `text-red-900` | 1 | `src/app/dossiers/[id]/page.tsx` (1) |
| `text-violet-800` | 1 | `src/components/ui.tsx` (1) |
| `text-white` | 3 (dont 2 avec `hover:`) | `src/components/FormulaireAction.tsx` (1), `src/components/NavDossier.tsx` (1), `src/components/RechercheEndroit.tsx` (1) |

### Rayons

| Classe | Emplois | Fichiers (nombre d'emplois) |
| --- | --- | --- |
| `rounded` | 29 | `src/app/dossiers/[id]/page.tsx` (4), `src/components/CarteLieux.tsx` (4), `src/app/dossiers/[id]/assistant/page.tsx` (3), `src/app/page.tsx` (3), `src/app/dossiers/[id]/lieux/page.tsx` (2), `src/app/dossiers/[id]/scenarios/page.tsx` (2), `src/components/RechercheEndroit.tsx` (2), `src/app/dossiers/[id]/budget/page.tsx` (1), `src/app/dossiers/[id]/documents/[docId]/page.tsx` (1), `src/app/dossiers/[id]/documents/page.tsx` (1), `src/app/dossiers/[id]/idees/page.tsx` (1), `src/app/dossiers/[id]/personnes/page.tsx` (1), `src/components/FormulaireAction.tsx` (1), `src/components/NavDossier.tsx` (1), `src/components/TacheItem.tsx` (1), `src/components/ui.tsx` (1) |
| `rounded-full` | 6 | `src/components/CarteLieux.tsx` (4), `src/app/dossiers/[id]/actions/page.tsx` (1), `src/components/ui.tsx` (1) |
| `rounded-lg` | 4 | `src/app/dossiers/[id]/page.tsx` (1), `src/app/dossiers/page.tsx` (1), `src/app/page.tsx` (1), `src/components/FormulaireAction.tsx` (1) |

### Graisses

| Classe | Emplois | Fichiers (nombre d'emplois) |
| --- | --- | --- |
| `font-medium` | 34 | `src/app/dossiers/[id]/lieux/page.tsx` (6), `src/app/dossiers/[id]/page.tsx` (6), `src/app/dossiers/[id]/assistant/page.tsx` (4), `src/app/dossiers/[id]/budget/page.tsx` (3), `src/app/dossiers/[id]/scenarios/page.tsx` (3), `src/components/CarteLieux.tsx` (2), `src/components/FormulaireAction.tsx` (2), `src/app/dossiers/[id]/actions/page.tsx` (1), `src/app/dossiers/[id]/documents/[docId]/page.tsx` (1), `src/app/dossiers/[id]/documents/page.tsx` (1), `src/app/dossiers/[id]/idees/page.tsx` (1), `src/app/dossiers/[id]/personnes/page.tsx` (1), `src/app/dossiers/page.tsx` (1), `src/components/RechercheEndroit.tsx` (1), `src/components/ui.tsx` (1) |
| `font-semibold` | 6 | `src/app/page.tsx` (2), `src/app/dossiers/[id]/layout.tsx` (1), `src/app/dossiers/[id]/scenarios/page.tsx` (1), `src/app/dossiers/page.tsx` (1), `src/components/ui.tsx` (1) |

### Tailles de texte

| Classe | Emplois | Fichiers (nombre d'emplois) |
| --- | --- | --- |
| `text-2xl` | 1 | `src/app/page.tsx` (1) |
| `text-sm` | 58 | `src/app/dossiers/[id]/page.tsx` (8), `src/app/dossiers/[id]/actions/page.tsx` (6), `src/app/dossiers/[id]/documents/[docId]/page.tsx` (6), `src/app/dossiers/[id]/assistant/page.tsx` (5), `src/app/dossiers/[id]/budget/page.tsx` (4), `src/app/dossiers/[id]/scenarios/page.tsx` (4), `src/app/dossiers/page.tsx` (4), `src/app/page.tsx` (3), `src/components/RechercheEndroit.tsx` (3), `src/app/dossiers/[id]/lieux/page.tsx` (2), `src/components/FormulaireAction.tsx` (2), `src/components/TacheItem.tsx` (2), `src/components/ui.tsx` (2), `src/app/dossiers/[id]/documents/page.tsx` (1), `src/app/dossiers/[id]/idees/page.tsx` (1), `src/app/dossiers/[id]/layout.tsx` (1), `src/app/dossiers/[id]/personnes/page.tsx` (1), `src/components/CarteLieux.tsx` (1), `src/components/NavDossier.tsx` (1), `src/components/ui.section.stories.tsx` (1) |
| `text-xl` | 2 | `src/app/dossiers/[id]/layout.tsx` (1), `src/app/dossiers/page.tsx` (1) |
| `text-xs` | 82 | `src/app/dossiers/[id]/lieux/page.tsx` (19), `src/components/CarteLieux.tsx` (11), `src/app/dossiers/[id]/budget/page.tsx` (8), `src/app/dossiers/[id]/assistant/page.tsx` (6), `src/app/dossiers/[id]/scenarios/page.tsx` (6), `src/app/dossiers/[id]/personnes/page.tsx` (5), `src/app/dossiers/[id]/page.tsx` (4), `src/app/dossiers/[id]/documents/[docId]/page.tsx` (3), `src/app/page.tsx` (3), `src/components/RechercheEndroit.tsx` (3), `src/components/TacheItem.tsx` (3), `src/app/dossiers/[id]/actions/page.tsx` (2), `src/app/dossiers/[id]/documents/page.tsx` (2), `src/app/dossiers/[id]/idees/page.tsx` (2), `src/components/ui.tsx` (2), `src/app/dossiers/[id]/journal/page.tsx` (1), `src/app/dossiers/[id]/layout.tsx` (1), `src/app/dossiers/page.tsx` (1) |

### Autres réglages de texte

| Classe | Emplois | Fichiers (nombre d'emplois) |
| --- | --- | --- |
| `line-through` | 2 | `src/app/dossiers/[id]/budget/page.tsx` (2) |
| `tracking-wide` | 1 | `src/app/dossiers/[id]/lieux/page.tsx` (1) |
| `underline` | 16 (dont 4 avec `hover:`) | `src/components/CarteLieux.tsx` (4), `src/app/dossiers/[id]/budget/page.tsx` (2), `src/app/dossiers/[id]/documents/[docId]/page.tsx` (2), `src/app/dossiers/[id]/documents/page.tsx` (2), `src/app/dossiers/[id]/page.tsx` (2), `src/app/dossiers/[id]/layout.tsx` (1), `src/app/dossiers/[id]/lieux/page.tsx` (1), `src/app/dossiers/page.tsx` (1), `src/app/page.tsx` (1) |
| `uppercase` | 1 | `src/app/dossiers/[id]/lieux/page.tsx` (1) |
| `whitespace-nowrap` | 2 | `src/app/dossiers/[id]/journal/page.tsx` (1), `src/components/NavDossier.tsx` (1) |
| `whitespace-pre-wrap` | 1 | `src/app/dossiers/[id]/assistant/page.tsx` (1) |

### Ombres et opacités

| Classe | Emplois | Fichiers (nombre d'emplois) |
| --- | --- | --- |
| `opacity-50` | 2 (dont 2 avec `disabled:`) | `src/components/FormulaireAction.tsx` (1), `src/components/RechercheEndroit.tsx` (1) |
| `opacity-60` | 1 | `src/app/dossiers/[id]/personnes/page.tsx` (1) |
| `shadow-md` | 2 | `src/components/CarteLieux.tsx` (2) |

