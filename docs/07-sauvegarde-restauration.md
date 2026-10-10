# 7. Sauvegarde et restauration

Ce qu'il faut sauvegarder — et rien d'autre :

| Élément | Emplacement | Contenu |
| --- | --- | --- |
| Base de données | `data/dossier.sqlite` (+ `-wal`, `-shm` si présents) | Tout le dossier : personnes, lieux, budget, actions, documents (métadonnées), audit, échanges IA |
| Fichiers déposés | `data/fichiers/<dossier>/<id>.<ext>` | Originaux des photos, devis, factures |
| Configuration | `.env.local` (si créé) | Variables ; la clé API ne doit **pas** partir dans une sauvegarde partagée |

Le code est dans git ; il ne fait pas partie de la sauvegarde des données.

## Sauvegarder

```bash
node scripts/sauvegarde.mjs                 # → sauvegardes/<horodatage>/
node scripts/sauvegarde.mjs D:/Coffre/assistant   # destination au choix (disque externe chiffré)
```

Le script :
1. copie la base par `VACUUM INTO` — un instantané cohérent, même si l'application tourne ;
2. copie `data/fichiers/` ;
3. écrit `manifeste.json` : date, chemins d'origine, somme de contrôle SHA-256 de la base, nombre de fichiers, version du schéma.

Rythme conseillé : avant chaque session de saisie importante et après chaque document ajouté ;
garder au moins trois sauvegardes successives. Les sauvegardes contiennent des données personnelles
(adresses, factures, photos du domicile) : support chiffré, jamais dans le dépôt git (`/sauvegardes/`
est ignoré), jamais dans une issue.

## Vérifier une sauvegarde

```bash
node scripts/restauration.mjs sauvegardes/<horodatage>
```

Sans `--confirmer`, le script recalcule la somme de contrôle, compare au manifeste et décrit ce
qu'il ferait. Rien n'est modifié. Faire cette vérification sur une sauvegarde par trimestre.

## Restaurer

1. Arrêter l'application (`Ctrl+C` sur `npm run dev` / `npm start`).
2. `node scripts/restauration.mjs sauvegardes/<horodatage> --confirmer`
   - l'état courant est déplacé dans `data/avant-restauration-<date>/` (rien n'est écrasé sans copie) ;
   - la base et les fichiers de la sauvegarde sont remis en place.
3. Redémarrer. Si le code a avancé depuis la sauvegarde, les migrations manquantes s'appliquent
   automatiquement au démarrage (table `schema_migration`).
4. Vérifier un dossier, un document (ouvrir le fichier), le journal d'audit. Supprimer
   `data/avant-restauration-<date>/` une fois satisfait.

## Vérification d'intégrité des fichiers

La fonction `verifierIntegrite` (src/lib/documents.ts) recalcule le SHA-256 de chaque fichier d'un
dossier et signale les absents ou altérés. Elle n'a pas encore d'écran ; elle peut être appelée dans
un script ou un test. À exposer dans l'interface si le besoin apparaît.

## Changer de PC

Copier une sauvegarde complète, cloner le dépôt, `npm install`, puis restaurer avec `--confirmer`
(le dossier `data/` est créé). Recréer `.env.local` à la main si besoin.

## Ce que la procédure ne couvre pas

- Le chiffrement de la sauvegarde elle-même : le support doit être chiffré (BitLocker, VeraCrypt…).
- La sauvegarde automatique planifiée : à mettre en place avec le planificateur de tâches Windows si l'usage devient quotidien.
- La restauration partielle (un seul dossier) : non prévue en V1.
