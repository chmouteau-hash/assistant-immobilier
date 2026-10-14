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

## 2026-10-11 — Professionnel : le budget se lit sans les scénarios, sous un libellé neutre

**Décision.** Vient de l'issue #27. Christophe a choisi entre trois options : rendre le budget
lisible sans le nom des scénarios (retenue), exiger « Scénarios » avec « Budget », ou seulement
corriger le message.

1. Un écran ne dépend pas d'une section voisine pour dire vrai. Ce qui existe sans être lisible est
   désigné par un libellé neutre, ou tu ; l'écran n'écrit jamais « aucun » ni « ? » à sa place.
2. Le budget et les idées citent leur scénario. Qui ne lit pas les scénarios les voit sous
   « Scénario 1 », « Scénario 2 », dans l'ordre de création et sans statut. C'est la règle 2 de
   l'assistant (entrée « l'écran dit ce qui part » du même jour), appliquée à une personne par la
   même fonction.
3. Avec le seul périmètre « Budget », un professionnel lit les postes, les lignes et les totaux,
   ajoute un poste et dépose un montant. L'onglet Scénarios lui reste fermé : ni nom, ni
   description, ni hypothèse, ni décision.
4. Un bâtiment cité par une idée ou un poste n'est montré qu'à qui lit les lieux ; le lien d'une
   ligne de budget vers son document, qu'à qui lit les documents.

**Pourquoi.** Avec « Budget » seul, l'écran Budget était vide et disait « créez d'abord un
scénario » : c'était faux, et le professionnel ne pouvait rien déposer alors que l'écran Personnes
annonce qu'il « dépose des documents et des montants ». L'écran Idées écrivait « Scénario : aucun »
pour une idée rattachée. Exiger « Scénarios » aurait montré les motifs des décisions à un
professionnel invité pour un devis.

**Conséquences.** Le nombre de scénarios du dossier est visible de qui lit le budget ou les idées.
Le périmètre reste réglé par section : qui a « Budget » voit tous les postes et tous les montants,
y compris les devis d'autres fournisseurs. Pour recevoir un devis sans ouvrir le budget, le
périmètre « Documents » suffit : le professionnel dépose sa pièce et propose ce qu'il y lit, puis
le propriétaire la classe dans un scénario et la valide (un test le garde).

**Ce qui n'est pas tranché.** Un périmètre plus fin que la section (un poste, un scénario) ; la
liste des documents, qui dit « scénario » ou « poste budgétaire » sans numéro quand le nom n'est
pas lisible.

## 2026-10-11 — Un seul scénario : rien n'est dit de la comparaison

**Décision.** Vient de l'issue #42, relevée en jouant le parcours « chambre à refaire ». Christophe a
retenu la proposition qui lui était faite.

1. Tant qu'un dossier a moins de deux scénarios, l'application ne dit rien de la comparaison : ni
   réserve sur la vue d'ensemble, ni section « Comparaison » dans l'onglet Scénarios. Cela ne dépend
   que du nombre de scénarios, pas du type de projet ni du stade.
2. L'assistant en règles locales ne suggère plus de créer un second scénario à un dossier de type
   « Travaux ciblés ». Pour les autres types, la suggestion reste.

**Pourquoi.** Avec un seul scénario, la vue d'ensemble écrivait « Il faut au moins deux scénarios
pour comparer » dans la couleur des avertissements ; sur un dossier neuf, cette phrase suivait « un
dossier simple (une chambre à refaire) peut n'en avoir qu'un ». L'onglet Scénarios s'ouvrait sur la
même phrase, et l'assistant suggérait un second scénario. Le parcours passait, mais l'écran laissait
croire à un manque.

**Conséquences.** L'assistant ne connaît le type de projet que si « Identité du dossier » fait
partie des sections transmises (règle 1 de l'entrée « l'écran dit ce qui part ») : sans elle, il
suggère encore un second scénario. La vue d'ensemble ne compte pas les scénarios écartés, l'onglet
Scénarios les compte : un dossier dont il ne reste qu'un scénario non écarté ne montre plus de
réserve sur la vue d'ensemble, et garde son tableau de comparaison dans l'onglet.

