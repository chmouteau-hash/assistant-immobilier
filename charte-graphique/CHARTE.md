# Charte graphique — nommer l'existant

Ce document décrit l'apparence de l'application **telle qu'elle est dans le code**, et donne un nom
à chaque emploi. Il ne change rien : aucune page, aucun composant, aucune feuille de style n'a été
modifié pour l'écrire.

- **Relevé du 2026-10-12**, sur le commit `22d2300` de `main`. Les numéros de ligne valent pour ce
  commit : ils bougeront avec le code.
- **Périmètre** : `src/` et `.storybook/`. Les feuilles de style de Leaflet (la carte) et le fichier
  `index.html` de la racine n'en font pas partie.
- **Statut** : un relevé, et des choix faits le 2026-10-12 puis le 2026-10-28, pas encore
  appliqués au code (§ 9). Une règle n'est décidée que lorsqu'elle est écrite dans `DECISIONS.md`.
  Leur application se suit dans l'issue #71.
- La correspondance complète entre rôles et classes, et l'inventaire chiffré, sont dans
  [jetons.md](jetons.md).

## Quatre mots à connaître

- **Rôle sémantique** : ce à quoi sert une couleur, pas sa teinte. « Texte d'aide » est un rôle ;
  « gris moyen » est une teinte. Nommer par le rôle permet de changer la teinte à un seul endroit.
- **Jeton de design** (_design token_ en anglais) : un nom donné une fois à une valeur de la charte
  (une couleur, un rayon, une police), que tout le reste du code réutilise au lieu de réécrire la
  valeur.
- **Bloc `@theme`** : l'endroit, dans `src/app/globals.css`, où Tailwind CSS 4 lit les jetons du
  projet. Aujourd'hui il n'en contient qu'un : la police (`--font-sans`, ligne 9).
- **Contraste** : l'écart de luminosité entre un texte et son fond, exprimé par un ratio de 1:1
  (illisible) à 21:1 (noir sur blanc). La norme d'accessibilité WCAG 2.2, niveau AA, demande 4,5:1
  pour un texte courant et 3:1 pour un grand texte ou un élément d'interface.

## 1. Intentions

Trois intentions ont été données pour cette charte : **sérieux**, **sobriété**, **public de
professionnels**. Ce que le code fait déjà dans ce sens (lu) :

- **Sobriété.** Sur 254 emplois d'une classe de couleur, 220 sont un gris ou le blanc (87 %). Les
  34 autres portent un état : attention, validé, erreur, assistant, autre dossier. Aucun dégradé,
  aucune image décorative ; une seule ombre, sur les repères de la carte
  (`src/components/CarteLieux.tsx`, lignes 205 et 228).
- **Sérieux.** Une valeur sensible ne s'affiche jamais seule : elle porte une pastille qui dit d'où
  elle vient et quelle confiance lui accorder (`Provenance`, `src/components/ui.tsx`, lignes 121
  à 133). Une valeur absente s'affiche « À renseigner », jamais 0 ni un vide.
- **Densité de lecture.** Le texte est petit : `text-xs` (82 emplois) et `text-sm` (58 emplois)
  dominent ; les titres ne dépassent pas `text-2xl`.

**Public : tranché le 2026-10-28.** C'est celui de la note de cadrage : un particulier d'abord,
des professionnels invités ensuite sur un périmètre choisi (`docs/01-cadrage.md`, lignes 8 à 12).
« Sérieux » et « sobriété » restent les intentions de la charte ; « public de professionnels », donné
au départ, ne l'est plus.

## 2. Palette par rôle

Toutes les couleurs viennent de la palette par défaut de Tailwind CSS (version installée : 4.3.3),
employées par leurs classes, directement dans les pages et les composants. Il n'existe **aucun
jeton de couleur** dans le projet.

Tailwind 4 écrit ses couleurs en `oklch`, une notation qui décrit une couleur par sa clarté, sa
saturation et sa teinte. La colonne « Valeur lue » recopie `node_modules/tailwindcss/theme.css` ;
la colonne « Hex » est **calculée**, puis vérifiée dans un navigateur (méthode au § 8).

### Gris : la structure

