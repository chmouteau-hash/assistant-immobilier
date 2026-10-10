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

**Précisé le 2026-10-10 — le point 1 ne se limite plus au fichier de base.** Les documents
déposés sont des fichiers sous `data/fichiers/`, hors de la base : copier `dossier.sqlite` seul
les perdrait. La sauvegarde implémentée (`scripts/sauvegarde.mjs`, `scripts/restauration.mjs`,
procédure dans `docs/07-sauvegarde-restauration.md`) copie donc la base par `VACUUM INTO`
(instantané cohérent), les fichiers déposés et un manifeste avec somme de contrôle. Le principe
de la décision reste intact : aucune sérialisation JSON de la base, aucun format à concevoir, et
la sauvegarde ne sert qu'à restaurer. Pour l'export complet d'un dossier, voir l'entrée du
2026-10-09.

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

## 2026-10-10 — Stade du dossier : mettre en avant ou reléguer, pas des écrans par étape

**Décision.** L'application reste organisée par objets (lieux, scénarios, idées, budget, actions,
documents, journal, personnes, assistant). Le stade du dossier ne crée pas d'écrans par étape : il
sert à mettre en avant ou à reléguer des sections. Au stade « travaux », la recherche et l'achat ne
sont pas au premier plan. C'est le sens donné à « sauter une étape » dans l'issue #3.

**Pourquoi.** Le cadrage demande qu'une rénovation de chambre puisse « sauter les étapes d'achat et
de recherche », et décrit sa recette « sans écrans d'achat inutiles » : il vise ce que l'écran
montre, pas un parcours imposé. Des écrans par étape obligeraient à réorganiser toute la navigation
de la V1, alors qu'un même objet sert à plusieurs étapes (un document peut toucher un lieu, un
scénario et un poste de budget). La mise en avant se vérifie en recette à moindre coût.

**Conséquence.** Le bloc 4 de l'issue #3 porte ce travail, avec la contrainte de `dossier.stade`
vers `ref_stade`, aujourd'hui absente : la colonne est du texte, même si l'écran propose une liste.

**Ce qui n'est pas tranché.** Quelles sections sont reléguées à quel stade ; si « reléguer » veut
dire masquer ou seulement replier ; ce qu'affiche un dossier sans stade (le stade reste facultatif).

## 2026-10-10 — Budget : une facture partielle ne fait pas baisser le total

**Décision.** Tant qu'un poste n'est pas marqué « soldé », son montant de référence est le plus
élevé entre le montant engagé ou devisé et le total facturé. Une fois le poste soldé, la référence
est le total facturé. Précise la règle du 2026-10-09 (« la référence d'un poste est la nature la
plus avancée »), qui reste vraie pour un poste soldé.

**Pourquoi.** Essai du 2026-10-10 sur `synthetiserScenario` : un poste portant un devis de 10 000 €
voit sa référence tomber à 3 000 € dès une première facture de 3 000 €, et le total du scénario
avec. La règle ne distingue pas une facture finale d'un acompte : le budget affiché baisse alors que
7 000 € restent à venir. Garder le plus élevé évite cette baisse ; le passage à « soldé » laisse
visible une facture finale inférieure au devis.

**Conséquence.** Le bloc 2 de l'issue #4 porte ce travail : notion de poste soldé, nouvelle règle de
référence, tests. « Soldé » (plus aucune facture attendue) se distingue du statut « payé » existant
(les paiements couvrent les factures reçues).

**Ce qui n'est pas tranché.** Comment un poste devient « soldé » (action manuelle avec motif, ou
automatique) ; le cas d'un poste facturé sans devis ni engagement, qui n'a qu'une estimation.

## 2026-10-10 — Ni specs ni exigences numérotées tant qu'une seule personne décide

**Décision.** Le dépôt ne reprend pas la gouvernance documentaire d'Ergonomia : pas de
spécifications à statut (PROPOSITION, ACTIVE), pas d'exigences numérotées (`EXG-*`), pas de
traçabilité entre exigence et code. En tiennent lieu : le cadrage pour le besoin, ce journal pour
les règles tranchées, les sections « Reste à réaliser » et « Recette » des issues pour ce qui est
à faire et à vérifier, les tests pour le contrôle automatique. À durcir sur un déclencheur réel :
un second contributeur, ou un premier abonné.

**Pourquoi.** Specs et exigences numérotées servent à se coordonner : leur valeur croît avec le
nombre de personnes et avec ce qu'une erreur coûte à quelqu'un d'autre. Ici, une seule personne
décide, développe et utilise. Le choix date du 2026-10-01 : il est écrit en tête de
`.github/workflows/ci.yml`, qui renvoyait à ce journal sans qu'aucune entrée ne le porte. Il est
confirmé le 2026-10-10 après comparaison avec Ergonomia (trois personnes, produit en service).

**Conséquence.** Les ajouter plus tard ne change pas le comportement de l'application : numéroter
les règles déjà écrites, citer ces numéros dans les tests, ajouter un contrôle à la CI. Le coût
serait le rattrapage des règles restées dans le code seul ; il reste faible tant qu'une règle
tranchée est consignée ici le jour même.

**Ce qui n'est pas tranché.** La forme à prendre le jour du déclencheur : celle d'Ergonomia telle
quelle, ou une version allégée.

## 2026-10-10 — Actions : une dépendance se retire, une action faite se rouvre

**Décision.** Deux compléments à la règle « B dépend de A » du 2026-10-09, venus du test pilote
(issue #21) :

1. Une dépendance se retire comme elle se pose : même droit (écrire les actions), même trace au
   journal d'audit, sans motif. Retirer une dépendance qui n'existe plus est sans effet.
2. Une action faite se rouvre en changeant son statut, depuis la liste « Actions faites » de
   l'écran Actions. Rien n'est répercuté sur les actions qui en dépendent : celles qui ne sont pas
   faites repassent d'elles-mêmes dans « À débloquer », celles qui sont faites le restent.

**Pourquoi.** Une dépendance posée par erreur bloquait une action sans recours, alors que le
message de refus proposait déjà de la retirer. Une action passée à « Faite » par erreur le restait :
la liste du jour ne classe que les actions non faites, et sa liste de statut disparaissait avec elle.

**Ce qui n'est pas tranché.** Modifier la description, l'échéance ou le responsable d'une action
(issue #22) ; afficher aussi les actions faites sur l'accueil.

## 2026-10-10 — Actions : une action se corrige après sa création

**Décision.** Tranche le premier point laissé ouvert par l'entrée précédente. La description,
l'échéance, le responsable, le scénario et la marque « jalon » d'une action se modifient depuis
l'écran Actions du dossier, avec le même droit que pour la créer (écrire les actions) et les mêmes
garde-fous : description obligatoire, échéance au format AAAA-MM-JJ ou vide, scénario du même
dossier. Seuls les champs changés sont tracés au journal d'audit, avec la valeur d'avant et celle
d'après ; aucun motif n'est demandé. Vider l'échéance la rend de nouveau inconnue.

**Pourquoi.** Une action créée sans échéance ne pouvait jamais en recevoir une, et une faute de
frappe restait. Le critère « suivre tâches, responsables, échéances » de l'issue #1 n'était donc
pas tenu (constat de l'issue #22).

**Ce qui n'est pas tranché.** Supprimer une action, ou la marquer abandonnée ; les mêmes
corrections sur les autres objets (lieu, bâtiment, pièce, idée, scénario, poste : issue #22).
