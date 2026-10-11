# 4. Modèle de données

Conventions : identifiants UUID (texte) ; dates ISO ; montants en **centimes entiers** ; surfaces en
**centièmes de m² entiers** ; `source` ∈ {saisie, import, estimation, source_externe, suggestion_ia} ;
`confiance` ∈ {connu, estime, a_confirmer, a_renseigner}. « Prov. » = la colonne porte une provenance
(source + confiance) ; « — » = donnée structurelle sans provenance. Les statuts sont des tables de
référence (`ref_*`), modifiables sans toucher au code. Schéma exécutable : `src/lib/db/migrations/`.

| Entité | Champs principaux (type, obligatoire) | Provenance / confiance | Relations |
| --- | --- | --- | --- |
| **Dossier** | nom (texte, oui) ; objectif, stade, type_projet (texte, non → « à renseigner ») ; ia_activee (0/1, défaut 0) ; ia_perimetre (JSON sections) ; ia_fournisseur ; taux_imprevus_pour_mille (entier, défaut 100) | — | 1-n participations, lieux, bâtiments, scénarios, idées, documents, actions |
| **Personne** | nom (oui) ; email ; type (particulier/professionnel/societe) ; profession ; est_utilisateur_local | — | n-n dossiers via Participation |
| **Participation (rôle)** | dossier_id, personne_id (oui) ; role ∈ ref_role (oui) ; perimetre (JSON sections, pro) ; finalite (mission) ; revoquee_le (null = active) | — | unique (dossier, personne) |
| **Lieu (Bien / Terrain)** | nom, type_lieu ∈ ref_type_lieu (oui) ; adresse (non) + adresse_source + adresse_confiance ; parcelle ; description. Nom, type, parcelle et description se corrigent après création ; l'adresse a son propre formulaire. Se retire seulement vide : aucun bâtiment ni document rattaché | adresse : Prov. (CHECK : null ⇔ à renseigner) | n bâtiments, documents |
| **Bâtiment** | nom (oui) ; lieu_id (facultatif, modifiable : le bâtiment change de lieu) ; type, usage_actuel, usage_envisage, etat, description (libres). Nom, type, état et usages se corrigent après création. Se retire seulement vide : aucune pièce, idée, poste ni document rattaché | source (saisie par défaut) | n pièces, postes, idées |
| **Pièce / espace** | batiment_id, nom (oui) ; usage ; surface_centiemes (non) + surface_source + surface_confiance + surface_document_id ; description. Nom, usage et bâtiment se corrigent après création ; la surface a son propre formulaire. Se retire seulement vide : aucune idée ni document rattaché | surface : Prov. (CHECK : estimation ≠ connu ; suggestion_ia ⇒ à confirmer) | n idées, documents |
| **Idée** | titre (oui) ; description ; statut ∈ ref_statut_idee (idée, à étudier, retenue, écartée) ; scenario_id, batiment_id, piece_id. Titre, description et rattachements se corrigent après création | source | décision créée quand retenue/écartée |
| **Scénario** | nom (oui) ; description ; statut ∈ ref_statut_scenario. Nom et description se corrigent après création ; une décision déjà prise garde le nom d'alors | source | n postes, hypothèses, idées, actions, documents ; décision à retenue/écartée |
| **Hypothèse** | enonce (oui) ; statut ∈ ref_statut_hypothese (à valider, validée, invalidée) ; scenario_id ou idee_id | source | changement de statut avec motif |
| **Poste budgétaire** | scenario_id, nom (oui, unique par scénario) ; categorie ; batiment_id (du même dossier). Nom, catégorie et bâtiment se corrigent après création ; les lignes suivent le nom | — (sans ligne ⇒ « à renseigner ») | n lignes, documents |
| **Ligne de montant (Devis / Facture / Paiement / Estimation / Engagement)** | poste_id (oui) ; montant_centimes (entier, oui) ; type_montant ∈ ref_type_montant (oui) ; source (oui) ; confiance (oui) ; document_id ; date_piece ; fournisseur | Prov. (validée par le domaine : nature estimation ⇒ source estimation ou IA) | → poste, document |
| **Document / Photo** | nom_original, type_document ∈ ref_type_document, mime, taille_octets, sha256, chemin_relatif (oui) ; date_document (non) ; note ; depose_par. Type, date, note et rattachements se corrigent après le dépôt ; le fichier ne change jamais | source (import) ; rattachements : lieu, bâtiment, pièce, scénario, poste, idée, action | n extractions |
| **Extraction de document** | document_id, champ ∈ {montant_centimes, date, fournisseur, poste, type_montant} ; valeur_proposee ; valeur_validee ; statut ∈ ref_statut_extraction (proposée, validée, corrigée, rejetée) ; validee_par, validee_le | source (saisie ou suggestion_ia) ; confiance (à confirmer → connu à la validation) | → document |
| **Action (Tâche) / Jalon** | description (oui) ; echeance (non, jamais inventée) ; responsable (texte) ; responsable_personne_id ; statut ∈ ref_statut_tache ; est_jalon ; scenario_id. Description, échéance, responsable, scénario et jalon se corrigent après la création (champs changés tracés au journal d'audit) | source | n dépendances, documents |
| **Dépendance** | tache_id dépend de depend_de_id (CHECK ≠ ; cycles refusés par le domaine ; se pose et se retire, tracé au journal d'audit) | — | → actions |
| **Décision** | choix, motif (oui) ; alternatives_ecartees ; conditions_ouvertes ; decide_par ; date_decision ; scenario_id ou idee_id | — | créée par les transitions retenue/écartée |
| **Source (référence externe)** | titre (oui) ; organisme ; url ; date_source ; date_consultation ; note | — | réservée aux références citées (table posée, interface à venir) |
| **Échange IA** | fournisseur, question, perimetre (JSON), reponse (JSON ReponseIA), modele, acteur_id | — | → dossier |
| **Journal d'audit** | nom_entite, entite_id, action ∈ ref_action_audit, acteur_id, dossier_id, motif, changements (JSON), dt_evenement | — (ajout seul, déclencheurs) | toutes entités |

## Statut de provenance : règles (domaine, redites en base)

1. valeur absente ⇔ confiance « à renseigner », sans source ;
2. valeur présente ⇒ source obligatoire, confiance ≠ « à renseigner » ;
3. source estimation ⇒ jamais « connu » ;
4. source suggestion de l'IA ⇒ toujours « à confirmer » tant qu'un humain n'a pas validé (la validation d'une extraction écrit alors source `import`, confiance `connu`) ;
5. source externe (annonce, dire d'un professionnel) ⇒ au mieux « à confirmer » sans pièce.

Confiance par défaut : saisie → connu ; import → connu ; estimation → estimé ; externe → à confirmer ;
IA → à confirmer. L'utilisateur peut toujours abaisser la confiance, jamais contourner les règles.

## Exemple d'affichage attendu

- « 92 m² — source : document importé (plan du 12/03/2027), statut : connu »
- « 18 000,00 € — source : estimation (devis non reçu), statut : à confirmer »
- « À renseigner » (jamais « 0 »).
