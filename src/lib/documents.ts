// Documents et photos — priorité 2 (« photos et fichiers, classement ») et priorité 4 (« devis,
// factures et paiements reliés au dossier »).
//
// Le fichier original est copié tel quel sous `data/fichiers/<dossier>/<uuid>.<ext>` (hors git),
// nommé par identifiant — jamais par son nom d'origine (qui peut contenir une adresse ou un nom).
// Sa somme de contrôle SHA-256 permet de vérifier plus tard qu'il n'a pas été altéré.
//
// Extraction (principe « validation avant effet ») : les champs lus sur un devis ou une facture
// (montant, date, fournisseur, poste, nature) sont d'abord PROPOSÉS — par un humain qui lit la
// pièce, ou par l'assistant IA s'il est activé — puis VALIDÉS ou CORRIGÉS. Seule la validation
// crée une ligne de budget, avec source « pièce importée » et un lien vers le document.

import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cheminFichiers, obtenirBase, transaction, versObjet, versObjets } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { exiger, type Acteur } from "./acces";
import { interdit, invalide } from "./erreurs";
import { ajouterLigne, creerPoste, lirePosteBrut, type LigneBudget, type PosteBudget } from "./budget";
import { parserMontant } from "./montant";
import { estTypeMontant } from "../domain/budget";
import type { Source } from "../domain/provenance";

export type Document = {
  id: string;
  dossierId: string;
  nomOriginal: string;
  typeDocument: string;
  mime: string;
  tailleOctets: number;
  sha256: string;
  cheminRelatif: string;
  dateDocument: string | null;
  source: string;
  lieuId: string | null;
  batimentId: string | null;
  pieceId: string | null;
  scenarioId: string | null;
  posteId: string | null;
  ideeId: string | null;
  tacheId: string | null;
  note: string | null;
  deposePar: string | null;
  createdAt: string;
};

export type ChampExtraction = "montant_centimes" | "date" | "fournisseur" | "poste" | "type_montant";
export const CHAMPS_EXTRACTION: ChampExtraction[] = ["montant_centimes", "date", "fournisseur", "poste", "type_montant"];

export type Extraction = {
  id: string;
  documentId: string;
  champ: ChampExtraction;
  valeurProposee: string | null;
  valeurValidee: string | null;
  source: Source;
  confiance: string;
  statut: string;
  valideePar: string | null;
  valideeLe: string | null;
  createdAt: string;
};

const COLONNES_DOC = `id, dossier_id, nom_original, type_document, mime, taille_octets, sha256, chemin_relatif, date_document, source,
  lieu_id, batiment_id, piece_id, scenario_id, poste_id, idee_id, tache_id, note, depose_par, created_at`;
const COLONNES_EXTR = `id, document_id, champ, valeur_proposee, valeur_validee, source, confiance, statut, validee_par, validee_le, created_at`;

const MIMES_AUTORISES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf", "text/plain"]);
const TAILLE_MAX_OCTETS = Number.parseInt(process.env.ASSISTANT_FICHIER_MAX_OCTETS ?? String(20 * 1024 * 1024), 10);

