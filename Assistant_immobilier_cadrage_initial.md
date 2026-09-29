# Assistant immobilier et travaux — cadrage initial

Date : 29 septembre 2026  
Statut : proposition de travail, à enrichir par les essais de Christophe  
Hébergement du code envisagé : dépôt GitHub privé, avec copie locale sur son PC

## Intention

Créer une application que Christophe puisse utiliser pour son propre projet immobilier **du début à la fin** : rechercher un lieu avec un bâtiment ancien, étudier rénovation ou reconstruction, envisager une maison en bois vitrée à côté, préparer l'achat, chiffrer et suivre les travaux, puis conserver les documents et décisions de clôture. L'application doit aussi convenir à un projet plus simple comme la rénovation d'une chambre. On doit pouvoir commencer à n'importe quelle étape.

La première démonstration sera un **outil utilisable**, alimenté avec des données du projet, et non seulement une carte des fonctions. Elle couvrira toutes les étapes avec un niveau de détail raisonnable. Les modules spécialisés approfondiront ensuite chaque étape. Les informations manquantes resteront explicitement inconnues.

## Principes du produit

1. **Un dossier, plusieurs scénarios.** Un bien candidat peut contenir plusieurs bâtiments et plusieurs scénarios : conserver, rénover, transformer, démolir, reconstruire, construire à côté ou combiner ces choix. Les hypothèses, coûts, tâches et documents d'un scénario ne sont pas mélangés avec ceux d'un autre.
2. **IA facultative.** Le dossier, le budget, les tâches, les documents et la timeline fonctionnent sans IA. Lorsque l'IA est activée pour un dossier, elle peut proposer des idées, aider à lire et classer des documents et signaler des questions. Elle ne transforme pas une suggestion en fait confirmé.
3. **Traçabilité.** Chaque donnée importante indique son origine, sa date, son auteur ou organisme, le scénario concerné et son statut : idée, hypothèse, document reçu, réponse vérifiée, décision retenue. Les montants distinguent estimation, devis, engagement, facture et paiement.
4. **Validation avant effet.** La lecture d'une photo propose des champs et un classement. Une correction ou une validation est possible avant de modifier un budget, une échéance ou un scénario. Le document original reste disponible.
5. **Prochaine action claire.** L'accueil montre Aujourd'hui, À débloquer et À explorer. La timeline lie événements passés, tâches futures, dates connues et dépendances ; elle n'invente pas de date.
6. **Remontées intégrées.** Sur chaque écran, Christophe peut noter un problème, une idée, un manque ou une question. La remontée conserve le module, le scénario et l'étape concernés, une description et, avec accord explicite, une capture expurgée de données privées. Les données immobilières personnelles ne sont pas publiées dans des issues GitHub.
7. **Partage maîtrisé.** Un professionnel invité ne voit que les parties du dossier que l'utilisateur choisit, pour une durée et une finalité indiquées. Ce partage vient après le prototype personnel.

## Parcours de la première version utilisable

| Étape | Fonction minimale | Ce que Christophe peut réellement faire |
| --- | --- | --- |
| 1. Démarrer | Créer un dossier au stade choisi | Décrire son besoin, ses critères et les inconnues sans devoir remplir tout le parcours. |
| 2. Rechercher | Fiches de biens candidats | Enregistrer annonces, prix demandés, photos, visites, questions, réponses et documents. |
| 3. Vérifier | Liste de faisabilité par bien | Suivre urbanisme, état du bâti, accès et réseaux comme points à établir, avec source et statut ; aucune autorisation présumée. |
| 4. Comparer | Scénarios indépendants | Décrire les bâtiments et variantes, surfaces envisagées, usage, participants éventuels, budget et questions propres à chaque option. |
| 5. Préparer l'achat | Étapes et pièces | Suivre offre, financement envisagé, rendez-vous, documents et décisions à examiner avec les interlocuteurs compétents. |
| 6. Concevoir | Carnet d'idées et espaces | Capturer librement une idée, puis la rattacher à un scénario si elle est retenue pour étude. |
| 7. Chiffrer | Budget par scénario | Passer d'hypothèses à des devis, factures et paiements sans écraser l'historique ; voir le total et les postes encore inconnus. |
| 8. Réaliser | Tâches et timeline | Définir responsables, dépendances, dates réelles, blocages et avancement des travaux. |
| 9. Clore | Dossier final | Ranger réception, réserves, garanties, factures et décisions ; exporter une copie compréhensible du dossier. |
| 10. Améliorer | Remontées | Décrire à tout moment ce qui manque ou gêne, retrouver le suivi et lier la correction à la version du produit. |

