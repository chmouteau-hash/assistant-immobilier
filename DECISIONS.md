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

## 2026-10-11 — Assistant IA : l'écran dit ce qui part, et le montre

**Décision.** Cinq règles sur ce que reçoit un fournisseur, venues de l'issue #19 :

1. Le nom, le type et le stade du dossier ne partent que si « Identité du dossier » est cochée.
   L'identifiant interne du dossier ne part jamais.
2. Le nom d'un scénario ne part que si « Scénarios » est cochée. Les idées et le budget, qui citent
   leur scénario, emploient sinon un libellé neutre (« Scénario 1 »).
3. L'écran de l'assistant montre, avant l'envoi, le texte exact du contexte. Ce texte et celui que
   reçoit le fournisseur distant sont écrits par la même fonction (`serialiserContexte`).
4. L'écran et les documents ne promettent plus « jamais de nom ». Ils disent ce qui part : les
   noms, les textes et les montants saisis dans les sections cochées. Et ce qui ne part jamais :
   les fiches de personnes, les adresses, les fichiers.
5. Les noms libres (lieux, bâtiments, pièces, postes) ne sont pas remplacés par des libellés
   neutres. Ils portent le sens utile à l'assistant ; pour ne pas les transmettre, on décoche leur
   section (« Identité du dossier », « Lieux »…), et on relit le texte montré avant d'envoyer.

**Pourquoi.** L'écran annonçait « jamais de nom, d'adresse ni de fichier » alors que le nom du
dossier partait dans tous les cas, et les noms de lieux, de bâtiments et de scénarios selon les
sections. Un nom de dossier ou de lieu peut suffire à situer un projet. La règle « ne reçoit que
les sections cochées » avait deux exceptions non dites : le dossier, et le nom d'un scénario joint
aux idées et au budget.

**Conséquence.** Aucun champ de texte n'est filtré : un nom ou une adresse écrits dans un titre,
une description ou la question partent tels quels. L'écran le dit sous le texte montré.

**Ce qui n'est pas tranché.** Conserver avec chaque échange le texte exact transmis (seuls la
question, les sections et la réponse le sont aujourd'hui) ; la consigne envoyée au modèle distant,
qui dit encore « ni noms de personnes ».

## 2026-10-11 — Lieux : un bâtiment se crée dans son lieu, et peut en changer

**Décision.** Trois règles venues de l'issue #14 :

1. L'écran Lieux emboîte ce qui s'emboîte : un lieu contient ses bâtiments, un bâtiment contient
   ses pièces. Un bâtiment se crée dans la carte de son lieu.
2. Le lieu d'un bâtiment se modifie après coup (`rattacherBatiment`) : même droit qu'à la création
   (écrire les lieux), lieu du même dossier, trace au journal d'audit avec le lieu d'avant et celui
   d'après, sans motif.
3. Un bâtiment sans lieu reste permis. L'écran ne propose d'en créer un que tant que le dossier n'a
   aucun lieu. Dès qu'un lieu existe, les bâtiments sans lieu sont montrés à part, signalés, avec
   de quoi les rattacher.

**Pourquoi.** Lieux et bâtiments formaient deux listes l'une sous l'autre : rien ne montrait qu'un
bâtiment fait partie d'un lieu. Le champ « Lieu » d'un nouveau bâtiment valait « aucun » par
défaut, si bien qu'un bâtiment a été créé sans lieu pendant le test pilote, sans moyen de le
corriger depuis l'écran.

**Ce qui n'est pas tranché.** Détacher un bâtiment de tout lieu depuis l'écran ; corriger le nom,
le type ou l'état d'un lieu, d'un bâtiment ou d'une pièce, et les retirer (issue #22).

## 2026-10-11 — Provenance : deux questions en clair, un seul nom par origine

**Décision.** Quatre règles d'affichage venues de l'issue #15. Les deux axes du 2026-10-09 (source
et confiance) ne changent pas, ni leurs codes, ni les règles qui les lient.