export function lireDocumentBrut(id: string): Document {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_DOC} FROM document WHERE id = ?`).get(id);
  if (!ligne) throw interdit();
  return versObjet<Document>(ligne as Record<string, unknown>);
}

export function listerDocuments(acteur: Acteur, dossierId: string): Document[] {
  exiger(acteur, dossierId, "lire", "documents");
  return versObjets<Document>(obtenirBase().prepare(`SELECT ${COLONNES_DOC} FROM document WHERE dossier_id = ? ORDER BY created_at DESC`).all(dossierId));
}

export function obtenirDocument(acteur: Acteur, id: string): Document {
  const d = lireDocumentBrut(id);
  exiger(acteur, d.dossierId, "lire", "documents");
  return d;
}

/** Chemin absolu du fichier d'un document, après contrôle des droits (pour le servir). */
export function cheminAbsoluDocument(acteur: Acteur, id: string): { chemin: string; mime: string; nom: string } {
  const d = obtenirDocument(acteur, id);
  return { chemin: path.join(cheminFichiers(), d.cheminRelatif), mime: d.mime, nom: d.nomOriginal };
}

type Rattachements = Partial<Pick<Document, "lieuId" | "batimentId" | "pieceId" | "scenarioId" | "posteId" | "ideeId" | "tacheId">>;

function verifierRattachements(dossierId: string, r: Rattachements): Rattachements {
  const db = obtenirBase();
  const tables: Array<[keyof Rattachements, string]> = [
    ["lieuId", "lieu"],
    ["batimentId", "batiment"],
    ["pieceId", "piece"],
    ["scenarioId", "scenario"],
    ["posteId", "poste_budget"],
    ["ideeId", "idee"],
    ["tacheId", "tache"],
  ];
  const propre: Rattachements = {};
  for (const [cle, table] of tables) {
    const id = r[cle];
    if (!id) {
      propre[cle] = null;
      continue;
    }
    const ligne = db.prepare(`SELECT dossier_id FROM ${table} WHERE id = ?`).get(id) as { dossier_id: string } | undefined;
    if (!ligne || ligne.dossier_id !== dossierId) throw invalide(`L'élément rattaché (${table}) n'appartient pas à ce dossier.`);
    propre[cle] = id;
  }
  return propre;
}

export function deposerDocument(
  acteur: Acteur,
  params: {
    dossierId: string;
    nomOriginal: string;
    mime: string;
    octets: Buffer;
    typeDocument: string;
    dateDocument?: string | null;
    note?: string;
  } & Rattachements,
): Document {
  exiger(acteur, params.dossierId, "ecrire", "documents");
  if (!MIMES_AUTORISES.has(params.mime)) throw invalide(`Type de fichier non accepté : ${params.mime}. Acceptés : images (JPEG, PNG, WebP, HEIC), PDF, texte.`);
  if (params.octets.length === 0) throw invalide("Le fichier est vide.");
  if (params.octets.length > TAILLE_MAX_OCTETS) throw invalide(`Fichier trop volumineux (max ${Math.round(TAILLE_MAX_OCTETS / 1024 / 1024)} Mo).`);
  if (params.dateDocument && !/^\d{4}-\d{2}-\d{2}$/.test(params.dateDocument)) throw invalide("La date du document doit être au format AAAA-MM-JJ.");
  const rattachements = verifierRattachements(params.dossierId, params);

  const id = randomUUID();
  const extension = path.extname(params.nomOriginal).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  const cheminRelatif = path.join(params.dossierId, `${id}${extension}`);
  const sha256 = createHash("sha256").update(params.octets).digest("hex");

  // Écriture du fichier AVANT la transaction : si la base échoue, un fichier orphelin est
  // préférable à une ligne qui pointe vers rien (il sera signalé par la procédure de sauvegarde).
  const absolu = path.join(cheminFichiers(), cheminRelatif);
  mkdirSync(path.dirname(absolu), { recursive: true });
  writeFileSync(absolu, params.octets, { flag: "wx" });

  return transaction((db) => {
    db.prepare(
      `INSERT INTO document (id, dossier_id, nom_original, type_document, mime, taille_octets, sha256, chemin_relatif, date_document,
         lieu_id, batiment_id, piece_id, scenario_id, poste_id, idee_id, tache_id, note, depose_par)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.dossierId,
      params.nomOriginal.slice(0, 200),
      params.typeDocument,
      params.mime,
      params.octets.length,
      sha256,
      cheminRelatif,
      params.dateDocument || null,
      rattachements.lieuId ?? null,
      rattachements.batimentId ?? null,
      rattachements.pieceId ?? null,
      rattachements.scenarioId ?? null,
      rattachements.posteId ?? null,
      rattachements.ideeId ?? null,
      rattachements.tacheId ?? null,
      params.note?.trim() || null,
      acteur.personneId,
    );
    enregistrerEvenement(db, { nomEntite: "document", entiteId: id, action: "creation", acteurId: acteur.personneId, dossierId: params.dossierId });
    return lireDocumentBrut(id);
  });
}

// --- Extraction ------------------------------------------------------------------------------------------

