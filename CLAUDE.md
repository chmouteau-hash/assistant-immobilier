# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commandes

Node.js 24 ou plus est requis : la base passe par `node:sqlite`, intégré à Node.

```bash
npm run dev          # http://localhost:3000
npm test             # tous les tests (vitest, base SQLite en mémoire)
npx vitest run tests/domain/provenance.test.ts                  # un seul fichier
npx vitest run tests/domain/provenance.test.ts -t "estimation"  # les tests dont le nom contient ce texte
npm run typecheck    # next typegen, puis tsc --noEmit
npm run lint
npm run build
node scripts/sauvegarde.mjs   # copie la base et les fichiers déposés dans sauvegardes/<horodatage>/
```

La CI (`.github/workflows/ci.yml`) joue `typecheck`, `lint`, `test` puis `build` sur chaque PR et sur `main`.

## Architecture

Application Next.js (App Router) locale, mono-poste, sans authentification. Trois couches, dépendance à sens unique `app → lib → domain` ; aucune requête SQL hors de `src/lib`.

- `src/domain/` : fonctions pures (provenance, budget, comparaison, droits, planning, mesure, contrat de l'IA). Ni base, ni Next.js, ni React.
- `src/lib/` : accès aux données et application des droits. Une fonction qui lit ou écrit un dossier reçoit l'`Acteur` en premier paramètre et commence par `exiger(acteur, dossierId, action, section)`. Elle lève une `ErreurApplicative` (`invalide()`, `interdit()`, `introuvable()` dans `erreurs.ts`) et renvoie des objets plats.
- `src/app/` : pages serveur pour la lecture ; toutes les écritures passent par les Server Actions d'un seul fichier, `src/app/dossiers/actions.ts`. Pages et routes déclarent `export const dynamic = "force-dynamic"`.

### Trajet d'une écriture

`<FormulaireAction>` → `actionXxx(etat, formData)` → `executer()` → fonction de `lib`.

- `executer()` résout l'acteur côté serveur, appelle `lib`, revalide les pages, transforme une `ErreurApplicative` en message de formulaire et laisse remonter toute autre erreur.
- La fonction de `lib` enchaîne `exiger`, la validation, puis `transaction()`, qui écrit la donnée et son événement d'audit (`enregistrerEvenement`) ensemble. `transaction()` est réentrante.
- Une Server Action est joignable par une requête POST directe : les droits se contrôlent dans `lib`, jamais dans `actions.ts` ni dans un composant. L'interface se contente de masquer, avec `autorise()`.

### Droits et acteur

- `domain/droits.ts` décide (`peut()`, refus par défaut) ; `lib/acces.ts` applique et journalise chaque refus (`acces_refuse`).
- Sections : `identite`, `personnes`, `lieux`, `idees`, `scenarios`, `budget`, `documents`, `taches`, `ia`, `droits`. Rôles : propriétaire, contributeur, lecteur, professionnel (limité à son périmètre de sections).
- `lib/acteur-courant.ts` est le seul module qui sait qui agit : l'utilisateur local, ou une personne simulée par le cookie `acteur_simule` (un simulateur de rôles, pas une connexion). L'acteur ne se lit jamais dans un champ de formulaire.
- Chaque page sous `src/app/dossiers/[id]/` obtient son acteur par `await obtenirActeurPourSection(id, "<section>")`. Dossier inconnu, dossier interdit et section interdite répondent tous « introuvable » : l'existence d'une ressource ne fuit pas.

### Règles du produit que le code doit tenir

- **L'inconnu n'est jamais 0.** Une valeur absente est `null`, affichée « à renseigner ». Une donnée sensible est une `ValeurTracee` : valeur, `source`, `confiance`. Les combinaisons permises sont définies dans `domain/provenance.ts` et redites en contraintes `CHECK` dans les migrations : une règle qui change se change aux deux endroits.
- **Pas de virgule flottante.** Montants en centimes entiers, surfaces en centièmes de m², taux d'imprévus en pour-mille. La saisie se convertit dans `lib/montant.ts` et `domain/mesure.ts`.
- **Statuts en base.** Statuts et types sont des tables `ref_*`, lues par `lib/references.ts` : en ajouter un passe par une migration. Les vocabulaires qui portent une règle (source, confiance, rôles, sections) sont en plus typés dans `domain`. Pour la source et la confiance, les mots des formulaires et des pastilles viennent de `domain/provenance.ts` (un seul nom par origine), pas des libellés des tables.
- **Journal d'audit en ajout seul**, garanti par un déclencheur SQLite. Seule exception : la suppression définitive d'un dossier, qui purge son journal dans la même transaction.
- **L'application fonctionne sans IA.** L'assistant est désactivé par défaut et s'active par dossier. Il ne reçoit que les sections cochées par le propriétaire que l'acteur peut lire (jamais `personnes`, `droits` ni `ia`) et n'écrit rien dans le dossier. Le nom du dossier ne part qu'avec la section `identite`, le nom d'un scénario qu'avec `scenarios`. L'écran montre le texte exact avant l'envoi : l'écran et le fournisseur distant l'écrivent par la même fonction, `serialiserContexte` (`domain/ia/types.ts`). Deux fournisseurs derrière l'interface `FournisseurIA` : règles locales (`domain/ia/questions-manquantes.ts`, sans réseau) et Anthropic (`lib/ia/anthropic.ts`, importé dynamiquement seulement si le dossier le demande et si `ANTHROPIC_API_KEY` existe).
- **Juridique, fiscal, financier : structuré, jamais tranché.** Ces points sont marqués « à vérifier avec un professionnel ».

### Base de données

- Un fichier SQLite, `data/dossier.sqlite`, ouvert par `obtenirBase()` (`lib/db/client.ts`). Variables facultatives dans `.env.example` ; aucune n'est obligatoire.
- Migrations `src/lib/db/migrations/NNN_nom.sql`, appliquées une fois, dans l'ordre. Une migration nouvelle s'applique à la base réelle dès le prochain accès (`npm run dev`). Un fichier appliqué ne se modifie plus : on en ajoute un.
- `node:sqlite` rend des lignes à prototype nul, que React refuse de passer à un composant client. Une ligne renvoyée vers l'interface passe par `versObjet` / `versObjets`, qui convertissent aussi `snake_case` en `camelCase`.
- Les fichiers déposés vivent sous `data/fichiers/`, hors de `public/`, et ne sont servis que par `api/fichiers/[id]`, après contrôle des droits.

### Tests

- Base SQLite en mémoire, une seule connexion partagée (`fileParallelism: false`). Un test qui touche la base appelle `reinitialiserBasePourTests()` dans `beforeEach`, puis appelle `lib` directement avec un `Acteur` écrit à la main : Next.js n'est pas nécessaire.
- `next/headers` et `next/navigation` n'existent que pendant une requête : un test qui en dépend les remplace (modèle : `tests/lib/sections-interdites.test.ts`).
- Deux tests lisent le code source et échouent sur un oubli. Un `<select>` dont `defaultValue` est calculé doit porter une `key` (issue #16). Une page de section doit appeler `obtenirActeurPourSection` (issue #20).

## Conventions du dépôt

- Tout est en français : identifiants, commentaires, textes d'écran, messages de commit (`fix(journal): …`). Les modules de `lib` et de `domain` commencent par un commentaire qui dit ce qu'ils garantissent et pourquoi.
- `DECISIONS.md` est le journal daté des règles tranchées : une règle décidée s'y écrit le jour même. Une entrée récente peut préciser ou renverser une plus ancienne : lire jusqu'à la dernière entrée du sujet. Il n'y a ni spécifications à statut ni exigences numérotées (entrée du 2026-10-10).
- `README.md` et `docs/` (01 à 08) redisent les règles en clair : une règle qui change s'y corrige aussi.
- Données privées : `data/` et `sauvegardes/` ne partent jamais dans git. Tests, exemples et issues n'emploient que des données fictives.
- Tout nouveau service externe (IA, hébergement, mesure d'audience) passe d'abord par une entrée dans `DECISIONS.md` et par la checklist de `docs/05-securite-rgpd.md`.

## Claude Code

- Un commit, un push ou une PR attend l'accord explicite de Christophe, donné après avoir vu le diff ou le texte complet. L'accord vaut pour l'opération montrée, pas pour la suivante. Christophe fusionne lui-même les PR, une fois la CI verte.
- Réécrire le texte d'une issue existante attend le même accord. Créer une issue de retour d'utilisation n'en demande pas.
- Une branche dont la PR est fusionnée se supprime sans demander, sur le PC et sur GitHub, après avoir vérifié qu'elle ne contient aucun commit absent de `main`. Toute autre branche (sans PR, PR fermée sans fusion, commits non fusionnés) attend l'accord.
