# 1. Note de cadrage — V1 testable

Date : 2026-10-09. Étiquettes : [Fait] = fourni par le cadrage ; [Hypothèse] = posée ici, à
confirmer ; [Recommandation] = proposition argumentée ; [À vérifier] = non confirmé par une source.

## Le besoin en cinq lignes

Un particulier (d'abord Christophe, sur son propre projet) doit pouvoir ouvrir un dossier immobilier
**sans connaître les réponses**, y poser ce qu'il sait et ce qu'il ignore, comparer des variantes
(rénover l'ancien, construire en bois à côté) sans qu'une option écrase l'autre, suivre coûts, pièces
et actions avec leur provenance, et — plus tard — y faire entrer des professionnels sur un périmètre
choisi. La V1 teste ce parcours en local, sans IA obligatoire, avant tout abonnement ou hébergement.

## Faits fournis par le cadrage

- [Fait] Aucun bien, adresse, parcelle, surface, prix ni calendrier n'est connu ; le code accueille des données incomplètes.
- [Fait] Six priorités à coder (dossier flexible, organiser, faire avancer, coûts, comparer, rôle de l'IA) ; le reste est hors V1.
- [Fait] L'application doit fonctionner sans IA ; l'IA est optionnelle, désactivable par dossier, sourcée.
- [Fait] Toute donnée affichée indique provenance et statut ; montants en précision exacte ; droits appliqués côté serveur.
- [Fait] Dossier pilote : recherche d'un lieu pour y habiter ; bâtiment ancien à toiture refaite ; projet bois (grandes baies, une chambre, grande pièce) ; terrasse et piscine intérieure en idées ; pistes écologiques ; financement via holding évoqué (10 000 €, 2 × 1 000 €) — **pistes de simulation, pas des faits**.
- [Fait] Le dépôt existant a déjà décidé (2026-10-01) : Next.js + SQLite local, pas de serveur distant ; statuts en tables de référence ; audit en ajout seul ; centimes entiers.

## Hypothèses posées

| Hypothèse | Raison | Impact si fausse |
| --- | --- | --- |
| [Hypothèse] La V1 reste **locale et mono-poste** (un PC, pas d'authentification) | Décision du 2026-10-01 ; le pilote est un seul utilisateur ; héberger avant d'avoir validé l'usage coûte en sécurité et en RGPD | Si un professionnel doit accéder dès la V1 : ajouter session + hébergement ; le reste du code est prêt (acteur explicite partout) |
| [Hypothèse] Les rôles et périmètres se **testent par simulation** (« agir en tant que ») | Seul moyen de vérifier ce que voit un notaire sans en inviter un | Si jugé insuffisant : passer à des comptes réels (même modèle de données) |
| [Hypothèse] Le seul champ obligatoire à la création d'un dossier est le **nom** | Critère « créer sans connaître toutes les réponses » | Si l'usage montre qu'un type de projet est indispensable : le rendre requis (décision ouverte n° 3) |
| [Hypothèse] Une extraction de document est **proposée par un humain** en V1 ; l'IA ne lit pas encore les fichiers | Lire un PDF/photo exige d'envoyer le fichier à un modèle : à décider explicitement (confidentialité) | Si la lecture automatique est la valeur prioritaire de l'IA : brancher le fournisseur distant sur le document (amélioration n° 1) |
| [Hypothèse] Plusieurs lignes d'une même nature sur un poste **s'additionnent** | Cas réel : acomptes, factures partielles | Devis concurrents mal saisis faussent le total ; documenté ; un statut « écarté » par ligne est une amélioration |
| [Hypothèse] La marge d'imprévus est un **paramètre du dossier** (10 % par défaut), pas une norme | Aucune valeur réglementaire ou professionnelle n'est vérifiée | Si une valeur de référence existe pour le pilote : la saisir ; jamais la présenter comme norme |
| [Hypothèse] Le traitement **n'entre pas dans le champ HDS** (hébergement de données de santé) | Aucune donnée de santé n'est collectée par conception | [À vérifier] si des diagnostics (amiante, plomb) ou des mentions de handicap entraient dans le dossier |
| [Hypothèse] Le fournisseur IA distant par défaut est Claude Opus 5.5 via le SDK officiel | Un seul fournisseur à maintenir en V1 ; contrat `FournisseurIA` pour en ajouter | Si un autre fournisseur est voulu : implémenter l'interface, rien d'autre ne change |

## Recommandations

- [Recommandation] Tester d'abord le parcours **recherche de bien + comparaison rénovation / neuf** (c'est le pilote décrit), la construction neuve seule n'ayant pas de bien à comparer.
- [Recommandation] Garder l'IA en **règles locales** pendant les premières semaines : on mesure où un assistant aide (questions manquantes) avant de payer un modèle et d'exporter des données.
- [Recommandation] Ne pas héberger avant d'avoir : un export complet, une suppression sur demande, et une base légale écrite (voir docs/05).

## Périmètre V1 / hors V1

**Dans la V1** : les six priorités, listées dans le README, avec tests et documentation.

**Hors V1, consigné comme améliorations (docs/08)** : simulation de financement et de fiscalité
paramétrable ; lecture automatique des documents par l'IA ; export complet et suppression du
dossier ; hébergement, sessions, invitations réelles ; module écologie/performance comparé ;
remontées intégrées (issues) ; chiffrement applicatif au repos ; abonnement et packs
professionnels.