**Ce qui n'est pas tranché.** Mettre en avant ou reléguer d'autres éléments selon le stade ou le
type de projet (bloc 4 de l'issue #3) ; la phrase de l'écran Lieux qui parle de recherche à un
dossier de travaux (issue #43).

## 2026-10-11 — Budget : un poste se solde à la main, l'estimation tient lieu de montant prévu

**Décision.** Tranche les deux points laissés ouverts par l'entrée du 2026-10-10 « une facture
partielle ne fait pas baisser le total », pour le bloc 2 de l'issue #4. Christophe a choisi entre
les options qui lui étaient soumises.

1. Un poste devient « soldé » à la main, depuis l'écran Budget, avec un motif obligatoire. Il se
   rouvre de la même façon. L'application ne le déduit jamais : elle ne peut pas savoir qu'aucune
   facture n'arrivera plus, et une règle automatique (soldé quand le facturé atteint le devis) ne
   solderait jamais un poste dont la facture finale est inférieure au devis.
2. Le montant prévu d'un poste est sa nature la plus engageante avant la facture : l'engagement,
   sinon le devis, sinon l'estimation. Un poste facturé qui n'a qu'une estimation suit donc la règle
   commune : tant qu'il n'est pas soldé, sa référence est le plus élevé entre l'estimation et le
   total facturé, et elle reste signalée « estimation ».
3. Un poste ne se solde que s'il porte au moins une facture retenue. Solder et rouvrir demandent le
   droit d'écrire le budget, et sont tracés au journal d'audit avec leur motif.
4. Un poste soldé n'accepte plus de facture, qu'elle soit saisie, issue d'un document validé ou
   obtenue en modifiant une ligne : il faut d'abord le rouvrir. Les autres natures restent permises
   (un paiement règle les factures reçues), et une facture déjà saisie se corrige ou s'écarte.

**Pourquoi.** Pendant le test pilote, sur des données fictives, un poste devisé à 10 000 € est tombé
à 3 000 € à sa première facture, et un poste estimé à 18 000 € à 4 200 € : le total du scénario
baissait alors que le reste était à venir (commentaire de l'issue #4). Refuser une facture sur un
poste soldé évite que la mention « plus aucune facture attendue » soit contredite en silence.

**Conséquences.** Migration 004 : colonne `solde` sur `poste_budget`, 0 ou 1, contrôlée en base.
Quand un engagement et un devis coexistent, l'engagement tient lieu de montant prévu, même s'il est
inférieur au devis : c'est la hiérarchie du 2026-10-09. Dès que le total facturé atteint le montant
prévu, il devient la référence sans que le poste soit soldé. L'assistant lit les mêmes montants de
référence que l'écran Budget.

**Ce qui n'est pas tranché.** Afficher l'engagement et les sous-totaux par nature (bloc 2 de
l'issue #4) ; signaler à l'écran un poste « facturé en partie » ; solder plusieurs postes d'un coup,
ou tout un scénario à la clôture (bloc 4 de l'issue #4).

## 2026-10-11 — Lieux : une carte des lieux, avec deux services publics (fond de carte, adresses)

**Décision.** Christophe a demandé une carte « comme Google Maps » pour voir où sont les biens à
l'étude. Il a choisi entre les options qui lui étaient soumises. Cette entrée précise celle du
2026-10-01 (« les données du dossier immobilier ne quittent pas le PC ») : le dossier reste dans la
base locale, et deux sorties limitées sont ouvertes, listées au point 5.

1. Fond de carte libre plutôt que Google Maps : la bibliothèque Leaflet (open source, sans clé ni
   compte), servie par l'application, et le fond « Plan IGN » de la Géoplateforme. Google Maps
   demandait un compte Google Cloud avec carte bancaire et une clé visible dans le navigateur.
2. Un lieu peut porter une position (latitude, longitude). C'est une valeur tracée comme l'adresse :
   source, confiance, « à renseigner » tant qu'elle n'est pas connue. Elle se stocke en microdegrés
   entiers (millionièmes de degré, environ 11 cm) : pas de virgule flottante.
3. La position s'obtient de trois façons. D'après l'adresse, par la Base Adresse Nationale, sur le
   bouton « Situer d'après l'adresse » : elle entre « source externe · à confirmer », avec l'adresse
   telle que le service l'a comprise. En déplaçant le repère sur la carte. En saisissant les deux
   coordonnées. Dans les deux derniers cas, les deux questions de provenance sont posées.
4. La carte s'affiche dans l'écran Lieux de chaque dossier, avec un repère par lieu situé. Il n'y
   a pas de carte tous dossiers confondus.
5. Ce qui sort du PC, et quand :
   - l'adresse du lieu, et elle seule (ni nom de lieu, ni nom de dossier), vers `data.geopf.fr`,
     uniquement au clic sur « Situer d'après l'adresse », après contrôle du droit d'écrire les
     lieux ; l'écran le dit avant le clic ;
   - les demandes de tuiles du fond de carte, vers `data.geopf.fr`, quand s'affiche l'écran Lieux
     d'un dossier dont au moins un lieu est situé : le service voit l'adresse IP du poste et la zone
     regardée, donc à peu près où est le bien. Tant qu'aucun lieu n'est situé, rien ne part.
6. La position ne part jamais vers l'assistant IA, comme l'adresse.

**Pourquoi.** Une liste d'adresses ne montre pas où sont les biens les uns par rapport aux autres.
Les deux services retenus sont publics, sans compte ni clé à protéger, et le géocodage n'est jamais
automatique : c'est le plus petit écart au principe du 2026-10-01 qui donne quand même une carte.
Une position calculée par un service n'est pas un fait : elle entre « à confirmer », et c'est en
regardant le repère que l'utilisateur la confirme ou la déplace.

**Conséquences.** Migration 005 : cinq colonnes sur `lieu` (latitude et longitude en microdegrés,
source, confiance, note), avec les mêmes contrôles en base que l'adresse. Deux dépendances :
`leaflet` et, pour le développement, `@types/leaflet`. Sans réseau, l'application fonctionne : les
repères s'affichent sur un fond gris avec une phrase qui le dit, et le géocodage répond que le
service ne répond pas, sans rien écrire. La position figure dans l'export du dossier et dans le
journal d'audit (avant/après à chaque changement, et à la suppression du lieu). La checklist de
`docs/05-securite-rgpd.md` porte une ligne « Carte et adresses ».

**Ce qui n'est pas tranché.** Les conditions d'utilisation des deux services et la durée de
conservation de leurs journaux n'ont pas été lues [À vérifier] ; seul leur fonctionnement sans clé a
été essayé, le 2026-10-11. Une carte tous dossiers confondus, qui demande une règle de droits
nouvelle. Les biens hors de France : la Base Adresse Nationale ne couvre que la France, la position
à la main reste possible. Un autre fond (OpenStreetMap, vue aérienne). Un réglage qui couperait la
carte pour un dossier. La description de l'application dans `layout.tsx` dit encore « sans serveur
distant ».

## 2026-10-11 — Carte des lieux : chercher par code postal, situer un lieu en cliquant

**Décision.** Vient de l'issue #48, relevée par Christophe à son premier essai de la carte. Il a
choisi entre les options qui lui étaient soumises. Cette entrée complète le point 5 de la
précédente : deux sorties de plus, vers le même service d'adresses.

1. Un endroit se cherche par un code postal, une commune ou une adresse, sans que le lieu ait une
   adresse. Le service répond rarement par un seul endroit : l'écran propose la liste, et c'est en
   choisissant un endroit que la position s'enregistre, « source externe · à confirmer », avec le
   nom de l'endroit en note. Un code postal seul donne toutes ses communes, par ordre alphabétique.
   Un texte sans chiffre donne d'abord les communes de ce nom.
2. Un lieu se situe en cliquant sur la carte. Ce mode s'ouvre depuis la fiche du lieu, pour un lieu
   à la fois : sans lui, un clic sur la carte ne pose rien.
3. Après le clic, l'écran montre la position et l'adresse connue la plus proche, avec sa distance,
   avant d'écrire quoi que ce soit. Un seul bouton enregistre. Option retenue contre
   l'enregistrement dès le clic. La position passe par les deux questions de provenance ; l'adresse,
   si elle est gardée, entre « source externe · à confirmer ».
4. Une adresse déjà saisie n'est jamais remplacée d'office. Option retenue contre le remplacement à
   chaque clic. La case qui garde l'adresse trouvée n'est cochée d'avance que si le lieu n'en a pas.
5. Ce qui sort du PC en plus, toujours vers `data.geopf.fr` et après contrôle du droit d'écrire les
   lieux : le texte cherché, au clic sur « Chercher » ; le point cliqué, en mode « Choisir l'endroit
   sur la carte », puis une seconde fois à l'enregistrement si l'adresse est gardée. L'écran le dit
   avant, dans les deux cas. La carte, donc ses tuiles, se charge aussi quand ce mode est ouvert
   dans un dossier sans lieu situé.

**Pourquoi.** En recherche d'un bien, on connaît une commune ou un code postal avant une adresse :
sans recherche, il fallait taper des coordonnées. L'adresse la plus proche d'un point n'est pas
forcément celle du bien, et c'est parfois celle d'un voisin. La montrer avant de l'écrire, puis la
redemander au service au moment d'écrire, garantit que ce qui entre comme venant du service en
vient, et a été vu.

**Conséquences.** Pas de migration. `lib/geocodage.ts` porte les trois usages du service, et
`domain/geo.ts` lit ses réponses. Nouveau composant client `RechercheEndroit` ; `CarteLieux` reçoit
le mode « choisir l'endroit », ouvert par le paramètre `placer` de l'adresse de la page. Loin de
toute adresse, le service ne renvoie rien : seule la position s'enregistre alors.
`ASSISTANT_GEOCODAGE_URL` désigne la recherche ; la recherche inverse s'en déduit.

**Ce qui n'est pas tranché.** « Situer d'après l'adresse » garde son comportement : la première
réponse du service, sans liste. Le point que le service attribue à une commune (mairie, centre)
n'a pas été vérifié. Les biens hors de France restent hors du service. Les conditions
d'utilisation restent [À vérifier].

## 2026-10-11 — Carte des lieux : les biens des autres dossiers

**Décision.** Vient de l'issue #50. Christophe a choisi entre les options qui lui étaient soumises.
Cette entrée renverse un point de l'entrée « une carte des lieux » du même jour, qui écartait une
carte tous dossiers confondus (son point 4, et « ce qui n'est pas tranché »).

1. La carte d'un dossier montre aussi les lieux situés des autres dossiers, d'une autre couleur :
   foncés pour le dossier ouvert, bleus pour les autres, avec le nom du lieu et celui de son
   dossier. Une légende le dit.
2. Règle de droits : l'acteur n'y trouve rien de plus que ce qu'il lirait en ouvrant chaque dossier.
   Seuls comptent les dossiers auxquels il participe encore et dont il peut lire la section
   « lieux ». Un dossier qu'il ne lit pas n'apparaît pas, sans trace de son existence, et ne pas le
   lire n'est pas journalisé comme un refus. De chaque lieu voisin, la carte ne reçoit que son nom,
   sa position et le nom de son dossier, que tout participant voit déjà dans l'en-tête.
3. Un clic sur un repère mène à la fiche du lieu dans l'écran Lieux : plus bas dans la page pour un
   lieu du dossier, dans son dossier pour un autre. Option retenue contre la vue d'ensemble du
   dossier. Entrée et Espace font de même au clavier. Un repère d'un autre dossier ne se déplace
   pas d'ici.
4. La carte s'ouvre sur le dossier et son secteur : un bien d'un autre dossier n'élargit le cadre
   que s'il est à moins de 30 km d'un lieu du dossier. Les biens plus lointains sont sur la carte
   aussi, et une phrase les compte.
5. La carte n'apparaît toujours que si le dossier ouvert a un lieu situé, ou en mode « choisir
   l'endroit ».

**Pourquoi.** En recherche, on étudie plusieurs biens d'un même secteur, souvent un dossier par
bien : les voir ensemble est le cœur de la comparaison. Le seuil de 30 km évite qu'un bien lointain
fasse dézoomer la carte jusqu'à perdre le quartier de vue.

**Conséquences.** `listerLieuxVoisins` dans `lib/structure.ts` ; chaque fiche de lieu porte une
ancre. La checklist de `docs/05-securite-rgpd.md` est précisée : un dossier ne montre d'un autre
que ce que l'acteur peut déjà y lire. Les tuiles demandées couvrent la zone de tous les biens
affichés, pas seulement ceux du dossier. L'assistant IA n'est pas concerné : son contexte reste
celui du dossier ouvert. Pas de migration.

**Ce qui n'est pas tranché.** Une carte sur « Mes dossiers ». Un réglage du seuil de 30 km. Les
étiquettes de deux biens très proches se chevauchent à petite échelle. Un dossier sans lieu situé
n'affiche pas la carte, même si d'autres dossiers ont des biens dans le secteur.

## 2026-10-12 — Lieux : le code postal et la ville ont leur champ, la recherche reste visible

**Décision.** Vient de l'issue #52. Christophe ne trouvait ni case pour le code postal, ni case
pour la ville, ni le champ de recherche livré la veille. Il a demandé les deux, et choisi où
montrer la recherche. Cette entrée précise le point 5 de l'entrée « une carte des lieux » et le
point 4 de l'entrée « chercher par code postal », toutes deux du 2026-10-11.

1. L'adresse d'un lieu tient en trois champs : la voie, le code postal et la ville. Le code postal
   est français, cinq chiffres. L'un des deux peut manquer.
2. Le code postal et la ville forment une valeur tracée à part de la voie, avec sa source et sa
   confiance : on connaît souvent la commune avant l'adresse. Le formulaire ne pose les deux
   questions de provenance qu'une fois : la réponse vaut pour toutes les parties qu'il écrit.
3. Le champ de recherche d'un endroit est visible sur chaque fiche de lieu, que le lieu soit situé
   ou non. Option retenue contre un bloc ouvert seulement tant que le lieu n'est pas situé. Les
   autres façons de situer un lieu restent repliées, sous « Situer sur la carte autrement ».
4. Sous la liste des endroits trouvés, une case propose d'enregistrer aussi l'adresse de l'endroit
   choisi. Elle n'est cochée d'avance que si le lieu n'a encore ni voie, ni code postal, ni ville.
   C'est la règle du 2026-10-11 pour le clic sur la carte, étendue à la liste : Claude l'a annoncé
   à Christophe avant de le réaliser, sans lui poser de nouvelle question.
5. Ce que le service rend va dans le bon champ : la voie, le code postal, la ville. Une partie
   qu'il ne donne pas n'est pas touchée : une commune choisie complète une voie saisie sans
   l'effacer.
6. « Situer d'après l'adresse » envoie ce qui est renseigné des trois champs, et fonctionne sans
   voie. Quand plusieurs communes conviennent, aucune n'est choisie : un code postal seul qui en
   couvre plusieurs, ou une ville dont plusieurs communes portent le nom. L'écran demande alors
   de préciser, ou de passer par la recherche.
7. Les adresses déjà saisies ne sont pas découpées : elles restent entières dans le champ de la
   voie. Les découper serait deviner.

**Pourquoi.** En recherche d'un bien, une annonce donne une commune avant une adresse. Jusqu'ici,
une commune connue ne pouvait s'écrire que dans le champ de l'adresse, qui restait sinon « à
renseigner ». Et un champ de recherche replié ne se trouve pas : celui qui l'avait demandé ne l'a
pas vu.

**Conséquences.** Migration 006 : `code_postal`, `ville`, `commune_source` et
`commune_confiance` sur `lieu`. La commune ne peut pas partager la provenance de l'adresse : la
contrainte de la migration 002 interdit toute source tant que `adresse` est vide, et une
contrainte SQLite ne se modifie pas sans reconstruire la table. Les règles sont dans
`domain/geo.ts` (`lireCommune`, `demandeDepuisAdresse`, `communeDesignee`). L'endroit choisi
dans la liste passe par `situerLieuSurEndroit` (`lib/geocodage.ts`), qui pose la provenance côté
serveur : le formulaire ne la porte plus. Rien de nouveau ne sort du PC : « Situer d'après
l'adresse » envoie le code postal et la ville avec la voie, vers le même service. Le code postal
et la ville ne partent pas vers l'IA.

**Ce qui n'est pas tranché.** Un bien hors de France n'a pas de champ pour son code postal : tout
va dans l'adresse. Rien n'aide à ranger une adresse déjà saisie dans les trois champs. Avec une
voie, « Situer d'après l'adresse » garde la première réponse du service, sans liste. Corriger une
seule partie par le formulaire redonne sa provenance à toutes les parties qu'il écrit. Pour
l'assistant, un lieu dont on ne connaît que la commune reste « sans adresse renseignée » : il ne
regarde que la voie.

## 2026-10-12 — Lieux : ils se retrouvent dans la vue d'ensemble et dans « Mes dossiers »

**Décision.** Vient de l'issue #54. Christophe a enregistré un lieu et ne l'a retrouvé ni dans la
vue d'ensemble du dossier, ni dans « Mes dossiers » : aucun de ces deux écrans ne montrait de
lieu. Il a choisi entre les options qui lui étaient soumises.

1. La vue d'ensemble d'un dossier a une section « Lieux », sous l'identité du dossier : pour
   chaque lieu, son nom, son type, son adresse sur une ligne, s'il est situé ou non, et un lien
   vers sa fiche. Option retenue contre un simple compteur, et contre la liste accompagnée de la
   carte.
2. La carte n'est pas montrée dans la vue d'ensemble : le fond de carte reste demandé au réseau
   dans le seul écran Lieux. La règle « la carte ne fait rien sortir sans un geste » est inchangée.
3. « Mes dossiers » montre, sous chaque dossier, le nom de ses lieux, suivi de leur code postal et
   de leur ville quand ils sont connus. Option retenue contre le seul nombre de lieux.
4. Règle de droits, la même que pour les biens voisins sur la carte : un acteur n'y trouve rien de
   plus que ce qu'il lirait en ouvrant chaque dossier. Sans le droit de lire la section « lieux »,
   la vue d'ensemble n'a pas de section « Lieux », et « Mes dossiers » ne dit rien des lieux de ce
   dossier : ni liste, ni « aucun lieu », qui serait faux.
5. L'adresse d'un résumé tient sur une ligne, sans les pastilles de provenance de la fiche. Une
   seule réserve la suit quand une partie n'est pas « connue » : « à confirmer », qui l'emporte,
   ou « estimé ». Dans « Mes dossiers », la commune est donnée sans réserve : c'est un repère pour
   retrouver un bien, la provenance se lit dans la fiche.

**Pourquoi.** En recherche d'un bien, le lieu est ce qu'on veut retrouver en premier. Il fallait
ouvrir le dossier, puis l'onglet Lieux : un lieu fraîchement enregistré semblait perdu.

**Conséquences.** `listerLieuxParDossier` dans `lib/structure.ts`, qui lit les droits avec
`autorise` : un dossier dont l'acteur ne lit pas les lieux est absent de son résultat, et ne pas
les lire n'est pas journalisé comme un refus. `reserveDeConfiance` dans `domain/provenance.ts`.
Pas de migration, rien de nouveau ne sort du PC.

**Ce qui n'est pas tranché.** La section « Lieux » vient après le bloc « Identité du dossier » et
son formulaire : sur un petit écran, il faut descendre pour la voir. Les bâtiments et les pièces
ne sont pas résumés dans la vue d'ensemble. Un dossier aux nombreux lieux allonge sa ligne dans
« Mes dossiers » : rien ne la coupe.

## 2026-10-12 — Issues : une étiquette `à-tester`, et une issue ne se ferme qu'essayée

**Décision.** Le dépôt prend une étiquette d'avancement, une seule : `à-tester`, reprise
d'Ergonomia. Elle dit qu'un travail est fusionné et attend l'essai de Christophe. Elle renverse la
règle écrite le 2026-10-10 dans `AGENTS.md` (« pas d'étiquette d'avancement : les cases à cocher le
disent déjà »), qui n'avait pas d'entrée dans ce journal.

1. Une PR ne ferme plus l'issue qu'elle livre : elle la cite (`Réf. #N`), sans mot-clé de
   fermeture (`Closes`, `Fixes`).
2. À la fusion, l'issue reste ouverte et reçoit `à-tester`.
3. Christophe essaie dans son usage. Sur son accord, les cases « Résultat attendu » se cochent,
   l'étiquette se retire, et l'issue se ferme s'il ne lui reste rien à réaliser.
4. Les autres étapes d'Ergonomia ne sont pas reprises : ni `en attente de PR`, ni `à clôturer`, ni
   `livré`, ni rappel automatique.

**Pourquoi.** Les cases ne se lisent qu'en ouvrant l'issue, et une issue fermée sort de la liste.
Le 2026-10-12, quatre retours (#48, #50, #52, #54) étaient fermés par leur PR (`Closes`), toutes
leurs cases « Résultat attendu » vides : neuf points à essayer, visibles nulle part. Une case
« Reste à réaliser » cochée dit « fusionné » ; rien ne disait « essayé ». Sur Ergonomia, c'est
cette étiquette qui montre à Christophe ses essais à faire.

**Conséquences.** `AGENTS.md` décrit l'étiquette et son trajet. Les issues #48, #50, #52 et #54
sont rouvertes avec `à-tester`. Rien ne change dans l'application.

**Ce qui n'est pas tranché.** Sur une issue livrée en plusieurs PR (#1 à #5), l'étiquette dit
seulement qu'un point est à essayer : un commentaire dit lequel, rien de plus structuré. Aucun
rappel si une issue reste longtemps en `à-tester`.

## 2026-10-12 — Storybook : un atelier des composants, qui ne sert ni n'envoie rien

**Décision.** Christophe a demandé Storybook : un atelier, lancé par `npm run storybook`, qui
affiche chaque composant de `src/components` seul, dans ses différents états, sans lancer
l'application ni ouvrir la base. Les réglages qui suivent lui ont été proposés avec la PR.

1. Storybook 10, avec `@storybook/nextjs-vite` et une seule extension, `@storybook/addon-docs`.
   Installé à la main : l'assistant d'installation ajoute des exemples, une extension de
   publication chez l'éditeur et une configuration de tests qui modifie celle de `vitest`.
2. Une histoire par état, à côté du composant (`*.stories.tsx`), en français, avec des données
   fictives.
3. Une histoire n'écrit rien et n'appelle aucun service. Les Server Actions y sont des doublures,
   qui montrent dans l'onglet « Actions » ce qu'un formulaire a envoyé.
4. Storybook n'écoute que sur le PC (`--host 127.0.0.1`), et son serveur refuse les données
   privées (`DONNEES_PRIVEES` dans `.storybook/main.ts`).
5. Rien ne part vers l'éditeur de Storybook : ni statistiques d'usage, ni recherche de nouveautés
   ou de mise à jour. Son guide de démarrage, qui propose de publier l'atelier, est retiré.
6. La CI ne construit pas Storybook.

**Pourquoi.** Un état difficile à provoquer dans l'application (un formulaire refusé, un service
d'adresses muet, une lecture seule) se voit ici sans préparer un dossier. Les points 4 et 5
viennent d'un essai du 2026-10-12, sur une copie du dépôt et avec des fichiers factices. Laissé à
ses réglages d'origine, Storybook écoutait sur toutes les interfaces du PC, et son serveur rendait
`data/dossier.sqlite`, un fichier de `data/fichiers/` et une sauvegarde à qui les demandait, y
compris par l'adresse réseau du PC. Avec les deux verrous, les mêmes demandes sont refusées et
l'adresse réseau ne répond plus.

**Conséquences.** Le dossier `.storybook/` (réglages, doublures), neuf fichiers d'histoires, deux
scripts dans `package.json`, un test qui échoue si un verrou disparaît
(`tests/outillage/storybook.test.ts`). `storybook-static/` est ignoré par git et par ESLint ;
`.storybook/` est contrôlé par TypeScript. Les histoires de la carte demandent les tuiles du fond
de carte (décision du 2026-10-11) : elles viennent en dernier dans le menu et n'ont pas de page
« Docs ». La checklist de `docs/05-securite-rgpd.md` a une ligne pour l'atelier. Pas de migration.

**Ce qui n'est pas tranché.** La CI ne vérifie pas que Storybook se construit : `typecheck` et
`lint` couvrent les histoires, mais un import qui casse l'atelier ne se verrait qu'à son
lancement. Les pages de `src/app` n'ont pas d'histoire : elles lisent la base. L'interface de
Storybook est en anglais. Ni contrôle d'accessibilité, ni tests joués depuis les histoires : ces
extensions ne sont pas installées.

## 2026-10-12 — Police : aucune n'est téléchargée, l'application prend celles du poste

**Décision.** Christophe a demandé de retirer le chargement de la police Geist, après un relevé de
la charte graphique et une mesure faite le même jour.

1. L'application ne télécharge aucune police. Le texte s'affiche en Arial, à défaut dans la police
   sans empattement du poste ; le texte à chasse fixe, dans celle du poste.
2. La police se déclare à un seul endroit : le thème de Tailwind, dans `src/app/globals.css`
   (`--font-sans`). La règle `body` qui la fixait hors couche est retirée.
3. `next/font/google` n'est plus importé nulle part.

**Pourquoi.** `layout.tsx` chargeait Geist et Geist Mono par `next/font/google` depuis le premier
commit : le modèle de départ de Next.js, pas un choix. Mesuré le 2026-10-12 sur une copie du dépôt,
en relevant les connexions du serveur de développement : au démarrage, rien ne part ; à la première
page compilée sans cache (`.next/` absent), le serveur ouvre deux connexions vers Google
(`fonts.googleapis.com`, `fonts.gstatic.com`) et écrit onze fichiers de police ; à la relance,
cache présent, aucune. Le navigateur, lui, ne demandait rien à Google : Next.js lui sert ces
fichiers. Ce service externe n'avait ni entrée dans ce journal ni ligne dans la checklist de
`docs/05-securite-rgpd.md`, alors que l'accueil affiche « rien n'est envoyé ailleurs ». Et Geist ne
s'affichait pas : la règle `body` de `globals.css`, écrite hors couche, imposait Arial à tout le
texte, contre le commentaire du même fichier (« Pas de règle `body` ici »). Seul le texte à chasse
fixe était en Geist Mono. Retirer la police supprime la sortie au lieu de la documenter.

**Conséquences.** `src/app/layout.tsx` et `src/app/globals.css`. Mesuré après la modification, sur
la même copie : sans cache, ni le serveur de développement ni `npm run build` n'ouvrent de
connexion sortante, et aucun fichier de police n'est écrit. À l'écran, l'accueil est identique
(mêmes polices rendues, mêmes largeurs de texte), sauf le texte à chasse fixe, qui passe de Geist
Mono à la police à chasse fixe du poste (Consolas sous Windows) : mesuré sur le mot `data/` de
l'accueil ; l'aperçu du texte envoyé à l'assistant suit la même règle. Le navigateur ne charge plus
les deux fichiers de police de l'application à chaque page. Pas de migration.

**Ce qui n'est pas tranché.** Aucun test n'empêche `next/font/google` de revenir. Les statistiques
d'usage de Next.js ne sont pas désactivées sur le PC (réglage d'origine) : d'après son code, un
événement part vers `telemetry.nextjs.org` à l'arrêt du serveur de développement ; lu, pas mesuré.
Si l'application prend un jour une police à elle, ses fichiers se rangent dans le dépôt
(`next/font/local`), sans téléchargement.

## 2026-10-12 — Charte graphique : l'existant est nommé, quatre choix sont faits

**Décision.** Christophe a demandé un relevé de l'apparence de l'application qui ne change rien au
rendu, puis a tranché quatre points le même jour.

1. Le dossier `charte-graphique/` décrit l'existant : `CHARTE.md` (rôles, valeurs, règles d'usage,
   contrastes) et `jetons.md` (pour chaque rôle, la classe Tailwind qui le tient aujourd'hui). Ses
   noms sont en français, comme le reste du dépôt.
2. Arial reste la police de l'application : la décision du même jour sur la police est confirmée.
3. L'application aura une couleur d'accent : une teinte réservée à l'action à faire.
4. Le texte garde deux niveaux sous le texte secondaire, « aide » et « discret ». Chacun atteint
   4,5:1 avec son fond.
5. La bordure d'un champ de saisie se fonce jusqu'à atteindre 3:1 avec son fond.

**Pourquoi.** Le relevé du 2026-10-12 (commit `22d2300`) compte 43 classes de couleur de Tailwind,
écrites 254 fois dans les pages et les composants, et aucun jeton de couleur : changer une teinte
demande aujourd'hui de la chercher partout. Deux écarts au niveau AA de WCAG 2.2 y sont calculés.
`text-neutral-400`, employé 14 fois sur du texte, atteint 2,36:1 à 2,58:1 pour 4,5:1 demandé. La
bordure des champs (`border-neutral-300` sur blanc) atteint 1,48:1 pour 3:1 demandé. Aucune teinte
ne signale l'action à faire : le bouton principal est un contour gris foncé.

**Conséquences.** Deux fichiers de documentation. Aucune page, aucun composant, aucune feuille de
style n'est modifié : les points 3 à 5 sont décidés, pas appliqués, et l'écran d'aujourd'hui garde
ses écarts de contraste. Pas de migration.

**Ce qui n'est pas tranché.** La teinte de la couleur d'accent, et ce qu'elle marque : le bouton
principal seul, ou aussi les liens et l'onglet courant. La façon de tenir les deux niveaux de
texte : sur le fond de page, `neutral-500` est déjà le gris le plus clair qui atteint 4,5:1, donc
le niveau « discret » ne peut pas être plus clair que le niveau « aide » d'aujourd'hui. La valeur
de la bordure des champs : dans la palette de Tailwind, `neutral-500` atteint 3:1, `neutral-400`
non. Les quatre interdits proposés au § 7 de la charte. Le public que vise la charte : « des
professionnels » dans la demande, « un particulier » dans `docs/01-cadrage.md`. Les autres écarts
de contraste relevés au § 8 de la charte n'ont pas de décision. `README.md` et `docs/` ne citent
pas encore la charte. Rien n'a été vérifié à l'écran : les ratios sont calculés à partir du code.

## 2026-10-14 — CI : deux contrôles propres au projet, aucun déploiement

**Décision.** Christophe a demandé une CI-CD propre à la technologie du projet. La CI existait
déjà (`typecheck`, `lint`, `test`, `build`). Les réglages qui suivent lui ont été proposés avec
la PR.

1. Une migration déjà livrée ne change plus, et la CI le vérifie.
   `scripts/controle-migrations.mjs` compare le dossier des migrations à ce qu'il était au commit
   de départ : sur une PR, le `main` qu'elle vise ; sur `main`, le commit d'avant le push. Un
   fichier ajouté passe ; un fichier modifié, renommé ou retiré arrête la CI.
2. La CI construit Storybook (`npm run build-storybook`). Le point 6 de l'entrée « Storybook » du
   2026-10-12 est renversé.
3. Le jeton d'accès que GitHub remet aux étapes de la CI ne sert qu'à lire le dépôt, et une
   vérification s'arrête au bout de 15 minutes.
4. Aucun déploiement automatique. L'application ne tourne que sur le PC : une version y arrive par
   le `git pull` de `main`, aux conditions du `CLAUDE.md` (accord de Christophe et serveur arrêté
   quand la PR apporte une migration).

**Pourquoi.** Point 1 : une migration s'applique une seule fois à la base réelle. Si son fichier
change ensuite, la base réelle garde l'ancien schéma, et les tests, qui repartent d'une base
neuve, passent sur le nouveau. Essayé le 2026-10-12 sur une copie du dépôt : une ligne ajoutée à
`003_statut_ligne.sql` laisse verts les tests de la base, et le contrôle s'arrête. La règle était
écrite (`client.ts`, `CLAUDE.md`) sans rien pour la tenir. Point 2 : un import qui casse l'atelier
ne se voyait qu'à son lancement ; la construction prend 13 secondes sur le PC. Point 3 : le dépôt
est public. Son réglage donne déjà un jeton en lecture seule (lu le 2026-10-12) ; l'écrire dans
`ci.yml` le fait tenir si ce réglage change. Point 4 : déployer suppose une machine qui reçoit la
version. Un hébergeur contredit la décision du 2026-10-01, et l'application n'a pas
d'authentification. Un agent de GitHub installé sur le PC (« self-hosted runner ») exécuterait
sur le PC, à côté de la base, le code de toute PR ouverte sur le dépôt ; la documentation de
GitHub, lue le 2026-10-12, dit de ne presque jamais en utiliser sur un dépôt public.

**Conséquences.** `ci.yml` récupère tout l'historique git et joue deux étapes de plus.
`scripts/controle-migrations.mjs` se lance aussi à la main, avant une PR. Un test le joue sur un
dépôt git jetable (`tests/outillage/migrations.test.ts`) : environ 7 secondes de plus sur
`npm test` sous Windows. Deux migrations de même numéro n'ont pas de contrôle à elles : les tests
échouent déjà, à la création de la base (essayé le 2026-10-12). L'entrée du 2026-10-10 tient : ni
specs à statut, ni exigences numérotées. Pas de migration. Rien ne change dans l'application.

**Ce qui n'est pas tranché.** `main` n'est pas protégée : la CI dit qu'une PR est rouge, GitHub
laisse quand même la fusionner. La détection des secrets poussés par erreur et les alertes sur
les dépendances vulnérables sont désactivées sur le dépôt (lu le 2026-10-12). La CI tourne sous
Linux avec Node 24, le PC sous Windows avec Node 26 : seuls les tests lancés sur le PC couvrent
l'écart. Le contrôle ne couvre que ce qui est sur `main` : une migration encore en cours
d'écriture, appliquée à la base réelle par un `npm run dev` lancé sur sa branche, peut encore
changer sans qu'il le voie.

## 2026-10-14 — GitHub : `main` protégée, secrets et dépendances surveillés

**Décision.** Christophe a accepté les trois réglages proposés pour le dépôt public, laissés
ouverts par l'entrée « CI » du même jour. Ils sont actifs depuis le 2026-10-14.

1. Un ruleset, « Protection de main », s'applique à `main`, sans exception, administrateur
   compris : pas de fusion sans PR (aucune approbation exigée) ; le contrôle `verifier` doit être
   vert, sur une branche à jour de `main` ; fusion par commit de fusion seulement ; ni force push,
   ni suppression de `main`.
2. La détection des secrets et leur blocage à l'envoi sont actifs sur le dépôt. Les motifs
   génériques (clés privées, chaînes de connexion) ne le sont pas.
3. Les alertes de Dependabot et ses correctifs de sécurité sont actifs : une PR s'ouvre quand une
   dépendance a une faille connue et un correctif. Les mises à jour de version courantes ne sont
   pas demandées.

**Pourquoi.** Point 1 : la CI disait qu'une PR était rouge sans l'empêcher d'être fusionnée ; la
règle ne tenait que par la lecture de `gh pr checks`. Aucune approbation n'est exigée, parce que
GitHub ne laisse pas approuver sa propre PR. La branche doit être à jour parce que deux fenêtres
peuvent préparer deux PR en même temps : deux migrations de même numéro, vertes chacune de son
côté, empêcheraient d'ouvrir la base une fois fusionnées ; à jour, la seconde PR rejoue les tests
avec la première, et ils échouent. Depuis le 2026-10-01, tout arrivait déjà sur `main` par une
PR (lu dans l'historique) : rien ne change à l'usage. Point 2 : le seul secret du projet est la
clé Anthropic, que GitHub reconnaît, blocage à l'envoi compris (liste de GitHub lue le
2026-10-14). Le blocage par compte, actif par défaut, ne laisse aucune trace quand on le
contourne ; celui du dépôt lève une alerte. Point 3 : `npm run dev:reseau` ouvre le serveur
Next.js au réseau local, où une faille de Next.js n'est pas théorique. Les mises à jour courantes
feraient une PR par version, sans lien avec la sécurité.

**Conséquences.** GitHub a ajouté de lui-même à la règle des PR un paramètre que sa documentation
ne décrit pas, `require_extra_approval_for_unattributed_changes`, réglé sur oui. D'après des
signalements d'utilisateurs, il exige une approbation de plus quand l'auteur d'un commit n'est
relié à aucun compte, et bloquait des PR ouvertes par des robots : il est réglé sur non. Une PR de
Dependabot attend l'accord de Christophe, comme toute PR dont il n'a pas vu le contenu.
`CLAUDE.md` et `docs/05-securite-rgpd.md` sont mis à jour. Rien ne change dans l'application. Pas
de migration.

**Ce qui n'est pas tranché.** La détection des secrets ne reconnaît pas une donnée personnelle
(adresse, montant) ; le contrôle de confidentialité qui s'en charge n'est pas dans le dépôt.
L'état du blocage par compte de Christophe ne se lit pas par l'API. Pour revenir en arrière, il
suffit de désactiver le ruleset (Settings → Rules) ou de décocher un réglage (Settings →
Advanced Security).