| Rôle | Classe | Valeur lue | Hex | Emploi de référence |
| --- | --- | --- | --- | --- |
| Fond de page | `bg-neutral-50` | `oklch(98.5% 0 none)` | `#fafafa` | `src/app/layout.tsx:22` |
| Fond de carte et de champ | `bg-white` | `#fff` | `#ffffff` | `src/components/TacheItem.tsx:29`, `src/components/ui.tsx:29` |
| Fond en retrait (synthèse, aperçu, code) | `bg-neutral-100` | `oklch(97% 0 none)` | `#f5f5f5` | `src/app/dossiers/[id]/budget/page.tsx:76` |
| Fond d'une carte dans une carte | `bg-neutral-50` | `oklch(98.5% 0 none)` | `#fafafa` | `src/app/dossiers/[id]/lieux/page.tsx:180` |
| Fond inversé (onglet courant, bouton survolé) | `bg-neutral-900` | `oklch(20.5% 0 none)` | `#171717` | `src/components/NavDossier.tsx:52` |
| Texte principal | `text-neutral-900` | `oklch(20.5% 0 none)` | `#171717` | `src/app/layout.tsx:22` |
| Titre de section | `text-neutral-800` | `oklch(26.9% 0 none)` | `#262626` | `src/components/ui.tsx:103` |
| Texte de pastille neutre | `text-neutral-700` | `oklch(37.1% 0 none)` | `#404040` | `src/components/ui.tsx:91` |
| Texte secondaire (libellé de champ) | `text-neutral-600` | `oklch(43.9% 0 none)` | `#525252` | `src/components/ui.tsx:21` |
| Texte d'aide (sous-titre, état vide, métadonnée) | `text-neutral-500` | `oklch(55.6% 0 none)` | `#737373` | `src/components/ui.tsx:104` et `:117` |
| Texte discret (date, « Rien. », valeur absente) | `text-neutral-400` | `oklch(70.8% 0 none)` | `#a1a1a1` | `src/components/TacheItem.tsx:36` |
| Texte sur fond inversé | `text-white` | `#fff` | `#ffffff` | `src/components/NavDossier.tsx:52` |
| Bordure de carte | `border-neutral-200` | `oklch(92.2% 0 none)` | `#e5e5e5` | `src/components/TacheItem.tsx:29` |
| Séparateur léger | `border-neutral-100` | `oklch(97% 0 none)` | `#f5f5f5` | `src/app/dossiers/[id]/budget/page.tsx:141` |
| Bordure de champ | `border-neutral-300` | `oklch(87% 0 none)` | `#d4d4d4` | `src/components/ui.tsx:29` |
| Bordure du bouton principal | `border-neutral-900` | `oklch(20.5% 0 none)` | `#171717` | `src/components/FormulaireAction.tsx:79` |

Deux remarques lues dans ce tableau :

- `bg-neutral-50` tient deux rôles (la page, et une carte posée dans une carte blanche). C'est
  exactement ce qu'un jeton distingue.
- `text-neutral-400` n'atteint pas le contraste demandé (§ 8).

### Couleurs d'état

