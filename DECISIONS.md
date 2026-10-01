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

## 2026-10-01 — Sauvegarde et export lisible : deux fonctions séparées

**Décision.** La sauvegarde/restauration (issue #2) et l'export lisible (clôture de dossier,
issue #4 ; remontées vers GitHub, issue #5) sont deux fonctions distinctes, pas un format unique :

1. **Sauvegarde/restauration** : copie du fichier `data/dossier.sqlite` tel quel. Pas de
   sérialisation JSON — la base est déjà un fichier unique, la copier directement évite tout
   risque de perte en re-sérialisant et n'impose aucun format à concevoir.
2. **Export lisible** : document Markdown généré à la demande (clôture de dossier, remontée
   expurgée vers une issue GitHub), à but de lecture et de partage. Jamais utilisé pour
   restaurer — un export lisible est par nature partiel.

**Pourquoi.** Les deux besoins ont des contraintes opposées : la sauvegarde doit être fidèle à
100 % mais peut rester illisible hors de l'application ; l'export lisible doit être compréhensible
hors contexte mais peut être partiel. Chercher un format unique pour les deux aurait complexifié
la sauvegarde pour la rendre lisible, sans que ce soit nécessaire.

**Conséquence sur le cadrage existant.** Répond à la question ouverte « Format de l'export,
règles de reprise et de suppression des données » (§Questions ouvertes du cadrage) — pour la
partie format ; les règles de reprise et de suppression restent à trancher séparément.

## 2026-10-01 — Document : table unique dans le socle, pas une par module

**Décision.** L'entité « Document » du cadrage (type, fichier, provenance, liens au bien, au
scénario et au poste de budget) est construite une seule fois, dans le socle (issue #2), plutôt
que dupliquée dans chaque issue qui la consomme. #3 (pièces d'achat) et #4 (devis, factures)
sont déclarées `blocked-by` #2 sur GitHub en conséquence.

**Pourquoi.** Le cadrage décrit un document comme pouvant toucher le bien, le scénario et le
poste de budget à la fois — ce n'est pas trois documents séparés selon qui le consulte, mais un
seul enregistrement avec plusieurs liens. Une table par module aurait empêché ce cas et créé des
doublons dès qu'un même devis sert à la fois de pièce d'achat et de ligne de budget.

**Ce qui n'est pas tranché.** Le mécanisme d'extraction/validation du contenu d'un document
(principe 4 du cadrage) n'est pas scopé ici — seule la table et son rattachement le sont.

## 2026-10-01 — Principe 3 (traçabilité) : une intention, pas un vocabulaire unique à reprendre mot pour mot

**Décision.** Le principe 3 du cadrage (chaque donnée indique son origine et son statut : idée,
hypothèse, document reçu, réponse vérifiée, décision retenue) reste une intention de traçabilité,
pas un vocabulaire à répliquer tel quel dans chaque table. Chaque domaine garde le sien quand son
cycle de vie le justifie : `ref_statut_scenario`, `ref_statut_tache`, `ref_type_montant`, et le
futur statut de faisabilité de #3 (inconnu / à vérifier / confirmé).

**Pourquoi.** Scénario, tâche, montant et faisabilité ont des cycles de vie réellement
différents ; les forcer dans un vocabulaire commun aurait ajouté une abstraction que l'usage
actuel ne demande pas. Ce que le principe 3 exige réellement, c'est que chaque donnée importante
garde sa provenance (`source`, déjà présent partout via `ref_source_donnee`) et un état
explicite — pas que cet état porte toujours les mêmes mots.

**Ce qui n'est pas tranché.** Si un futur module a besoin d'un état de confiance générique sans
cycle de vie propre, le vocabulaire à trois états introduit par #3 est le candidat le plus proche
à réutiliser — à revoir au moment venu, pas anticipé ici.

## 2026-10-01 — Intervenant : fiche réutilisable, dans le socle

**Décision.** Un intervenant (artisan, fournisseur, architecte, notaire, agence...) a sa propre
fiche (table `intervenant`, socle #2), réutilisable d'un devis à l'autre et d'un dossier à
l'autre — pas seulement un nom ressaisi sur chaque devis. Rattachée aux documents
(`document.intervenant_id`, facultatif) plutôt qu'aux lignes de budget directement.

**Pourquoi.** Dans la perspective où l'application serait un jour vendue, un répertoire
d'intervenants réutilisable a plus de valeur qu'un champ texte ressaisi à chaque devis. Ça reste
une table ordinaire du socle V0 (un seul utilisateur, une seule base locale) : rien n'anticipe le
partage ou le multi-utilisateur de la V2 — même principe que celui déjà appliqué aux tâches et à
l'isolation entre tenants, ne pas construire avant que l'usage ou l'objectif ne le demande.

**Ce qui n'est pas tranché.** Les valeurs de `ref_type_intervenant` (artisan, fournisseur,
architecte, notaire, agence, autre) sont provisoires — à ajuster à l'usage, comme les autres
tables `ref_*`.
