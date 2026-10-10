# 8. Synthèse : décisions ouvertes, prochaines étapes, vigilance, améliorations

## Décisions ouvertes — à trancher par Christophe

Pour chacune, une option par défaut est proposée et attend validation ; rien n'a été tranché seul.

| # | Décision | Option par défaut proposée | Pourquoi | Attend |
| --- | --- | --- | --- | --- |
| 1 | Nom définitif du produit | Garder « Assistant immobilier » comme nom de travail | Aucun critère de marque n'est connu ; le nom n'est écrit qu'en deux endroits (`layout.tsx`, README) | Validation |
| 2 | Premier test : recherche de bien, construction neuve, ou les deux | **Les deux dans un seul dossier** : bien candidat + scénario « rénover » + scénario « construire en bois à côté » | C'est le pilote décrit ; la comparaison est le cœur de la V1 | Validation |
| 3 | Informations obligatoires à la création d'un dossier | **Le nom seul** ; type et stade proposés, jamais exigés | Critère « créer sans connaître toutes les réponses » ; l'assistant signale le type manquant | Validation après le pilote |
| 4 | Premier pack professionnel à tester | **Notaire** (périmètre : documents + lieux) | Rôle le plus tôt dans le parcours ; données les plus structurées | Validation |
| 5 | Partie de l'IA à valeur prioritaire | **Questions manquantes** (déjà en règles locales), puis lecture de documents | Mesurable sans réseau ; la lecture de documents engage la confidentialité | Validation |
| 6 | Séparation éditeur (SASU/holding) / structure de projet | **Hors code** ; modéliser plus tard « Personne de type société » comme participant | Juridique et fiscal : à voir avec un professionnel | Avis professionnel |
| 7 | Montants et personnes de la simulation de financement | **Ne rien saisir comme fait** ; quand le module existera, 10 000 € et 2 × 1 000 € entreront comme hypothèses « à valider » | Le cadrage l'exige | Confirmation des montants et de leur nature |

## Prochaines étapes concrètes (ordre chronologique)

1. **Lancer le plan de test pilote** (docs/06) sur le PC de Christophe — prérequis : Node 24, `npm install`. Noter les écarts en issues sans données personnelles.
2. **Trancher les décisions 2, 3, 5** à la lumière du pilote — prérequis : étape 1.
3. **Compléter les règles locales** de l'assistant avec ce que le pilote a montré comme manquant — prérequis : étape 2 (décision 5).
4. **Décider de l'usage du fournisseur distant** sur données réelles : vérifier conditions de rétention et contrat (docs/05) — prérequis : décision 5 ; dépend d'une lecture juridique.
5. **Export complet + suppression de dossier** (RGPD) — prérequis : aucun ; indispensable avant toute ouverture à un tiers.
6. **Module financement/fiscalité paramétrable** (hypothèses visibles, avertissement « à valider par un professionnel ») — prérequis : décision 7 et validation des montants.
7. **Hébergement + authentification + invitations réelles** — prérequis : étapes 4 et 5, décision 4 ; remplace `acteur-courant.ts`, migre vers PostgreSQL avec sécurité par ligne.
8. **Modèle économique** (abonnement, packs, partenariats) — prérequis : étape 7 et un second utilisateur réel.

## Points de vigilance

- **Confidentialité par défaut** : tout ajout d'un service externe (IA, hébergement, analytics) doit passer par une décision écrite dans DECISIONS.md et la checklist docs/05.
- **Dérive des « estimations »** : la tentation de saisir une estimation comme « saisie » existe ; le domaine refuse la combinaison nature estimation + source saisie, mais pas une « saisie » d'un chiffre inventé. Le pilote doit vérifier que l'étiquetage est naturel, sinon le simplifier.
- **Devis concurrents** : saisis tous deux comme « devis », ils s'additionnent (limite connue). À surveiller au pilote.
- **Next.js 16** : API différentes de la documentation courante ; relire `node_modules/next/dist/docs` avant toute évolution (consigne du dépôt).
- **Base unique** : un seul fichier SQLite pour tous les dossiers ; l'isolation est applicative (droits serveur, testés). Au passage multi-utilisateur, la poser en base (RLS).

## Améliorations proposées (suggestions, classées valeur / effort)

| # | Suggestion | Valeur | Effort | Pourquoi |
| --- | --- | --- | --- | --- |
| 1 | **Lecture automatique des documents par l'assistant** (fournisseur distant sur le PDF/la photo → extraction `suggestion_ia` → validation humaine existante) | Haute | Moyen | Le circuit de validation existe ; seule la proposition manque. Engage la confidentialité (décision 5) |
| 2 | **Import d'un export** (recréer un dossier depuis l'archive zip, sur un autre PC) | Moyenne | Moyen | Complète la portabilité ; aujourd'hui la remise en base passe par la restauration de sauvegarde |
| 3 | **Module financement paramétrable** (apports, prêts, aides comme hypothèses ; simulation visible, jamais une conclusion) | Haute | Élevé | Demandé par le cadrage ; attend la décision 7 et un cadre professionnel |
| 4 | **Écran de vérification d'intégrité des fichiers** (SHA-256 recalculés, absents signalés) | Faible | Faible | La fonction existe (`verifierIntegrite`), il manque l'écran |
| 5 | **Thème sombre avec bouton clair / sombre dans l'appli** (trois choix : Système, Clair, Sombre ; « Système » par défaut ; choix mémorisé sur l'appareil) | Moyenne | Moyen | Demandé par Christophe (2026-10-10), bouton confirmé le même jour. Aujourd'hui l'interface est forcée en clair (`color-scheme: light` dans `globals.css`) : environ 130 lignes réparties sur une vingtaine de fichiers fixent des couleurs en dur (`bg-white`, `text-neutral-*`, badges colorés). Voie proposée : des couleurs nommées par rôle (surface, texte, texte discret, bordure) déclarées dans `@theme` avec leur variante sombre, puis remplacer les classes en dur. Piège déjà rencontré : une règle `body` hors couche écrase les classes Tailwind du layout |

Faites depuis la synthèse initiale (2026-10-09, même journée) : export complet et suppression d'un
dossier ; statut retenu / écarté par ligne de montant ; modification d'une ligne avec audit ;
conservation de la saisie en cas d'erreur ; test sur téléphone.

Toutes sont des suggestions : aucune n'est engagée.