| Rôle | Classes | Hex (fond / texte) | Emploi de référence |
| --- | --- | --- | --- |
| Attention, à renseigner, à confirmer | `bg-amber-100` + `text-amber-800` | `#fef3c6` / `#973c00` | Pastille « attention », `src/components/ui.tsx:92` |
| Réserve écrite en clair | `text-amber-800` | `#973c00` | `src/app/dossiers/[id]/scenarios/page.tsx:64` |
| Attente d'un prérequis | `text-amber-700` | `#bb4d00` | `src/components/TacheItem.tsx:39` |
| Consigne en cours (choisir un point sur la carte) | `bg-amber-50` + `border-amber-300` | `#fffbeb` / bordure `#ffd230` | `src/components/CarteLieux.tsx:317` |
| Connu, validé | `bg-green-100` + `text-green-800` | `#dbfce7` / `#016630` | Pastille « ok », `src/components/ui.tsx:93` |
| Enregistrement réussi | `text-green-700` | `#008236` | `src/components/FormulaireAction.tsx:88` |
| Erreur de formulaire | `text-red-600` | `#e7000b` | `src/components/FormulaireAction.tsx:84` |
| Zone de suppression définitive | `bg-red-50` + `border-red-200` + `text-red-800` et `text-red-900` | `#fef2f2` / `#ffc9c9` / `#9f0712` et `#82181a` | `src/app/dossiers/[id]/page.tsx:201` à `:203` |
| Accès refusé, dans le journal | `bg-red-50` | `#fef2f2` | `src/app/dossiers/[id]/journal/page.tsx:38` |
| Ce qui vient de l'assistant | `bg-violet-100` + `text-violet-800` | `#ede9fe` / `#5d0ec0` | Pastille « ia », `src/components/ui.tsx:94` |
| Réponse de l'assistant | `border-violet-200`, `bg-violet-50` | `#ddd6ff`, `#f5f3ff` | `src/app/dossiers/[id]/assistant/page.tsx:93` et `:108` |
| Bien d'un autre dossier, sur la carte | `bg-sky-600` | `#0084d1` | `src/components/CarteLieux.tsx:233` et `:339` |
| Lieu de ce dossier, sur la carte | `bg-neutral-900` + `border-white` | `#171717` / `#ffffff` | `src/components/CarteLieux.tsx:232` et `:228` |
| Points de la frise des actions | `bg-green-500`, `bg-red-500`, `bg-amber-500`, `bg-neutral-400` | `#00c950`, `#fb2c36`, `#fe9a00`, `#a1a1a1` | `src/app/dossiers/[id]/actions/page.tsx:75` |

### Deux valeurs écrites en dur

Hors de Tailwind, deux couleurs sont écrites en hexadécimal, pour l'icône et la barre du
navigateur : `#171717` et `#fafafa` (`src/app/layout.tsx:12`, `src/app/manifest.ts:12` et `:13`,
`src/app/icon.svg`, `src/app/apple-icon.tsx`, `public/icone.svg`). Elles sont égales aux valeurs
calculées de `neutral-900` et `neutral-50`.

### Ce qui n'existe pas

- **Pas de couleur d'accent** : aucune teinte ne signale « l'action à faire ». Le bouton principal
  est un contour gris foncé qui se remplit au survol. Décidé le 2026-10-12 : l'application en aura
  une ; choisie le 2026-10-28 : le bleu pétrole, `cyan-800` (§ 9). Rien n'est encore appliqué.
- **Pas de thème sombre** : `color-scheme: light` (`src/app/globals.css`, lignes 13 à 20).

## 3. Typographie

| Élément | Valeur | Source |
| --- | --- | --- |
| Police du texte | `Arial, Helvetica, sans-serif` | `--font-sans`, `src/app/globals.css:9` |
| Police à chasse fixe | celle du poste : `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace` | pile par défaut de Tailwind (`theme.css`, lignes 6 à 8), appliquée aux balises `<code>` (`src/app/page.tsx:49`) et `<pre>` (`src/app/dossiers/[id]/assistant/page.tsx:85`) |
| Lissage | `antialiased` | `src/app/layout.tsx:21` |

Aucune police n'est téléchargée, et Arial reste la police de l'application (`DECISIONS.md`, deux
entrées du 2026-10-12). Aucune classe `font-sans`, `font-serif` ou `font-mono` n'est employée : la
police se règle au seul endroit du thème.

| Taille | Classe | Valeur | Emplois | Usage constaté |
| --- | --- | --- | --- | --- |
| Très petite | `text-xs` | 0,75 rem | 82 | aides, métadonnées, pastilles, formulaires repliés |
| Petite | `text-sm` | 0,875 rem | 58 | contenu des cartes, listes, formulaires |
| Par défaut | aucune classe | taille du navigateur | — | titres de section, texte hors carte |
| Titre de page | `text-xl` | 1,25 rem | 2 | `src/app/dossiers/page.tsx:27`, `src/app/dossiers/[id]/layout.tsx:48` |
| Titre de l'accueil | `text-2xl` | 1,5 rem | 1 | `src/app/page.tsx:42` |

| Graisse | Classe | Valeur | Emplois | Usage constaté |
| --- | --- | --- | --- | --- |
| Moyenne | `font-medium` | 500 | 34 | nom d'un objet dans une liste, libellé d'un bouton, pastille |
| Demi-grasse | `font-semibold` | 600 | 6 | titres (`h1`, `h2`, `h3`) |

