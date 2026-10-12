# 2. Choix techniques

Principe : une solution **simple et maintenable** (monolithe modulaire) plutôt qu'une architecture
distribuée. Chaque tableau compare au moins deux options ; la recommandation est argumentée. Les
coûts d'entrée sont qualitatifs (temps d'installation, compétences, frais) — pas de chiffres non
vérifiés.

## 2.1 Langage et framework

| Option | Avantages | Inconvénients | Performance | Sécurité | Maintenance |
| --- | --- | --- | --- | --- | --- |
| **Next.js 16 + TypeScript (retenu)** | Un langage côté serveur et interface ; Server Actions typées ; rendu serveur par défaut ; déjà en place dans le dépôt | Framework qui évolue vite (API différentes de la doc courante) ; abstraction du serveur | Très bonne pour une appli de formulaires ; rendu dynamique par page | Validation et droits côté serveur naturels ; attention : les Server Actions sont joignables sans interface | Une seule base de code ; docs embarquées dans `node_modules/next/dist/docs` |
| Rust (axum) + front séparé (React) | Performance et typage forts ; déjà pratiqué dans Ergonomia | Deux langages, contrat d'API à générer ; coût d'entrée élevé pour une V1 mono-utilisateur | Excellente, inutile ici | Très bonne | Deux pipelines à maintenir |
| Python (Django) | Admin généré, ORM mature | Un second langage pour l'interface ; moins de typage de bout en bout | Bonne | Bonne | Deux écosystèmes |

[Recommandation] Garder Next.js + TypeScript : déjà choisi (2026-10-01), suffisant, et le typage
partagé remplace un pipeline de génération d'API.

## 2.2 Base de données

| Option | Avantages | Inconvénients | Performance | Sécurité | Maintenance |
| --- | --- | --- | --- | --- | --- |
| **SQLite local via `node:sqlite` (retenu)** | Zéro installation, zéro dépendance native ; fichier unique facile à sauvegarder ; données qui ne quittent pas le PC ; `CHECK`, déclencheurs, transactions | Mono-poste : un partage réel impose une migration ; pas de types riches | Largement suffisante (un dossier, quelques milliers de lignes) | Pas de surface réseau ; chiffrement = celui du disque | Migrations SQL versionnées (ce dépôt) |
| PostgreSQL hébergé (ex. Neon) | Multi-utilisateur, RLS (sécurité par ligne), types riches | Contredit la décision « pas de serveur distant » ; sous-traitant RGPD ; coût mensuel | Excellente | Très bonne avec RLS ; mais données hors du PC | Migrations + hébergeur |
| SQLite chiffré (SQLCipher) | Chiffrement au repos intégré | Dépendance native à compiler sous Windows (frein connu) | Idem SQLite | Chiffrement au repos | Plus fragile à installer |

[Recommandation] SQLite local pour la V1 ; prévoir PostgreSQL + RLS **au moment** de l'hébergement
(les fonctions `lib` ne dépendent pas de SQLite dans leur signature ; le SQL reste simple).

## 2.3 Stockage des fichiers (photos, devis, factures)

| Option | Avantages | Inconvénients | Performance | Sécurité | Maintenance |
| --- | --- | --- | --- | --- | --- |
| **Disque local `data/fichiers/`, nommage par identifiant, SHA-256, servi par route contrôlée (retenu)** | Même principe que la base ; pas de fuite par nom de fichier ; intégrité vérifiable | Taille de la sauvegarde ; pas de déduplication | Directe | Pas dans `public/` ; droits vérifiés à chaque lecture | Un dossier à sauvegarder avec la base |
| Blob dans SQLite | Un seul fichier à sauvegarder | Base volumineuse, `VACUUM` lents, moins pratique à ouvrir | Correcte | Idem base | Simple mais lourd |
| Stockage objet (S3, Vercel Blob) | Scalable, URL signées | Sous-traitant, coût, données hors PC | Excellente | Dépend de la configuration | Hébergeur |

## 2.4 Authentification et rôles

| Option | Avantages | Inconvénients | Sécurité | Maintenance |
| --- | --- | --- | --- | --- |
| **V1 : acteur local + simulateur par cookie, droits appliqués côté serveur (retenu)** | Permet de tester les rôles sans infrastructure ; tout le code reçoit déjà un `Acteur` | Ce n'est pas une authentification ; valable uniquement mono-poste | Correcte pour un PC personnel ; inacceptable si exposé au réseau | Un seul fichier à remplacer (`acteur-courant.ts`) |
| Sessions maison (mot de passe + cookie signé) | Sans sous-traitant | Hachage, réinitialisation, 2FA à écrire et maintenir | Dépend de la rigueur | Charge récurrente |
| Fournisseur d'identité (Clerk, Auth0…) | Robuste, 2FA, invitations | Sous-traitant RGPD, coût, dépendance | Très bonne | Faible |

