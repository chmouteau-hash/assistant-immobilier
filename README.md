# Assistant immobilier et travaux — V1 testable

Application web locale qui accompagne un projet immobilier dans un **dossier unique**, de la
recherche d'un bien (ou d'une simple idée de travaux) jusqu'à la réception : personnes, lieux,
bâtiments, pièces, idées, scénarios comparés, budget par poste, documents, actions et planning,
assistant IA facultatif.

Trois règles tiennent tout le produit :

1. **Rien n'est inventé.** Une donnée inconnue reste « à renseigner » ; elle ne vaut jamais 0.
2. **Toute donnée affichée porte sa provenance et son statut** (saisie, document importé, estimation,
   source externe, suggestion de l'IA × connu, estimé, à confirmer, à renseigner). Une estimation
   n'apparaît jamais comme un fait.
3. **L'application fonctionne entièrement sans IA.** L'assistant est un module séparé, désactivé par
   défaut, activable par dossier, qui ne reçoit que les sections autorisées et n'écrit rien.

Les points juridiques, fiscaux et financiers sont structurés, jamais tranchés : ils sont marqués
« à vérifier avec un professionnel ».

## Installation et lancement

Prérequis : [Node.js](https://nodejs.org/) **24 ou plus** (pour `node:sqlite`, intégré : aucune base
de données à installer).

```bash
npm install
npm run dev        # http://localhost:3000
```

Autres commandes :

```bash
npm test           # tests automatisés (vitest, base SQLite en mémoire)
npm run typecheck  # TypeScript
npm run lint       # ESLint
npm run build      # construction de production, puis : npm start
```

Variables d'environnement facultatives : voir [`.env.example`](.env.example). Aucune n'est requise.
La clé `ANTHROPIC_API_KEY` n'est lue que si un dossier choisit le fournisseur distant.

Au premier démarrage, la base `data/dossier.sqlite` est créée (ou migrée) et un « utilisateur
local » devient propriétaire des dossiers existants. **`data/` ne part jamais dans git** (base,
fichiers déposés, sauvegardes).

## Ce que couvre la V1 (six priorités du cadrage)

| # | Priorité | Où dans l'application |
| --- | --- | --- |
| 1 | Dossier flexible : type de projet, stade, personnes, lieux, bâtiments, pièces, idées | Mes dossiers → Vue d'ensemble, Lieux, Idées, Personnes |
| 2 | Organiser : saisie structurée, photos et fichiers, classement, statuts connu / estimé / à confirmer / à renseigner | Lieux (surfaces, adresses et positions tracées, plan des lieux), Documents |
| 3 | Faire avancer : actions, responsables, dates, dépendances, timeline, liste du jour | Actions et planning ; Accueil (Aujourd'hui / À débloquer / À explorer) |
| 4 | Suivre les coûts : budget par poste et par scénario ; devis, factures, paiements reliés | Budget ; Documents (extraction validée → ligne de budget) |
| 5 | Comparer les variantes dans des scénarios distincts | Scénarios (comparaison, hypothèses, décisions) |
| 6 | Tester le rôle de l'IA : manuel d'abord, assistant optionnel et sourcé | Assistant IA (règles locales ou modèle distant) |

## Structure du code

```
src/domain/        Fonctions PURES, sans base ni framework — testées en isolation
  provenance.ts      source × confiance, règles de cohérence, étiquette d'affichage
  budget.ts          synthèse par poste et scénario (centimes entiers), écarts, imprévus
  comparaison.ts     comparaison prudente de scénarios (jamais de « gagnant » sur un total partiel)
  droits.ts          rôles, sections, peut(acteur, action, section)
  planning.ts        dépendances, cycles, liste du jour, timeline sans date inventée
  mesure.ts          surfaces en centièmes de m²
  geo.ts             positions en microdegrés entiers, fond de carte, lecture du service d'adresses
  ia/types.ts        contrat ReponseIA (constat → hypothèse → suggestion → vérification)
  ia/questions-manquantes.ts  fournisseur « règles locales » (sans réseau)
src/lib/           Accès aux données + contrôle des droits CÔTÉ SERVEUR
  db/client.ts       SQLite local, migrations versionnées (db/migrations/NNN_*.sql), transactions
  db/audit.ts        journal d'audit (ajout seul, garanti par déclencheur)
  acces.ts           exiger(acteur, dossier, action, section) — appelé par toute fonction
  acteur-courant.ts  qui agit (utilisateur local ; acteur simulé via cookie pour tester les rôles)
  dossiers.ts, personnes.ts, structure.ts, idees.ts, budget.ts, taches.ts, documents.ts, ia.ts
  ia/anthropic.ts    fournisseur distant (SDK officiel), chargé seulement si configuré
  geocodage.ts       adresse d'un lieu → position, par la Base Adresse Nationale, sur demande
src/app/           Interface Next.js (App Router) : pages serveur + Server Actions (actions.ts)
  api/fichiers/[id]  sert un fichier déposé après contrôle des droits
src/components/    FormulaireAction (client), CarteLieux (client, plan Leaflet), ui.tsx (étiquettes de provenance, pastilles)
tests/             vitest : domaine, droits, parcours de bout en bout (base en mémoire)
scripts/           sauvegarde.mjs, restauration.mjs
docs/              cadrage, choix techniques, architecture, modèle de données, RGPD, plan de test
```

Règle de dépendance : `app` → `lib` → `domain`. Jamais l'inverse. Aucune requête SQL hors de `lib`.

## Choix techniques et raisons (résumé)

Détail et alternatives comparées : [docs/02-choix-techniques.md](docs/02-choix-techniques.md).

- **Next.js 16 + TypeScript, monolithe modulaire.** Un seul langage des deux côtés, Server Actions
  typées, pas de pipeline de génération d'API. Suffisant pour un utilisateur local et préparé pour
  un hébergement (toutes les fonctions reçoivent un `Acteur` : remplacer `acteur-courant.ts` par une
  vraie session suffit).
- **SQLite local (`node:sqlite`).** Décision du 2026-10-01 (voir [DECISIONS.md](DECISIONS.md)) : les
  données ne quittent pas le PC ; zéro dépendance native. Migrations SQL versionnées, contraintes
  `CHECK` qui redisent les règles de provenance, déclencheurs d'ajout seul sur l'audit.
- **Fichiers sur disque, hors `public/`,** nommés par identifiant, SHA-256 conservé, servis par une
  route qui vérifie les droits.
- **Montants en centimes entiers, surfaces en centièmes de m².** Jamais de virgule flottante dans
  un calcul ou un stockage.
- **Droits : fonction pure + application serveur.** `domain/droits.ts` décide ; `lib/acces.ts`
  l'applique avant chaque lecture/écriture et journalise les refus. L'interface ne fait que masquer.
- **IA : interface `FournisseurIA`.** Deux fournisseurs : règles locales (déterministe, sans
  réseau) et Anthropic (SDK officiel, sortie structurée validée par schéma). Le module ne reçoit
  que les sections cochées, avec les noms, les textes et les montants saisis ; jamais une fiche de
  personne, une adresse ni un fichier. L'écran montre le texte exact avant l'envoi. Il ne peut
  rien écrire.
- **Plan des lieux : Leaflet et deux services publics.** L'écran Lieux montre un repère par lieu
  situé, sur le fond « Plan IGN ». La position est une donnée tracée, en microdegrés entiers. Deux
  choses seulement sortent du PC : l'adresse d'un lieu, vers la Base Adresse Nationale, au clic sur
  « Situer d'après l'adresse » ; les demandes de tuiles du fond de carte, quand un lieu du dossier
  est situé. Ni clé ni compte. Décision du 2026-10-11 (voir [DECISIONS.md](DECISIONS.md)).

Dépendances ajoutées en V1, et pourquoi : `vitest` (tests, résout `@/` et les imports TypeScript
comme Next.js — `node --test` ne le fait pas), `@anthropic-ai/sdk` (client officiel, erreurs typées,
sorties structurées), `zod` (schéma de la réponse IA, exigé par l'aide `zodOutputFormat` du SDK).
Ajoutées ensuite : `leaflet` (plan des lieux, sans clé ni compte) et ses types `@types/leaflet`.

## Bonnes pratiques appliquées

- Fonctions de calcul pures et testées (`tests/domain`), avant toute interface.
- Validation côté serveur de chaque saisie ; les Server Actions sont joignables sans l'interface,
  donc les droits sont vérifiés dans `lib`, pas dans les composants.
- Journal d'audit en ajout seul pour toute modification de décision, de budget, de provenance ou
  de droit, avec acteur et motif.
- Statuts en tables de référence (`ref_*`), pas en énumérations figées dans le code.
- Pas de secret en dur ; variables d'environnement documentées dans `.env.example`.
- Un fichier de migration appliqué n'est plus jamais modifié : on en ajoute un.

## Sauvegarde et restauration

Procédure complète : [docs/07-sauvegarde-restauration.md](docs/07-sauvegarde-restauration.md).

```bash
node scripts/sauvegarde.mjs                         # → sauvegardes/<horodatage>/ (base + fichiers + manifeste)
node scripts/restauration.mjs sauvegardes/<horodatage>              # vérifie seulement
node scripts/restauration.mjs sauvegardes/<horodatage> --confirmer  # restaure (application arrêtée)
```

La sauvegarde copie la base par `VACUUM INTO` (instantané cohérent), les fichiers déposés tels
quels, et écrit un manifeste avec somme de contrôle. La restauration met l'état courant de côté
avant de remplacer quoi que ce soit.

## Tester sur un téléphone (même Wi-Fi)

L'application reste sur le PC ; le téléphone n'est qu'un écran de plus. Rien n'est publié sur
Internet.

```bash
npm run dev:reseau      # écoute sur toutes les interfaces du PC (ou : npm run build && npm run start:reseau)
npm run adresse         # affiche l'adresse à taper sur le téléphone, ex. http://192.168.1.44:3000
```

1. Au premier lancement, Windows demande d'autoriser Node.js sur le **réseau privé** : accepter.
2. Sur le téléphone, connecté au même Wi-Fi, ouvrir l'adresse affichée. Les adresses IPv4 du PC
   sont déclarées automatiquement dans `allowedDevOrigins` (`next.config.ts`) ; pour un autre nom
   d'hôte (tunnel, nom local), le déclarer dans `ASSISTANT_ORIGINES_DEV`.
3. Les photos se déposent directement depuis l'appareil (Documents → Déposer → appareil photo).
4. « Ajouter à l'écran d'accueil » (menu du navigateur) installe un raccourci avec icône, en plein
   écran. Il n'y a pas de mode hors ligne : le PC doit être allumé et sur le même réseau.

Limites : sans authentification, **toute personne connectée à ce Wi-Fi** peut ouvrir le dossier.
Réseau de confiance seulement (pas de Wi-Fi public), arrêter le serveur après l'essai. L'acteur
simulé est propre à chaque navigateur : le téléphone démarre en utilisateur local. Les fichiers HEIC
(iPhone) sont acceptés mais ne s'affichent pas dans tous les navigateurs de bureau.

## Tester les rôles en local

Il n'y a pas d'authentification en V1 (une seule machine). Sur l'accueil, « Vous agissez en tant
que » permet de voir et d'utiliser l'application **comme** une autre personne du dossier (un
notaire limité aux documents, un lecteur…). C'est un simulateur, étiqueté comme tel, pas une
connexion : il sert à vérifier ce que chaque rôle voit avant d'ouvrir un jour l'application à
d'autres.

## Limites connues de la V1

- **Local, mono-poste, sans authentification.** Le partage réel avec un professionnel suppose un
  hébergement et une vraie session (prévu, non fait — voir docs/08).
- **Lecture de documents manuelle.** L'extraction d'une facture est proposée par l'humain qui la
  lit ; l'assistant ne lit pas encore les PDF/photos (amélioration proposée).
- **Plusieurs lignes d'une même nature sur un poste s'additionnent** (acomptes, factures
  partielles). Un devis concurrent non retenu se marque « écarté » (Budget → Lignes détaillées →
  Modifier ou écarter) : il reste visible mais ne compte plus. Tant qu'un poste n'est pas marqué
  « soldé » (Budget → Postes détaillés → Solder le poste), une facture partielle ne fait pas baisser
  son montant de référence ; une fois soldé, sa référence est son total facturé.
- **Pas de simulation de financement ni de fiscalité** : hors des six priorités ; prévue comme
  module paramétrable avec hypothèses visibles.
- **Pas d'import d'un export** : l'archive zip (Vue d'ensemble → Vos données) sert à la
  portabilité et à l'archivage ; la remise en base passe par la sauvegarde/restauration.
- **Pas de chiffrement au repos propre à l'application** : s'appuyer sur le chiffrement du disque
  (BitLocker) ; à revoir avant hébergement.
- La démonstration `index.html` (0.1) est conservée pour mémoire ; elle n'est plus la référence.

## Suivi du projet

- [Cadrage initial](Assistant_immobilier_cadrage_initial.md) · [Journal des décisions](DECISIONS.md)
- [docs/](docs/) : note de cadrage V1, choix techniques, architecture, modèle de données, sécurité et
  RGPD, plan de test pilote, sauvegarde, synthèse et décisions ouvertes.
- Les adresses, documents personnels, factures et montants réels ne doivent pas être copiés dans
  les issues GitHub.