1. Dans les formulaires, les deux champs sont des questions : « D'où vient cette information ? » et
   « En êtes-vous sûr ? ». Chaque choix est une réponse en clair (« Je l'ai saisie moi-même »,
   « Oui, c'est connu »).
2. Un seul nom par origine et par niveau de certitude, défini dans `src/domain/provenance.ts` :
   la pastille l'affiche, et la réponse proposée le reprend. Un test le vérifie.
3. Un document importé s'appelle « document importé », plus « pièce importée » : une pièce est
   aussi une salle. La saisie s'appelle « saisie ».
4. Sur l'écran Lieux, les deux questions n'apparaissent qu'une fois la valeur saisie.

**Pourquoi.** Retour du test pilote : « Source » et « Confiance » « ne me parlent pas trop », et
leurs choix par défaut (« si renseigné », « par défaut selon la source ») ne se comprenaient pas
sans connaître la règle. La pastille et la liste donnaient deux noms à la même origine (« saisie
utilisateur » et « Saisie manuelle », « pièce importée » et « Document importé »).

**Conséquence.** Les libellés des tables `ref_source_donnee` et `ref_confiance` ne sont plus
affichés : ces tables fournissent les codes proposés et leur ordre, le domaine fournit les mots.

**Ce qui n'est pas tranché.** Aligner les libellés de ces deux tables sur le domaine par une
migration, qui modifierait la base existante ; préremplir les deux réponses avec la provenance
actuelle quand on modifie une adresse ou une surface.

## 2026-10-11 — Lieux : un lieu, un bâtiment et une pièce se corrigent après leur création

**Décision.** Tranche le premier point laissé ouvert par l'entrée « un bâtiment se crée dans son
lieu » du même jour, pour l'issue #22.

1. Se corrigent depuis l'écran Lieux : le nom, le type, la parcelle et la description d'un lieu ;
   le nom, le type, l'état et les usages d'un bâtiment ; le nom et l'usage d'une pièce.
2. Une pièce posée dans le mauvais bâtiment se déplace dans un autre bâtiment du même dossier. Sa
   surface la suit.
3. Même droit qu'à la création (écrire les lieux), mêmes garde-fous : nom obligatoire, type de lieu
   connu, bâtiment du même dossier. Seuls les champs changés sont tracés au journal d'audit, avec la
   valeur d'avant et celle d'après ; aucun motif n'est demandé. Un champ facultatif vidé redevient
   inconnu.
4. L'adresse d'un lieu et la surface d'une pièce gardent leur propre formulaire : ce sont des
   valeurs à provenance, modifiées avec leur origine et un motif.

**Pourquoi.** Une faute de frappe dans un nom restait, et une pièce ajoutée au mauvais bâtiment y
restait : la seule façon de rattraper une saisie était de supprimer le dossier entier.

**Ce qui n'est pas tranché.** Retirer un lieu, un bâtiment ou une pièce : suppression ou mise à
l'écart, et sort de ce qui y est rattaché (le schéma prévoit déjà qu'un bâtiment supprimé emporte
ses pièces, et qu'un lieu supprimé laisse ses bâtiments sans lieu) ; les mêmes corrections sur une
idée, un scénario et un poste.

## 2026-10-11 — Lieux : un lieu, un bâtiment et une pièce ne se retirent que vides

**Décision.** Tranche le point « retirer » laissé ouvert par l'entrée précédente, pour l'issue #22.
Christophe a choisi entre trois options : supprimer seulement un objet vide (retenue), supprimer
l'objet avec ce qu'il contient, ou le mettre à l'écart comme une ligne de budget.

1. Retirer un lieu, un bâtiment ou une pièce est une suppression définitive, permise seulement quand
   l'objet est vide : aucun bâtiment ni document rattaché à un lieu ; aucune pièce, idée, poste de
   budget ni document rattaché à un bâtiment ; aucune idée ni document rattaché à une pièce.
2. Rien n'est emporté ni détaché en silence. Le schéma laisserait faire (un bâtiment supprimé
   emporte ses pièces ; idées, postes et documents perdent leur rattachement) : la règle est tenue
   dans `src/lib/structure.ts`. Le refus nomme ce qui est encore rattaché ; il n'apprend rien à
   personne, parce que les deux rôles qui écrivent les lieux lisent aussi les idées, le budget et
   les documents (un test le garde).
