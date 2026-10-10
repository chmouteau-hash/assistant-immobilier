# Journal des décisions

Un fichier, pas un registre : chaque entrée est courte, datée, et dit ce qui a été tranché et
pourquoi. Une décision prise en discussion ne reste pas à l'état de brouillon — elle migre ici le
jour même (principe du canal `.travail/` d'Ergonomia, repris ici en plus simple : pas de dossier
dédié tant qu'une seule personne décide).

## 2026-10-01 — Base technique : Next.js + SQLite local, pas de serveur distant

**Décision.** La nouvelle base technique utilise Next.js (TypeScript) avec une base **SQLite en
fichier local** (`data/dossier.sqlite`, exclue du dépôt git), pas de Postgres ni de serveur
hébergé.

**Pourquoi.** Le prototype précédent (`index.html`, stockage navigateur) avait déjà posé un
principe explicite : les données du dossier immobilier ne quittent pas le PC, y compris vers le
dépôt GitHub privé. Une première proposition de base technique (Next.js + Postgres distant)
contredisait ce principe sans que la contradiction ait été vue avant d'être signalée. Node 24+
intègre `node:sqlite` en natif : zéro dépendance, zéro compilation (pas de `node-gyp`/Visual
Studio Build Tools à installer, un frein classique de `better-sqlite3` sous Windows).

**Ce qui n'est pas tranché.** Le modèle change dès qu'un professionnel doit accéder à une partie
du dossier (principe 7 du cadrage, prévu en V2) — un accès partagé suppose un serveur. Cette
migration n'est pas encore nécessaire et ne doit pas être anticipée avant d'en avoir besoin.

**Conséquence sur le cadrage existant.** Répond à la question ouverte « Choix du stockage local et
des sauvegardes avant de saisir de vrais documents » (§Questions ouvertes du cadrage).

## 2026-10-01 — Quatre mécanismes posés dès le premier schéma

**Décision.** Le schéma (`src/lib/db/schema.sql`) pose dès la première version :

1. **Statuts en table de référence** (`ref_statut_scenario`, `ref_source_donnee`,
   `ref_type_montant`, `ref_action_audit`), jamais figés dans un type TypeScript fermé — ces
   listes bougeront à l'usage.
2. **Provenance obligatoire** (colonne `source`) sur toute donnée qui peut être une estimation,
   un import ou une suggestion — jamais présentée comme un fait certain.
3. **Journal d'audit en ajout seul** (`audit_evenement`), garanti par un déclencheur SQLite
   (`RAISE(ABORT, …)` sur `UPDATE`/`DELETE`) — pas par la discipline du code applicatif.
4. **Montants en centimes (entiers)**, jamais en virgule flottante.

**Pourquoi maintenant et pas plus tard.** Aucun des quatre ne s'ajoute proprement après coup —
cela demanderait de réécrire les tables et les écritures existantes. Détail et justification
complète en commentaire de tête de `schema.sql`.

**Ce qui n'a pas été repris d'Ergonomia.** L'isolation entre tenants (RBAC appliqué route par
route) n'a pas de pendant ici : à ce stade, un seul utilisateur, un seul dossier par base. Le jour
où plusieurs dossiers coexistent dans la même base ou qu'un professionnel y accède, l'isolation
devra être posée **en base** (ex. SQLite par dossier plutôt qu'un filtre applicatif par requête)
— repris du constat fait sur Ergonomia, où le filtre applicatif (sans RLS) est un point de
vigilance, pas un modèle à reproduire tel quel.

## 2026-10-01 — Tâches : priorité 3 du cadrage, sans dépendances pour l'instant

**Décision.** Ajout d'une table `tache` (description, échéance facultative, responsable, statut,
rattachée à un dossier et, facultativement, à un scénario) et d'une page d'accueil qui classe les
tâches non faites en trois colonnes : **Aujourd'hui** (échéance dépassée ou du jour), **À
débloquer** (statut `bloque`), **À explorer** (le reste) — reprend le principe 5 du cadrage au mot
près.

**Ce qui a été volontairement laissé de côté.** Le cadrage liste aussi des **dépendances** entre
tâches (« Tâche / événement : […] dépendances […] »). Non implémenté ici : une dépendance peut se
vouloir simple (« fait avant ») ou complexe (graphe, blocage automatique), et le choisir sans
usage réel reviendrait à deviner. Pour l'instant, le statut `bloque` sert de substitut manuel —
Christophe indique qu'une tâche attend quelque chose, sans que le système sache quoi. À
reconsidérer une fois que l'usage aura montré si cette distinction manque.

**Chaque tâche n'apparaît que dans une seule colonne** (Aujourd'hui avant À débloquer avant À
explorer) : une tâche bloquée ET en retard ne doit pas compter double sur l'accueil.

## 2026-10-09 — V1 testable : six priorités, droits côté serveur, IA séparée