**Critère transversal de recette :** Christophe doit pouvoir parcourir ces étapes avec son dossier sans qu'une réponse externe inconnue soit présentée comme acquise. Une rénovation de chambre doit pouvoir sauter les étapes d'achat et de recherche.

## Données minimales du dossier

- **Projet** : nom, objectif, stade, critères, budget cible facultatif, dates connues, propriétaire du dossier.
- **Bien candidat** : annonce ou provenance, adresse et parcelle seulement si connues, prix demandé, statut, visites, risques et vérifications à faire.
- **Bâtiment / espace** : type, usage actuel ou envisagé, surface mesurée ou estimée avec unité et origine.
- **Scénario** : bien lié, bâtiments concernés, travaux ou construction envisagés, hypothèses, participants fictifs ou réels explicitement distingués, statut et décision.
- **Ligne de budget** : poste, montant, devise, type (estimation, devis, engagement, facture, paiement), scénario, document source, date et historique.
- **Document** : type, fichier original, date, provenance, liens au bien, scénario et poste, extraction proposée et validation.
- **Tâche / événement** : description, échéance si connue, état, responsable, dépendances, source et scénario.
- **Décision** : choix, motifs, date, auteur, preuves utilisées, alternatives écartées et conditions encore ouvertes.
- **Remontée** : catégorie (bug, idée, manque, question), écran, contexte, résultat attendu, résultat observé, priorité ressentie et statut de traitement.

Dans la conversation initiale, seuls quelques critères sont exprimés : lieu à acheter pour habiter, bâtiment ancien avec toiture refaite recherché, maison en bois avec grandes baies vitrées, une chambre et une grande pièce, terrasse à dimensionner ; piscine intérieure comme idée à explorer. Aucun bien, parcelle, surface, prix, budget ou calendrier précis n'est confirmé. Le prototype ne doit pas inventer ces valeurs.

## Démonstration et retours

La première recette utilisera deux parcours :

1. **Projet réel de Christophe** : comparer au moins deux biens candidats ou, avant de disposer d'annonces, deux scénarios sur un bien fictif clairement étiqueté ; suivre une question de faisabilité, un devis ou une facture, une décision et la prochaine action.
2. **Chambre à refaire** : créer directement un dossier au stade travaux, définir les espaces, un budget, deux tâches et un document, sans écrans d'achat inutiles.

Une remontée faite dans l'application doit pouvoir être exportée en texte pour créer ou mettre à jour une issue GitHub **après relecture**, afin d'éviter de publier une adresse, une facture, des coordonnées ou un document personnel dans le dépôt. Le dépôt privé reste réservé aux personnes autorisées, mais ses issues ne deviennent pas un lieu de stockage du dossier immobilier.

## Répartition des versions

- **V0 — dossier personnel utilisable de A à Z** : toutes les étapes du tableau, saisie et classement manuels, scénarios, budget, tâches, timeline, export et remontées. Priorité à la cohérence des données et à la sauvegarde.
- **V1 — assistance IA facultative** : extraction de documents avec validation, suggestions, questions manquantes et réponses sourcées ; mesures d'erreurs et de coût par usage.
- **V2 — collaboration et distribution** : partage ciblé, vues métiers, agences pilotes, abonnement et autres canaux seulement après validation de l'usage et des obligations applicables.

La réalisation peut être itérative à l'intérieur de V0. « A à Z » décrit la **couverture du parcours**, pas la profondeur complète de chaque métier dès le premier jour.

## Questions ouvertes pour le dépôt

- Nom définitif de l'application et du dépôt ; `assistant-immobilier` est un nom de travail.
- Choix du stockage local et des sauvegardes avant de saisir de vrais documents.
- Format de l'export, règles de reprise et de suppression des données.
- Premier jeu de données d'essai : fictif ou issu d'annonces effectivement retenues.
- Écrans et tests d'usage à prioriser pendant le développement.
- Cadre juridique et financier du produit, à vérifier avant commercialisation ; aucune simulation du dossier ne vaut réponse administrative ou conseil individualisé confirmé.

## Organisation GitHub prévue

Le dépôt privé contiendra le code, ce cadrage, un `README`, un journal des décisions et des issues séparées pour les parcours, données, documents, budget, timeline, retours et confidentialité. La branche principale recevra les versions utilisables ; les changements seront proposés sur des branches dédiées. Une copie locale sur le PC sera obtenue par clonage du dépôt privé avec le compte GitHub autorisé.