Un seul style est en capitales espacées (`uppercase tracking-wide`) : l'étiquette de niveau de
l'écran Lieux, « Bâtiment » par exemple (`classeNiveau`, `src/app/dossiers/[id]/lieux/page.tsx:37`).

## 4. Rayons, bordures, ombres

| Rôle | Classe | Valeur | Emplois | Où |
| --- | --- | --- | --- | --- |
| Rayon courant | `rounded` | 0,25 rem | 29 | cartes, champs, boutons, onglets |
| Rayon large | `rounded-lg` | 0,5 rem | 4 | `src/app/page.tsx:47`, `src/app/dossiers/page.tsx:38`, `src/app/dossiers/[id]/page.tsx:201`, `src/components/FormulaireAction.tsx:70` |
| Rond | `rounded-full` | cercle ou gélule | 6 | pastille (`src/components/ui.tsx:96`), points de la frise, repères et légende de la carte |

- Bordures : un trait plein de 1 px (`border`). Exceptions lues : le cadre en pointillé d'un
  formulaire (`border-dashed`, `src/components/FormulaireAction.tsx:70`), le filet de la frise
  (`border-l-2`, `src/app/dossiers/[id]/actions/page.tsx:72`) et le contour des repères de la
  carte (`border-4` et `border-2`, `src/components/CarteLieux.tsx:205` et `:228`).
- Ombre : `shadow-md`, sur les repères de la carte seulement.
- Opacité : `disabled:opacity-50` pour un bouton en cours d'envoi ; `opacity-60` pour la carte
  d'une personne révoquée (`src/app/dossiers/[id]/personnes/page.tsx:40`).

## 5. Les composants qui portent la charte

Storybook (`npm run storybook`) montre chacun d'eux seul, dans ses états.

| Composant | Fichier | Ce qu'il fixe | Histoire dans Storybook |
| --- | --- | --- | --- |
| `Pastille` | `src/components/ui.tsx:89` | les quatre tons : neutre, attention, ok, ia | Éléments de base / Pastille |
| `Provenance`, `EtiquetteSourceConfiance` | `src/components/ui.tsx:121` et `:135` | quel ton pour quelle provenance | Éléments de base / Provenance |
| `classeSaisie`, `Champ`, `Select` | `src/components/ui.tsx:18` à `:47` | l'apparence d'un champ et de son libellé | Éléments de base / Champs de saisie |
| `Section`, `Vide` | `src/components/ui.tsx:99` et `:116` | titre de section, sous-titre, état vide | Éléments de base / Section |
| `FormulaireAction` | `src/components/FormulaireAction.tsx` | le bouton principal, les messages d'erreur et de réussite | Formulaires / FormulaireAction |
| `NavDossier` | `src/components/NavDossier.tsx` | la barre d'onglets et l'onglet courant | Dossier / NavDossier |
| `TacheItem` | `src/components/TacheItem.tsx` | la carte d'une action | Dossier / TacheItem |
| `CarteLieux`, `RechercheEndroit` | `src/components/` | les repères, la légende, la liste des endroits | Lieux / CarteLieux, Lieux / RechercheEndroit |

Trois apparences de bouton existent :

1. **Bouton principal** : `min-h-10 rounded border border-neutral-900 px-3 py-2 font-medium
   hover:bg-neutral-900 hover:text-white disabled:opacity-50`. Écrit deux fois, à l'identique :
   `src/components/FormulaireAction.tsx:79` et `src/components/RechercheEndroit.tsx:59`.
2. **Petit bouton** : `rounded border border-neutral-400 px-2 py-1 text-xs hover:bg-neutral-100`
   (`src/app/page.tsx:67`, un seul emploi).
3. **Bouton-lien** « Annuler » : `min-h-10 text-xs text-neutral-500 underline`
   (`src/components/CarteLieux.tsx:372` et `:419`).

La carte, elle, n'est pas un composant : le motif `rounded border border-neutral-200 bg-white` est
réécrit 12 fois dans 8 fichiers.

