# 3. Architecture cible

Monolithe modulaire en trois couches, règle de dépendance stricte `app → lib → domain`.

```
┌──────────────────────────────── src/app (Next.js) ────────────────────────────────┐
│ pages serveur (lecture)        Server Actions (actions.ts : toute écriture)        │
│ api/fichiers/[id] (sert un fichier après contrôle)                                 │
└───────────────┬───────────────────────────────────────────────────────────────────┘
                │ Acteur résolu côté serveur (acteur-courant.ts) — jamais depuis un champ
┌───────────────▼──────────────── src/lib ──────────────────────────────────────────┐
│ acces.ts : exiger(acteur, dossier, action, section) → journalise les refus         │
│ dossiers · personnes · structure · idees · budget · taches · documents · ia        │
│ db/client.ts (SQLite, migrations, transactions)   db/audit.ts (ajout seul)         │
│ ia/anthropic.ts (chargé dynamiquement si configuré)                               │
└───────────────┬───────────────────────────────────────────────────────────────────┘
                │ données simples (entiers, chaînes, listes)
┌───────────────▼──────────────── src/domain (pur) ─────────────────────────────────┐
│ provenance · budget · comparaison · droits · planning · mesure · ia/types          │
│ ia/questions-manquantes (fournisseur règles locales)                               │
└───────────────────────────────────────────────────────────────────────────────────┘
                 data/dossier.sqlite        data/fichiers/<dossier>/<id>.<ext>
```

## Modules et responsabilités

| Module | Responsabilité | Ne fait pas |
| --- | --- | --- |
| `domain/provenance` | Définit source × confiance, valide une `ValeurTracee`, produit l'étiquette d'affichage | Ne lit ni n'écrit rien |
| `domain/budget` | Synthèse par poste et scénario, écarts, marge, statut d'avancement | Ne connaît pas la base |
| `domain/comparaison` | Classe les scénarios complets, refuse de conclure sur un total partiel | Ne décide pas |
| `domain/droits` | `peut()` : refus par défaut, rôles, sections, révocation | Ne connaît pas l'acteur courant |
| `domain/planning` | Dépendances, cycles, liste du jour, timeline | N'invente pas de date |
| `domain/ia` | Contrat de réponse sourcée, fournisseur règles locales | N'appelle aucun réseau |
| `lib/acces` | Applique `peut()` sur les participations en base, journalise les refus | Ne décide pas des règles |
| `lib/*` métier | Valide, écrit en transaction avec son événement d'audit, renvoie des objets plats | Pas de rendu |
| `lib/ia` | Construit le contexte autorisé (agrégats), choisit le fournisseur, journalise l'échange | N'écrit jamais dans le dossier |
| `app/actions.ts` | Lit le formulaire, résout l'acteur, appelle `lib`, traduit les erreurs | Pas de SQL, pas de règle métier |

## Flux principaux

**Création d'un dossier**
1. Formulaire (nom seul obligatoire) → `actionCreerDossier` → `obtenirActeurCourant()`.
2. `dossiers.creerDossier` : transaction { insert `dossier` ; insert `participation` (créateur = propriétaire) ; audit `creation` }.
3. Redirection vers la vue d'ensemble : type, stade, objectif affichés « À renseigner » s'ils manquent.

**Ajout d'une facture**
1. `actionDeposerDocument` reçoit le fichier → `documents.deposerDocument` : droits `ecrire documents` ; MIME et taille vérifiés ; écriture `data/fichiers/<dossier>/<uuid>.pdf` ; SHA-256 ; insert `document` + audit.
2. Lecture : `proposerExtraction` (source `saisie` ou `suggestion_ia`) → lignes `extraction_document` au statut `proposee`, confiance `a_confirmer`. **Rien au budget.**
3. `validerExtraction` : droits `ecrire documents` et `ecrire budget` ; corrections appliquées (une correction vide = pas de correction) ; statuts `validee`/`corrigee` ; si montant : poste trouvé ou créé dans le scénario rattaché ; `ajouterLigne` source `import`, confiance `connu`, `document_id` ; audit `validation` avec avant/après.

**Calcul d'un scénario**
1. `budget.syntheseScenario` : droits `lire budget` ; lit postes et lignes ; lit le taux d'imprévus du dossier.
2. `domain/budget.synthetiserScenario` (pur) : par poste, sommes par nature, référence = nature la plus avancée, écarts, reste à payer ; par scénario, totaux, marge (arithmétique entière), `complet` faux si un poste est à renseigner.
3. `domain/comparaison.comparerScenarios` : rang et écart seulement entre scénarios complets ; `reserve` explicite sinon.

**Activation de l'IA**
1. Propriétaire seul (`activer_ia`) : `configurerIA` enregistre `ia_activee`, `ia_perimetre` (sections, jamais personnes/droits/ia), `ia_fournisseur` ; audit.
2. Question : `demanderAssistant` : droits `lire ia` ; si désactivé → `IA_INDISPONIBLE` ; contexte = périmètre ∩ sections lisibles par l'acteur, sous forme d'agrégats (pas de nom, d'adresse, de fichier) ; fournisseur appelé ; `ia_echange` + audit `ia_requete`.
3. Réponse affichée : constat (sources datées) → hypothèse → suggestion → vérification, incertitude, avertissement. Aucune écriture.

## Gestion des droits

- Rôles : propriétaire (tout), contributeur (écrit sauf droits/IA), lecteur (lit sauf droits), professionnel (lit son périmètre ; dépose documents, montants, actions dans ce périmètre).
- Sections : identite, personnes, lieux, idees, scenarios, budget, documents, taches, ia, droits.
- Sans participation active : aucun accès, et un dossier inconnu répond comme un dossier interdit (pas de fuite d'existence).
- Le dernier propriétaire ne peut être ni révoqué ni rétrogradé.
- L'interface masque ce qui est refusé ; le serveur refuse quand même (`exiger`), et journalise (`acces_refuse`).

## Journal d'audit

Table `audit_evenement` en ajout seul (déclencheurs SQLite sur UPDATE/DELETE), écrite dans la même
transaction que l'effet. Champs : entité, identifiant, action (création, modification, transition
de statut, suppression, révocation, validation, requête IA, accès refusé), acteur, dossier, motif,
changements `[{champ, avant, après}]`. Tracés notamment : changements de statut de scénario, d'idée,
d'hypothèse (motif obligatoire pour retenir/écarter) ; chaque ligne de budget ; chaque changement de
surface ou d'adresse (provenance) ; chaque droit accordé, modifié, révoqué ; chaque configuration et
requête IA.

## Sauvegarde

Voir docs/07. En bref : `scripts/sauvegarde.mjs` (VACUUM INTO + copie des fichiers + manifeste
avec SHA-256) ; `scripts/restauration.mjs` (vérifie, met l'état courant de côté, remplace).