**Décision.** Livraison de la V1 testable décrite dans le cadrage « architecte » : dossier
flexible (type, stade, personnes, lieux, bâtiments, pièces, idées), provenance sur chaque donnée
sensible, actions avec dépendances et timeline, budget par poste et scénario, comparaison prudente,
documents avec extraction validée, assistant IA optionnel. Le tout reste **local et mono-poste**
(décision du 2026-10-01 inchangée).

**Ce qui a été posé malgré l'absence d'un second utilisateur.** Le modèle `personne` /
`participation` (rôle, périmètre, révocation) et le contrôle `exiger(acteur, dossier, action,
section)` dans toute la couche `lib`. Ce n'est pas l'anticipation d'un serveur : c'est la seule
façon de **tester le rôle d'un professionnel** (ce qu'il voit, ce qu'il ne voit pas) avant d'en
inviter un vrai, et d'écrire les tests de droits demandés. L'acteur courant est l'utilisateur local
ou un acteur **simulé** par cookie, étiqueté comme tel dans l'interface. Le jour de l'hébergement,
seul `src/lib/acteur-courant.ts` change.

**Provenance : deux axes, pas un.** `source` (d'où vient la valeur) et `confiance` (à quel point on
s'y fie) sont indépendants mais contraints (`src/domain/provenance.ts`) : une estimation n'est
jamais « connue », une suggestion de l'IA reste « à confirmer », une valeur absente est « à
renseigner » sans source. La base redit ces règles en `CHECK`.

**Budget : postes puis lignes.** Un poste sans ligne est « à renseigner » et rend l'inconnu
visible ; la référence d'un poste est la nature la plus avancée (facture > engagement > devis >
estimation) ; un total qui contient un poste à renseigner est marqué partiel et la comparaison
refuse de classer. Marge d'imprévus : paramètre du dossier (pour-mille entier), pas une norme.

**Dépendances entre actions : posées.** Revient sur la réserve du 2026-10-01 : la V1 implémente la
forme simple « B dépend de A » avec refus des cycles, blocage du passage à fait/en cours, et
classement « à débloquer » prioritaire. Choix fait parce que la liste du jour sans dépendances
mettait en « aujourd'hui » des actions impossibles à faire.

**IA : fournisseur « règles locales » d'abord.** Avant de payer un modèle et d'envoyer des données
hors du PC, un fournisseur déterministe signale ce qui manque (surfaces, postes, hypothèses,
extractions en attente…) avec le même contrat de réponse sourcée. Le fournisseur Anthropic existe
(SDK officiel, sortie structurée) mais n'est proposé que si `ANTHROPIC_API_KEY` est définie. Trois
sections ne sont jamais transmises : personnes, droits, IA.

**Dépendances ajoutées.** `vitest`, `@anthropic-ai/sdk`, `zod` — justifiées dans le README.

**Non tranché (voir docs/08).** Nom du produit ; premier test (recherche de bien, construction,
les deux) ; informations obligatoires à la création (V1 : le nom seul) ; premier pack
professionnel ; partie de l'IA prioritaire ; séparation éditeur / structure de projet ; montants et
personnes de la simulation de financement.

## 2026-10-09 — Export, suppression, lignes écartées, téléphone

**Décision.** Même journée, après la V1 : quatre compléments issus de la liste d'améliorations.

1. **Export complet** d'un dossier en archive ZIP (`src/lib/export.ts`, archiveur maison
   `src/lib/zip.ts` sans dépendance, entrées stockées) : JSON table par table, fichiers originaux,
   journal d'audit. Propriétaire seulement (nouvelle action `exporter`), chaque export journalisé.
   L'import d'un export n'est pas fait : la remise en base passe par la restauration de sauvegarde.
2. **Suppression définitive** d'un dossier (propriétaire, nom retapé, motif). Le journal d'audit du
   dossier est purgé **dans la même transaction**, en levant temporairement le déclencheur d'ajout
   seul : ces événements contiennent des valeurs personnelles (adresses, montants) et l'effacement
   doit être complet. Il reste une seule trace, sans lien ni contenu : date, acteur, motif, nombre
   d'événements purgés. C'est la seule exception à l'ajout seul, et elle est explicite dans le code.
3. **Statut par ligne de montant** (migration 003) : `active` / `ecartee`. Une ligne écartée reste
   visible et tracée mais n'entre dans aucune somme. Lève la limite « deux devis concurrents
   s'additionnent ». Toute modification de ligne (montant, nature, provenance, statut) exige un
   motif et trace avant/après.
4. **Test sur téléphone** : serveur à l'écoute sur le réseau local (`dev:reseau`), adresses IPv4 du
   PC déclarées automatiquement dans `allowedDevOrigins`, manifeste pour l'écran d'accueil. Pas de
   mode hors ligne, pas d'exposition hors du Wi-Fi de confiance.

**Pourquoi maintenant.** Export et suppression sont des prérequis RGPD à toute ouverture à un tiers ;
les faire avant l'hébergement évite de les concevoir sous contrainte. Le statut par ligne corrige
une limite que le pilote aurait rencontrée dès le premier devis concurrent.