## 6. Règles d'usage constatées

Ces règles se lisent dans le code d'aujourd'hui. Elles ne sont écrites nulle part ailleurs.

1. **Le gris porte la structure, la couleur porte un état.** Une couleur ne décore jamais.
2. **Une pastille par provenance.** Verte quand la confiance vaut `connu` ; sinon violette quand
   la source vaut `suggestion_ia` ; ambre dans tous les autres cas, y compris « À renseigner »
   (`src/components/ui.tsx:123` et `:124`).
3. **Le violet est réservé à l'assistant.** Il n'apparaît que dans la pastille « ia » et dans
   l'écran de l'assistant.
4. **Le bleu est réservé aux biens des autres dossiers**, sur la carte et dans sa légende.
5. **Le rouge dit une erreur, un refus, un retard ou un geste sans retour** : message d'erreur
   d'un formulaire, accès refusé dans le journal, action échue et non faite sur la frise,
   suppression définitive d'un dossier.
6. **Une carte est blanche sur la page grise**, bordée d'un trait clair, au rayon courant.
7. **Un champ porte son libellé au-dessus**, en texte secondaire (`Champ`). Pas partout : des
   champs compacts n'ont qu'un texte d'exemple, écrit dans le champ lui-même : le motif et
   l'hypothèse de `src/app/dossiers/[id]/scenarios/page.tsx:112` et `:123`.
8. **Les mots des pastilles de source et de confiance viennent de `src/domain/provenance.ts`** :
   un seul nom par origine (règle écrite dans `CLAUDE.md`).

## 7. Interdits

Déjà décidés, avec leur source :

- **Télécharger une police.** `next/font/google` n'est importé nulle part. Si l'application prend
  un jour une police à elle, ses fichiers se rangent dans le dépôt (`DECISIONS.md`, 2026-10-12).
- **Écrire une règle `body` dans `globals.css`.** Hors couche, elle écraserait les classes du
  gabarit (`src/app/globals.css`, lignes 15 et 16).
- **Afficher une valeur inconnue comme 0, ou la laisser vide.** Elle s'affiche « À renseigner »
  (règle du produit « L'inconnu n'est jamais 0 », `CLAUDE.md`).
- **Faire venir une ressource d'un service externe** (police, icônes, script) sans entrée dans
  `DECISIONS.md` ni passage par la checklist de `docs/05-securite-rgpd.md` (`CLAUDE.md`).
- **Mettre une donnée réelle dans une histoire Storybook** : données fictives seulement
  (`CLAUDE.md`).

Proposés à partir du relevé, retenus le 2026-10-28 (`DECISIONS.md`) :

- **Employer `text-neutral-400` pour un texte qu'il faut pouvoir lire.** Ses 14 emplois actuels
  passent au texte discret (§ 9).
- **Introduire une teinte absente du § 2 sans lui donner un rôle dans ce document.**
- **Employer le violet ou le bleu clair pour autre chose que leur rôle** : le violet est à
  l'assistant, le bleu clair (`sky`) aux biens des autres dossiers. Le bleu pétrole de l'accent est
  un rôle à part.
- **Dire un état par la couleur seule, sans mot ni pastille.**

## 8. Contrastes

### Méthode

