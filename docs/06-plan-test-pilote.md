# 6. Plan de test sur le dossier pilote

Objectif : Christophe parcourt la V1 avec son projet réel **sans connaître toutes les réponses**, et
vérifie à chaque étape que rien n'est inventé. Durée indicative : une heure. Données réelles
autorisées (tout reste sur le PC) ; les montants inconnus restent inconnus.

Préparation : `npm install`, `npm run dev`, ouvrir http://localhost:3000. Faire une sauvegarde avant
(`node scripts/sauvegarde.mjs`) si la base contient déjà des essais à garder.

| # | Étape | Action | Résultat attendu |
| --- | --- | --- | --- |
| 1 | Créer le dossier | Mes dossiers → Nouveau dossier : nom « Lieu à acheter pour y habiter », type « Recherche d'un bien », stade « Recherche », objectif vide | Redirection vers la vue d'ensemble ; Objectif affiché « À renseigner » ; marge d'imprévus 10 % présentée comme paramètre |
| 2 | Décrire sans adresse | Lieux → Nouveau lieu « Bien candidat (fictif) », type bien candidat, adresse vide | Adresse affichée « À renseigner » (pastille), pas de texte inventé |
| 3 | Bâtiments et pièces | Ajouter « Bâtiment ancien » (état : « toiture refaite — à vérifier ») et « Maison bois (projet) » ; dans la maison bois : « Chambre », « Grande pièce principale » sans surface | Les deux bâtiments apparaissent dans la carte de leur lieu, les pièces dans celle de leur bâtiment ; les deux pièces affichent surface « À renseigner » |
| 4 | Surface estimée | Sur « Grande pièce principale » : m² = 45, « C'est une estimation », puis « Oui, c'est connu » | Les deux questions n'apparaissent qu'une fois la surface saisie ; **refus** : « Une estimation ne peut pas être présentée comme connue » ; recommencer avec « réponse habituelle pour cette origine » → « 45 m² · estimation · estimé » |
| 5 | Idées | Idées → « Terrasse », « Piscine intérieure », « Panneaux solaires », « Puits canadien », « Récupération d'eau de pluie » ; passer « Piscine intérieure » à « Écartée » sans motif | Refus (motif obligatoire) ; avec motif → statut écarté et une décision apparaît |
| 6 | Deux scénarios | Scénarios → « Rénover l'ancien bâtiment » et « Construire en bois à côté » ; noter une hypothèse sur le premier : « Toiture saine (diagnostic à faire) » | Deux cartes ; comparaison : « Il faut au moins deux scénarios » disparaît ; hypothèse « à valider » |
| 7 | Postes sans montant | Budget → scénario 1 : postes « Toiture », « Isolation », « Menuiseries » ; scénario 2 : « Gros œuvre bois », « Baies vitrées » | Chaque poste « à renseigner » ; total « — » et pastille « partiel » ; rien ne vaut 0 |
| 8 | Estimation étiquetée | Scénario 1, Toiture : 18 000, nature Estimation, origine « Je l'ai saisie moi-même » | **Refus** (une estimation a pour source une estimation) ; refaire avec « C'est une estimation » → « estimé », référence « (estimation) » |
| 9 | Devis | Scénario 2, Gros œuvre bois : montant du devis réel si disponible (sinon laisser à renseigner), nature Devis, origine « Je l'ai saisie moi-même », fournisseur | Poste « chiffré (devis) » ; référence « (devis) » |
| 10 | Comparer | Scénarios → tableau de comparaison | Tant qu'un poste est à renseigner : « Totaux non comparables : … a des postes à renseigner », aucun rang pour ce scénario ; si tout est renseigné mais sur estimation : « Comparaison indicative » |
| 11 | Retenir | Passer « Rénover » à « Retenue », motif + conditions ouvertes « devis toiture à confirmer » | Décision listée avec conditions ouvertes ; l'autre scénario est intact |
| 12 | Actions | Actions → « Obtenir le devis toiture » (responsable : moi) ; « Commander la toiture » dépend de la précédente, échéance passée ; jalon « Réception » sans date | Liste du jour : « Commander » en **À débloquer** (pas en Aujourd'hui) ; « Réception » dans « sans date connue » ; passer « Commander » à fait → refus (prérequis) |
| 13 | Débloquer | Passer « Obtenir le devis » à fait | « Commander » passe en Aujourd'hui (en retard) ; accueil cohérent |
| 14 | Joindre une facture | Documents → déposer un PDF ou une photo, type Facture, date, scénario « Rénover » | Fichier listé, taille, « ouvrir le fichier » fonctionne ; nommé par identifiant sur disque |
| 15 | Lire puis corriger | Ouvrir le document → Proposer : montant avec une erreur volontaire, fournisseur, poste « Toiture » → puis corriger le montant et Valider | Champs « saisie · à confirmer » avant ; après : montant « Corrigée puis validée », autres « Validée », confiance « connu » ; Budget : Toiture « facturé », référence « (facture) », ligne « document importé · connu » avec lien document |
| 16 | Journal | Journal d'audit | Validation avec avant/après, création de ligne « Depuis le document … », transitions avec motif |
| 17 | Sans IA | Assistant IA | « désactivé » ; tout le reste a fonctionné sans lui |
| 18 | Règles locales | Activer, fournisseur « Règles locales », sections : identité, lieux, scénarios, budget, documents ; question « Que manque-t-il pour avancer ? » | Éléments constat → hypothèse → suggestion → vérification ; sources datées + règle citée ; incertitude ; avertissement ; aucune donnée modifiée ; « Voir ce que l'assistant reçoit » montre le texte exact, avec le nom du dossier, sans adresse ni nom de personne |
| 19 | Périmètre IA | Décocher tout sauf « scénarios » ; redemander | Les constats sur pièces/documents disparaissent ; « sections transmises : Scénarios » ; le texte montré ne contient plus le nom du dossier |
| 20 | Fournisseur distant (facultatif) | Renseigner `ANTHROPIC_API_KEY` dans `.env.local`, redémarrer, choisir « Modèle distant », poser 2–3 questions (ex. « Quelles vérifications avant d'acheter un bâtiment ancien ? », « Comment comparer rénover et construire ? ») | Réponses au même format, sources de type « modèle » marquées à vérifier, aucun chiffre inventé ; échange journalisé avec le périmètre |
| 21 | Rôle professionnel | Personnes → ajouter « Notaire (fictif) », professionnel, périmètre documents + lieux, mission « Acte de vente » ; Accueil → agir en tant que → Notaire ; ouvrir le dossier | Onglets limités à Lieux et Documents ; Budget → page introuvable ; aucun formulaire d'écriture sur Lieux ; retour utilisateur local : journal montre des « accès refusé » si une URL interdite a été tentée |
| 22 | Révoquer | Révoquer le notaire avec motif ; agir en tant que notaire | Le dossier n'apparaît plus ; URL directe → introuvable |
| 23 | Sauvegarde | `node scripts/sauvegarde.mjs` ; `node scripts/restauration.mjs <dossier>` sans `--confirmer` | Dossier horodaté avec base, fichiers, manifeste ; vérification OK |
| 25 | Devis concurrent | Budget → sur un poste, ajouter un second devis ; Lignes détaillées → Modifier ou écarter → statut « Écartée », motif | Les deux devis s'additionnaient ; après écartement la ligne est barrée, étiquetée « ne compte pas », la référence du poste revient au devis retenu ; journal : transition avec motif |
| 26 | Export | Vue d'ensemble → Vos données → Exporter le dossier complet (.zip) ; ouvrir l'archive | `dossier.json` (toutes les tables), `fichiers/` (originaux), `LISEZMOI.txt` ; l'export est journalisé ; un contributeur ne voit pas le lien |
| 27 | Suppression | Créer un dossier « Brouillon », y déposer une photo, puis Vue d'ensemble → Supprimer définitivement : retaper le nom, motif | Retour à « Mes dossiers » sans le brouillon ; le fichier a disparu de `data/fichiers/` ; le journal des autres dossiers est intact ; un nom mal retapé est refusé |
| 24 | Téléphone (même Wi-Fi) | Arrêter le serveur ; `npm run dev:reseau` ; `npm run adresse` ; accepter l'invite du pare-feu Windows (réseau privé) ; ouvrir l'adresse affichée sur le téléphone | Même dossier, mêmes données ; pas de défilement horizontal de la page (les tableaux Budget, Comparaison, Journal défilent seuls) ; Documents → Déposer → appareil photo : une photo prise depuis le téléphone arrive dans la liste et s'ouvre depuis le PC ; arrêter le serveur après l'essai |

Résultat global attendu : aucune valeur affichée sans source ni statut ; aucun total partiel
présenté comme comparable ; aucune écriture faite par l'assistant ; aucun accès hors périmètre.
Noter chaque écart dans une issue **sans** donnée personnelle (adresse, montant réel, nom).