3. Même droit qu'à la création (écrire les lieux), sans motif ni nom à retaper : un objet vide ne
   coûte que sa propre saisie. Le retrait est tracé au journal d'audit, action « suppression », avec
   ce que l'objet contenait : chaque champ rempli, sa valeur d'avant, puis rien.
4. L'écran Lieux porte « Retirer » sur chaque carte. Pour un objet non vide, il affiche la phrase
   de refus à la place du bouton.

**Pourquoi.** Un objet créé pour essayer restait dans le dossier : la seule suppression était celle
du dossier entier. Supprimer un objet avec son contenu ferait payer cher une erreur de clic. La mise
à l'écart demandait une migration de la base, et de définir ce qu'un lieu écarté ne compte plus.

**Conséquences.** L'adresse d'un lieu retiré et la surface d'une pièce retirée restent lisibles au
journal d'audit jusqu'à la suppression du dossier, qui purge son journal (entrée du 2026-10-09). Une
idée, un poste de budget et un document se rattachent à leur création et ne se détachent pas
encore : un objet qui en porte ne peut donc être ni vidé ni retiré, et l'écran le dit.

**Ce qui n'est pas tranché.** Détacher ou déplacer une idée, un poste de budget ou un document ;
corriger une idée, un scénario et un poste (issue #22) ; retirer une idée, un scénario, un poste ou
une action.

## 2026-10-11 — Une idée, un scénario, un poste et un document se corrigent et se détachent

**Décision.** Suite de l'issue #22, après les lieux. Même règle que pour une action (2026-10-10) et
pour un lieu (2026-10-11) : même droit qu'à la création, un champ absent ne change pas, un champ
vidé redevient inconnu, seuls les champs changés sont tracés au journal d'audit, sans motif.

1. Idée : titre, description, et ses rattachements (scénario, bâtiment, pièce). Son statut garde
   son formulaire et son motif.
2. Scénario : nom et description. Une décision déjà prise garde le nom que le scénario, ou l'idée,
   portait : elle dit ce qui a été décidé avec les mots du moment, et n'est pas réécrite.
3. Poste de budget : nom, catégorie, bâtiment. Le nom reste unique dans son scénario ; les lignes
   du poste suivent son nouveau nom. Un poste ne change pas de scénario.
4. Document : type, date, note et rattachements (lieu, bâtiment, pièce, scénario, poste, idée,
   action). Le fichier ne change jamais : ni son nom d'origine, ni son contenu.
5. Un rattachement se pose, se change et se retire. Une liste (scénarios, bâtiments…) n'est
   proposée qu'à qui peut la lire ; sans elle, la correction ne touche pas au rattachement. La règle
   est tenue côté serveur : toucher à un rattachement demande de pouvoir lire la section de l'objet
   visé, et le refus est inscrit au journal. Elle vaut pour un document, un poste et une action,
   que des professionnels peuvent écrire ; qui écrit les idées lit déjà tout ce qu'elles visent.

**Pourquoi.** Ces objets ne se corrigeaient pas (issue #22), et un bâtiment ou une pièce qui portait
une idée, un poste ou un document ne pouvait être ni vidé ni retiré (entrée précédente). Un document
déposé sans scénario ne pouvait pas non plus alimenter le budget.

**Conséquences.** Lève la limite notée dans l'entrée précédente. Trois garde-fous qui manquaient
sont ajoutés au passage : le bâtiment d'un poste doit appartenir au même dossier, dès la création ;
un type de document inconnu est refusé par un message, dès le dépôt ; corriger le scénario d'une
action demande de pouvoir lire les scénarios (correction livrée le 2026-10-10, contrôle ajouté ici).

**Ce qui n'est pas tranché.** Retirer une idée, un scénario, un poste, un document ou une action ;
changer un poste de scénario ; rattacher une idée à une pièce depuis l'écran (la fonction le permet,
aucun formulaire ne le propose, ni à la création ni à la correction).