Critères 1.4.3 (texte) et 1.4.11 (éléments d'interface) de WCAG 2.2, niveau AA.

- **Luminance relative** d'une couleur : `L = 0,2126 R + 0,7152 G + 0,0722 B`, où chaque canal `c`,
  ramené entre 0 et 1, vaut `c / 12,92` si `c ≤ 0,04045`, sinon `((c + 0,055) / 1,055) ^ 2,4`.
- **Ratio** : `(L clair + 0,05) / (L sombre + 0,05)`.
- **Seuils** : 4,5:1 pour un texte courant ; 3:1 pour un grand texte (24 px, ou 18,66 px en gras)
  et pour un élément d'interface. Tous les textes relevés ici sont des textes courants.
- **Valeurs hexadécimales.** Tailwind ne donne pas d'hexadécimal : chaque valeur `oklch` lue dans
  `theme.css` a été convertie par calcul (OKLab, puis sRGB), arrondie sur 8 bits. Contrôle : les 31
  valeurs ont été peintes par Chrome 154 sur une page vide, puis relues. 30 sont identiques ; une
  diffère d'une unité (`green-100` : `#dcfce7` calculé, `#dbfce7` peint), et c'est la valeur peinte
  qui est retenue.
- Les ratios sont tronqués à deux décimales, jamais arrondis vers le haut.
- **Limite.** Onze des teintes colorées (des ambres, des rouges, des verts, le bleu, un violet)
  sortent, parfois de très peu, de l'espace sRGB : l'hexadécimal est leur version ramenée à cet
  espace, celle qu'affiche un écran ordinaire. Sur un écran à gamme étendue, la teinte affichée
  peut différer : non mesuré.

### Couleurs de texte sur blanc et sur le fond de page

| Couleur de texte | Hex | Sur blanc `#ffffff` | Conforme | Sur `neutral-50` `#fafafa` | Conforme |
| --- | --- | --- | --- | --- | --- |
| `neutral-900` | `#171717` | 17,92 | oui | 17,17 | oui |
| `neutral-800` | `#262626` | 15,13 | oui | 14,49 | oui |
| `neutral-700` | `#404040` | 10,36 | oui | 9,93 | oui |
| `neutral-600` | `#525252` | 7,81 | oui | 7,48 | oui |
| `neutral-500` | `#737373` | 4,74 | oui | 4,54 | oui, de peu |
| `neutral-400` | `#a1a1a1` | 2,58 | **non** | 2,47 | **non** |
| `amber-800` | `#973c00` | 7,08 | oui | 6,79 | oui |
| `amber-700` | `#bb4d00` | 5,03 | oui | 4,81 | oui |
| `red-900` | `#82181a` | 10,02 | oui | 9,60 | oui |
| `red-800` | `#9f0712` | 8,35 | oui | 8,00 | oui |
| `red-600` | `#e7000b` | 4,76 | oui | 4,56 | oui, de peu |
| `green-800` | `#016630` | 7,13 | oui | 6,83 | oui |
| `green-700` | `#008236` | 4,94 | oui | 4,73 | oui |
| `violet-800` | `#5d0ec0` | 9,17 | oui | 8,78 | oui |

### Couleurs de texte sur les autres fonds employés

| Texte sur fond | Hex | Ratio | Conforme | Où |
| --- | --- | --- | --- | --- |
| `white` sur `neutral-900` | `#ffffff` / `#171717` | 17,92 | oui | onglet courant, bouton survolé |
| `neutral-900` sur `neutral-100` | `#171717` / `#f5f5f5` | 16,44 | oui | synthèse du budget, aperçu envoyé à l'assistant |
| `neutral-900` sur `neutral-200` | `#171717` / `#e5e5e5` | 14,23 | oui | onglet survolé |
| `neutral-700` sur `neutral-100` | `#404040` / `#f5f5f5` | 9,51 | oui | pastille neutre |
| `amber-800` sur `amber-100` | `#973c00` / `#fef3c6` | 6,36 | oui | pastille « attention » |
| `green-800` sur `green-100` | `#016630` / `#dbfce7` | 6,48 | oui | pastille « ok » |
| `violet-800` sur `violet-100` | `#5d0ec0` / `#ede9fe` | 7,72 | oui | pastille « ia » |
| `neutral-800` sur `amber-50` | `#262626` / `#fffbeb` | 14,59 | oui | consigne de la carte |
| `neutral-900` sur `violet-50` | `#171717` / `#f5f3ff` | 16,34 | oui | réponse de l'assistant |
| `red-800` sur `red-50` | `#9f0712` / `#fef2f2` | 7,63 | oui | zone de suppression |
| `red-900` sur `red-50` | `#82181a` / `#fef2f2` | 9,16 | oui | zone de suppression |
| `neutral-500` sur `neutral-100` | `#737373` / `#f5f5f5` | 4,34 | **non** | voir écarts |
| `neutral-500` sur `violet-50` | `#737373` / `#f5f3ff` | 4,32 | **non** | voir écarts |
| `red-600` sur `red-50` | `#e7000b` / `#fef2f2` | 4,36 | **non** | voir écarts |
| `neutral-400` sur `neutral-100` | `#a1a1a1` / `#f5f5f5` | 2,36 | **non** | voir écarts |

### Écarts connus, non corrigés

Deux de ces écarts ont une décision depuis le 2026-10-12, et leur valeur depuis le 2026-10-28
(§ 9) : le texte discret (A) et la bordure des champs (première ligne de C). Aucun n'est encore
corrigé dans le code.

**A. `text-neutral-400` sur du texte : 14 emplois, tous sous 4,5:1.**

| Fichier et ligne | Texte | Fond | Ratio |
| --- | --- | --- | --- |
| `src/app/page.tsx:18` | sous-titre d'une colonne de l'accueil | page (`neutral-50`) | 2,47 |
| `src/app/page.tsx:21` | « Rien ici. » | page (`neutral-50`) | 2,47 |
| `src/components/TacheItem.tsx:34` | nom du dossier, après une action | carte (`white`) | 2,58 |
| `src/components/TacheItem.tsx:36` | échéance et responsable d'une action | carte (`white`) | 2,58 |
| `src/app/dossiers/[id]/budget/page.tsx:26` | tiret d'un montant absent | page (`neutral-50`) dans le tableau ; `neutral-100` dans la synthèse (ligne 76) | 2,47 et 2,36 |
| `src/app/dossiers/[id]/budget/page.tsx:206` | ligne écartée : poste, type et montant | page (`neutral-50`) | 2,47 |
| `src/app/dossiers/[id]/actions/page.tsx:45` | « Rien. » | page (`neutral-50`) | 2,47 |
| `src/app/dossiers/[id]/page.tsx:176` | « Rien. » | carte (`white`) | 2,58 |
| `src/app/dossiers/[id]/page.tsx:230` | date d'une décision | carte (`white`) | 2,58 |
| `src/app/dossiers/[id]/scenarios/page.tsx:99` | « Aucune hypothèse notée. » | carte (`white`) | 2,58 |
| `src/app/dossiers/[id]/scenarios/page.tsx:184` | date d'une décision | carte (`white`) | 2,58 |
| `src/app/dossiers/[id]/personnes/page.tsx:45` | « (vous) » | carte (`white`) | 2,58 |
| `src/app/dossiers/[id]/lieux/page.tsx:228` | « Aucune pièce. » | carte de bâtiment (`neutral-50`, ligne 180) | 2,47 |
| `src/app/dossiers/[id]/documents/[docId]/page.tsx:124` | « (proposé : …) », valeur avant correction | page (`neutral-50`) | 2,47 |

**B. Autres textes sous 4,5:1.**

| Fichier et ligne | Ce qui s'affiche | Ratio | Nature du constat |
| --- | --- | --- | --- |
| `src/app/page.tsx:49` | le mot en `<code>` : `text-neutral-500` (ligne 48) sur `bg-neutral-100` | 4,34 | lu |
| `src/app/dossiers/[id]/assistant/page.tsx:114` | sources d'un constat : `text-neutral-500` sur `bg-violet-50` (ligne 108) | 4,32 | lu |
| `src/components/FormulaireAction.tsx:84` | message d'erreur `text-red-600`, quand le formulaire est dans la zone rouge de `src/app/dossiers/[id]/page.tsx:201` | 4,36 | déduit de deux lectures, pas vu à l'écran |
| `src/app/dossiers/[id]/personnes/page.tsx:40` | carte d'une personne révoquée, à `opacity-60` : pastille « révoqué le … » 3,22 ; texte d'aide 2,31 ; nom 4,72 (conforme) | 3,22 et 2,31 | calculé par composition des couleurs, pas mesuré à l'écran |

**C. Éléments d'interface sous 3:1.**

| Fichier et ligne | Élément | Ratio | À noter |
| --- | --- | --- | --- |
| `src/components/ui.tsx:29` | bordure d'un champ, `border-neutral-300` sur `bg-white` | 1,48 | le champ ne se distingue de sa carte que par ce trait |
| `src/app/page.tsx:67` | bordure du petit bouton, `border-neutral-400` sur `white` | 2,58 | son texte, lui, est conforme |
| `src/app/dossiers/[id]/actions/page.tsx:75` | points de la frise sur la page : vert 2,12 ; ambre 2,04 ; gris 2,47 (le rouge, 3,64, est conforme) | 2,04 à 2,47 | « en retard » et « fait » sont aussi dits par une pastille (lignes 77 et 79) |

**D. Conformes de justesse**, à surveiller si un fond change : `text-neutral-500` sur le fond de
page (4,54 ; 78 emplois de cette classe au total) et `text-red-600` sur le fond de page (4,56).

## 9. Décisions

### Prises le 2026-10-12, pas encore appliquées au code

Elles sont écrites dans `DECISIONS.md`, à cette date.

1. **Police : Arial reste.** Rien à changer.
2. **Couleur d'accent : oui.** Une teinte sera réservée à l'action à faire.
3. **Texte discret : deux niveaux sont gardés** sous le texte secondaire, « aide » et « discret ».
   Chacun atteint 4,5:1 avec son fond.
4. **Bordure des champs : elle se fonce** jusqu'à atteindre 3:1 avec son fond.
5. **Noms en français** : ce dossier s'appelle `charte-graphique/`, son second fichier
   `jetons.md`.

### Prises le 2026-10-28, pas encore appliquées au code

Elles sont écrites dans `DECISIONS.md`, à cette date, après comparaison des options dans Storybook.
Leur application se suit dans l'issue #71.

1. **Couleur d'accent : le bleu pétrole**, `cyan-800` (`#005f78`) : 7,22:1 sur blanc, 6,91:1 sur
   le fond de page, 6,62:1 sur `neutral-100`. Au survol : `cyan-900` (`#104e64`, 9,14:1 sur blanc).
2. **Elle marque le bouton principal et l'onglet courant.** Les liens restent de la couleur du
   texte, soulignés.
3. **Texte : un même gris pour « aide » et « discret »**, `neutral-500` ; le discret se distingue
   par l'italique. Les 14 emplois de `text-neutral-400` sur du texte changent, les autres non.
4. **Bordure des champs : `#8e8e8e`**, au seuil de 3:1 sur les trois fonds (3,27 ; 3,13 ; 3,00).
   Seulement pour les champs : le cadre en pointillé et le filet de la frise gardent `neutral-300`.
5. **Quatre jetons** dans le bloc `@theme` : `accent`, `accent-survol`, `texte-discret`,
   `bordure-champ`. Les autres rôles gardent leurs classes.
6. **Les quatre interdits proposés au § 7 sont retenus.**
7. **Le public est celui du cadrage** (§ 1).

### Repères pour les appliquer

Calculés avec la méthode du § 8 : le gris le plus clair qui atteint le seuil, selon le fond.

| Besoin | Sur blanc | Sur le fond de page `neutral-50` | Sur `neutral-100` |
| --- | --- | --- | --- |
| Texte, 4,5:1 | `#767676` | `#737373` | `#707070` |
| Bordure d'un champ, 3:1 | `#949494` | `#919191` | `#8e8e8e` |

- **Pour le texte.** Sur le fond de page, `neutral-500` (`#737373`) est déjà le gris le plus clair
  possible. Le niveau « discret » ne peut donc pas être plus clair que le niveau « aide »
  d'aujourd'hui. Garder deux niveaux demande soit de foncer aussi le niveau « aide » (78 emplois),
  soit de distinguer le niveau « discret » autrement que par son gris.
- **Pour la bordure.** Dans la palette de Tailwind, `neutral-400` ne suffit pas (2,58:1 sur blanc)
  et `neutral-500` suffit (4,74:1). Une valeur entre les deux demande un jeton à part.

### Encore ouvertes

Les cinq premières questions ouvertes le 2026-10-12 sont tranchées le 2026-10-28 (ci-dessus).
Restent :

1. **Les autres écarts de contraste** du § 8 (B, et le reste de C) : aucun n'a de décision. Parmi
   eux, le texte en `neutral-500` posé sur `neutral-100` (4,34:1) : la décision du 2026-10-28 sur
   le texte ne le règle pas.
2. **Où la charte est citée.** Les règles du projet sont redites dans `README.md` et `docs/`
   (01 à 08) ; ce dossier n'y est pas encore cité.