export function listerExtractions(acteur: Acteur, documentId: string): Extraction[] {
  const d = lireDocumentBrut(documentId);
  exiger(acteur, d.dossierId, "lire", "documents");
  return versObjets<Extraction>(obtenirBase().prepare(`SELECT ${COLONNES_EXTR} FROM extraction_document WHERE document_id = ? ORDER BY created_at`).all(documentId));
}

/**
 * Propose des champs lus sur le document. `source` = « saisie » quand un humain lit la pièce,
 * « suggestion_ia » quand l'assistant les propose. Dans les deux cas le statut est « proposée » :
 * rien n'entre au budget avant validation.
 */
export function proposerExtraction(
  acteur: Acteur,
  params: { documentId: string; champs: Partial<Record<ChampExtraction, string>>; source: "saisie" | "suggestion_ia" },
): Extraction[] {
  const d = lireDocumentBrut(params.documentId);
  exiger(acteur, d.dossierId, "ecrire", "documents");
  const entrees = Object.entries(params.champs).filter(([champ, v]) => CHAMPS_EXTRACTION.includes(champ as ChampExtraction) && v !== undefined && v.trim() !== "");
  if (entrees.length === 0) throw invalide("Aucun champ proposé.");

  return transaction((db) => {
    // Une nouvelle proposition remplace les propositions non validées précédentes.
    db.prepare(`DELETE FROM extraction_document WHERE document_id = ? AND statut = 'proposee'`).run(params.documentId);
    for (const [champ, valeur] of entrees) {
      db.prepare(`INSERT INTO extraction_document (id, document_id, champ, valeur_proposee, source, confiance) VALUES (?, ?, ?, ?, ?, 'a_confirmer')`).run(
        randomUUID(),
        params.documentId,
        champ,
        valeur!.trim(),
        params.source,
      );
    }
    enregistrerEvenement(db, {
      nomEntite: "document",
      entiteId: params.documentId,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: d.dossierId,
      motif: `Extraction proposée (${params.source})`,
      changements: entrees.map(([champ, valeur]) => ({ champ, avant: null, apres: valeur!.trim() })),
    });
    return versObjets<Extraction>(db.prepare(`SELECT ${COLONNES_EXTR} FROM extraction_document WHERE document_id = ? ORDER BY created_at`).all(params.documentId));
  });
}

/**
 * Valide (ou corrige puis valide) les champs proposés, et crée la ligne de budget correspondante :
 * source « pièce importée », statut « connu », reliée au document. Si le poste n'existe pas dans le
 * scénario de rattachement, il est créé. Un document sans scénario ni poste ne peut pas alimenter
 * le budget : il faut d'abord le rattacher.
 */