[Recommandation] V1 locale sans authentification ; **au passage à l'hébergement**, un fournisseur
d'identité (moins de code sensible à maintenir), avec le modèle `personne` / `participation` actuel.

## 2.5 Traitement des documents

| Option | Avantages | Inconvénients | Sécurité |
| --- | --- | --- | --- |
| **V1 : lecture humaine → champs proposés → validation/correction → ligne de budget (retenu)** | Aucun envoi de fichier ; principe « validation avant effet » déjà en place ; mesure le besoin réel | Saisie manuelle | Maximale |
| OCR local (Tesseract) | Sans réseau | Qualité variable sur factures ; dépendance lourde | Bonne |
| Modèle multimodal distant (Claude) sur le fichier | Qualité de lecture ; classement | Le fichier quitte le PC ; coût ; consentement explicite nécessaire | À encadrer (périmètre, journal) |

## 2.6 Intégration IA optionnelle

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| **Interface `FournisseurIA` + fournisseur « règles locales » par défaut + fournisseur Anthropic optionnel (retenu)** | Le produit fonctionne sans IA ; le rôle de l'IA se teste sans réseau ; un seul contrat de réponse sourcée | Les règles locales ne « raisonnent » pas |
| Appel direct au modèle depuis les pages | Rapide à écrire | Fuite du périmètre, pas de journal, impossible à désactiver proprement |
| Passerelle multi-fournisseurs (AI Gateway) | Bascule de fournisseur | Un intermédiaire de plus pour des données sensibles ; inutile en V1 |

## 2.7 Hébergement

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| **V1 : aucun — PC de l'utilisateur (retenu)** | Confidentialité maximale ; zéro coût | Pas de partage, pas d'accès mobile |
| Plateforme (Vercel + base managée) | Déploiement simple, HTTPS | Sous-traitants, localisation des données à vérifier, coût |
| VPS en France/UE auto-géré | Maîtrise des données | Administration système à assumer |

[À vérifier] avant tout hébergement : localisation des données, contrat de sous-traitance (art. 28
RGPD), chiffrement au repos.

## 2.8 Carte des lieux et géocodage

Décision du 2026-10-11. Le géocodage est la conversion d'une adresse en position (latitude,
longitude). Les conditions d'utilisation des services n'ont pas été lues [À vérifier].

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| **Leaflet + fond « Plan IGN » + Base Adresse Nationale (retenu)** | Bibliothèque open source servie par l'application ; services publics sans clé ni compte ; rien ne part vers le service d'adresses sans un geste ; il sait aussi chercher par code postal et donner l'adresse la plus proche d'un point | Adresses françaises seulement ; pas de vue de rue |
| Google Maps (carte et géocodage) | Rendu familier, monde entier, vue de rue | Compte Google Cloud avec carte bancaire ; clé visible dans le navigateur ; un contrat de plus |
| Leaflet + OpenStreetMap + Nominatim | Libre, monde entier | Serveurs communautaires, règles d'usage à respecter [À vérifier] |
| Pas de carte : un lien vers un site de cartes | Rien à maintenir | Ne montre pas plusieurs biens ensemble ; l'adresse part chez un tiers à chaque clic |

La position se stocke en microdegrés entiers, avec source et confiance, comme toute donnée tracée.

## Dépendances ajoutées en V1

| Paquet | Pourquoi | Alternative écartée |
| --- | --- | --- |
| `vitest` (dev) | Résout l'alias `@/` et les imports TypeScript sans extension comme Next.js ; rapide | `node --test` : exige des extensions `.ts` explicites et pas d'alias |
| `@anthropic-ai/sdk` | Client officiel, erreurs typées, sortie structurée | Appels `fetch` à la main : à maintenir soi-même |
| `zod` | Schéma de la réponse IA, exigé par `zodOutputFormat` | JSON Schema écrit à la main, non vérifié à l'exécution |
| `leaflet` (ajouté le 2026-10-11) | Carte des lieux : interactive, sans clé ni compte, repères déplaçables | Google Maps : compte, carte bancaire, clé exposée |
| `@types/leaflet` (dev) | Types TypeScript de Leaflet, qui n'en fournit pas | Écrire les types à la main |
| `storybook`, `@storybook/nextjs-vite`, `@storybook/addon-docs` (dev, ajoutés le 2026-10-12) | Atelier des composants : chaque composant seul, dans ses états, avec des données fictives. La variante Vite réutilise le Vite déjà amené par `vitest` | Variante Webpack (`@storybook/nextjs`) : un second outil de construction à installer. Assistant d'installation (`npm create storybook`) : il ajoute des exemples, une extension de publication chez l'éditeur et une configuration de tests qui modifie celle de `vitest` |