export function validerExtraction(
  acteur: Acteur,
  params: { documentId: string; corrections: Partial<Record<ChampExtraction, string>>; motif?: string },
): { extractions: Extraction[]; ligne: LigneBudget | null } {
  const d = lireDocumentBrut(params.documentId);
  exiger(acteur, d.dossierId, "ecrire", "documents");
  exiger(acteur, d.dossierId, "ecrire", "budget");

  const proposees = versObjets<Extraction>(
    obtenirBase().prepare(`SELECT ${COLONNES_EXTR} FROM extraction_document WHERE document_id = ? AND statut = 'proposee'`).all(params.documentId),
  );
  if (proposees.length === 0) throw invalide("Aucune extraction en attente de validation sur ce document.");

  // Valeurs finales = corrections si fournies, sinon valeurs proposées.
  const finales: Partial<Record<ChampExtraction, string>> = {};
  for (const e of proposees) finales[e.champ] = e.valeurProposee ?? undefined;
  // Une correction vide n'est pas une correction : on garde la valeur proposée.
  for (const [champ, v] of Object.entries(params.corrections)) {
    if (CHAMPS_EXTRACTION.includes(champ as ChampExtraction) && v !== undefined && v.trim() !== "") finales[champ as ChampExtraction] = v.trim();
  }

  const montantCentimes = finales.montant_centimes ? parserMontant(finales.montant_centimes) : null;
  if (finales.montant_centimes && montantCentimes === null) throw invalide(`Montant invalide : « ${finales.montant_centimes} »`);
  if (finales.date && !/^\d{4}-\d{2}-\d{2}$/.test(finales.date)) throw invalide("La date doit être au format AAAA-MM-JJ.");
  // Nature : celle proposée/corrigée, sinon déduite du type de document (devis → devis, facture → facture).
  const typeMontant = finales.type_montant || (d.typeDocument === "devis" ? "devis" : d.typeDocument === "facture" ? "facture" : null);
  if (montantCentimes !== null && (!typeMontant || !estTypeMontant(typeMontant))) throw invalide("Indiquez la nature du montant (devis, facture, paiement…).");
  if (typeMontant === "estimation") throw invalide("Un document importé ne produit pas une estimation : choisissez devis, facture, engagement ou paiement.");

  return transaction((db) => {
    const maintenant = new Date().toISOString();
    for (const e of proposees) {
      const finale = finales[e.champ] ?? null;
      const corrigee = finale !== (e.valeurProposee ?? null);
      db.prepare(`UPDATE extraction_document SET valeur_validee = ?, statut = ?, confiance = 'connu', validee_par = ?, validee_le = ? WHERE id = ?`).run(
        finale,
        corrigee ? "corrigee" : "validee",
        acteur.personneId,
        maintenant,
        e.id,
      );
    }
    enregistrerEvenement(db, {
      nomEntite: "document",
      entiteId: params.documentId,
      action: "validation",
      acteurId: acteur.personneId,
      dossierId: d.dossierId,
      motif: params.motif?.trim() || "Extraction validée",
      changements: proposees.map((e) => ({ champ: e.champ, avant: e.valeurProposee, apres: finales[e.champ] ?? null })),
    });

    let ligne: LigneBudget | null = null;
    if (montantCentimes !== null && typeMontant && estTypeMontant(typeMontant)) {
      let poste: PosteBudget | null = d.posteId ? lirePosteBrut(d.posteId) : null;
      if (!poste) {
        const nomPoste = finales.poste?.trim();
        if (!d.scenarioId || !nomPoste) {
          throw invalide("Pour alimenter le budget, le document doit être rattaché à un scénario et indiquer un poste.");
        }
        const existant = db.prepare(`SELECT id FROM poste_budget WHERE scenario_id = ? AND nom = ?`).get(d.scenarioId, nomPoste) as { id: string } | undefined;
        poste = existant ? lirePosteBrut(existant.id) : creerPoste(acteur, { scenarioId: d.scenarioId, nom: nomPoste });
        db.prepare(`UPDATE document SET poste_id = ? WHERE id = ?`).run(poste.id, params.documentId);
      }
      ligne = ajouterLigne(acteur, {
        posteId: poste.id,
        montantCentimes,
        typeMontant,
        source: "import",
        confiance: "connu",
        documentId: params.documentId,
        datePiece: finales.date || d.dateDocument,
        fournisseur: finales.fournisseur || null,
        motif: `Depuis le document « ${d.nomOriginal} »`,
      });
    }
    return {
      extractions: versObjets<Extraction>(db.prepare(`SELECT ${COLONNES_EXTR} FROM extraction_document WHERE document_id = ? ORDER BY created_at`).all(params.documentId)),
      ligne,
    };
  });
}

/** Vérifie que le fichier d'un document est toujours présent et intact (procédure de sauvegarde). */
export function verifierIntegrite(acteur: Acteur, dossierId: string): Array<{ documentId: string; nom: string; probleme: string }> {
  const problemes: Array<{ documentId: string; nom: string; probleme: string }> = [];
  for (const d of listerDocuments(acteur, dossierId)) {
    const absolu = path.join(cheminFichiers(), d.cheminRelatif);
    if (!existsSync(absolu)) {
      problemes.push({ documentId: d.id, nom: d.nomOriginal, probleme: "fichier absent" });
      continue;
    }
    const hash = createHash("sha256").update(readFileSync(absolu)).digest("hex");
    if (hash !== d.sha256) problemes.push({ documentId: d.id, nom: d.nomOriginal, probleme: "somme de contrôle différente" });
  }
  return problemes;
}
