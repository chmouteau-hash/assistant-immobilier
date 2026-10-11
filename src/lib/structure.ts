// Lieux (biens, terrains), bâtiments, pièces — priorité 1 (« ajouter… lieux, bâtiments, pièces »)
// et priorité 2 (saisie structurée avec statuts connu / estimé / à confirmer / à renseigner).
//
// Les surfaces et adresses sont des `ValeurTracee` : valeur + source + confiance, validées par
// le domaine AVANT d'être écrites, et re-vérifiées par les CHECK de la base.

import { randomUUID } from "node:crypto";
import { obtenirBase, transaction, versObjet, versObjets } from "./db/client";
import { enregistrerEvenement } from "./db/audit";
import { exiger, type Acteur } from "./acces";
import { interdit, invalide } from "./erreurs";
import {
  aRenseigner,
  confianceParDefaut,
  estConfiance,
  estSource,
  validerValeurTracee,
  type Confiance,
  type Source,
  type ValeurTracee,
} from "../domain/provenance";

export type Lieu = {
  id: string;
  dossierId: string;
  nom: string;
  typeLieu: string;
  adresse: ValeurTracee<string>;
  parcelle: string | null;
  description: string | null;
  source: string;
  createdAt: string;
};

export type Batiment = {
  id: string;
  dossierId: string;
  lieuId: string | null;
  nom: string;
  type: string | null;
  usageActuel: string | null;
  usageEnvisage: string | null;
  etat: string | null;
  description: string | null;
  source: string;
  createdAt: string;
};

export type Piece = {
  id: string;
  dossierId: string;
  batimentId: string;
  nom: string;
  usage: string | null;
  surface: ValeurTracee<number>; // centièmes de m²
  description: string | null;
  createdAt: string;
};

/**
 * Construit et VALIDE une valeur tracée à partir d'une saisie de formulaire. Une saisie vide donne
 * « à renseigner » ; une saisie non vide exige une source ; la confiance par défaut découle de la
 * source. Lève `VALIDATION` si la combinaison viole les règles du domaine.
 */
export function construireValeurTracee<T>(
  valeur: T | null,
  sourceBrute: string | null | undefined,
  confianceBrute: string | null | undefined,
  note?: string | null,
): ValeurTracee<T> {
  if (valeur === null) return aRenseigner<T>();
  if (!sourceBrute || !estSource(sourceBrute)) throw invalide("Dites d'où vient cette information (saisie, document importé, estimation…).");
  const source: Source = sourceBrute;
  const confiance: Confiance = confianceBrute && estConfiance(confianceBrute) ? confianceBrute : confianceParDefaut(source);
  const v: ValeurTracee<T> = { valeur, source, confiance, note: note ?? null };
  const verdict = validerValeurTracee(v);
  if (!verdict.valide) throw invalide(verdict.motif);
  return v;
}

// --- Lieux -----------------------------------------------------------------------------------------

type LieuBrut = {
  id: string;
  dossierId: string;
  nom: string;
  typeLieu: string;
  adresse: string | null;
  adresseSource: Source | null;
  adresseConfiance: Confiance;
  parcelle: string | null;
  description: string | null;
  source: string;
  createdAt: string;
};
const COLONNES_LIEU = `id, dossier_id, nom, type_lieu, adresse, adresse_source, adresse_confiance, parcelle, description, source, created_at`;

function hydraterLieu(ligne: unknown): Lieu {
  const b = versObjet<LieuBrut>(ligne as Record<string, unknown>);
  return {
    id: b.id,
    dossierId: b.dossierId,
    nom: b.nom,
    typeLieu: b.typeLieu,
    adresse: { valeur: b.adresse, source: b.adresseSource, confiance: b.adresseConfiance },
    parcelle: b.parcelle,
    description: b.description,
    source: b.source,
    createdAt: b.createdAt,
  };
}

export function listerLieux(acteur: Acteur, dossierId: string): Lieu[] {
  exiger(acteur, dossierId, "lire", "lieux");
  return (obtenirBase().prepare(`SELECT ${COLONNES_LIEU} FROM lieu WHERE dossier_id = ? ORDER BY created_at`).all(dossierId) as unknown[]).map(hydraterLieu);
}

export function creerLieu(
  acteur: Acteur,
  params: {
    dossierId: string;
    nom: string;
    typeLieu: string;
    adresse?: string;
    adresseSource?: string;
    adresseConfiance?: string;
    parcelle?: string;
    description?: string;
  },
): Lieu {
  exiger(acteur, params.dossierId, "ecrire", "lieux");
  const nom = params.nom.trim();
  if (nom === "") throw invalide("Le nom du lieu est obligatoire.");
  const adresse = construireValeurTracee<string>(params.adresse?.trim() || null, params.adresseSource, params.adresseConfiance);

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO lieu (id, dossier_id, nom, type_lieu, adresse, adresse_source, adresse_confiance, parcelle, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, params.dossierId, nom, params.typeLieu, adresse.valeur, adresse.source, adresse.confiance, params.parcelle?.trim() || null, params.description?.trim() || null);
    enregistrerEvenement(db, { nomEntite: "lieu", entiteId: id, action: "creation", acteurId: acteur.personneId, dossierId: params.dossierId });
    return hydraterLieu(db.prepare(`SELECT ${COLONNES_LIEU} FROM lieu WHERE id = ?`).get(id));
  });
}

export function modifierAdresseLieu(
  acteur: Acteur,
  params: { lieuId: string; adresse: string; adresseSource?: string; adresseConfiance?: string; motif?: string },
): Lieu {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_LIEU} FROM lieu WHERE id = ?`).get(params.lieuId);
  if (!ligne) throw interdit();
  const avant = hydraterLieu(ligne);
  exiger(acteur, avant.dossierId, "ecrire", "lieux");
  const adresse = construireValeurTracee<string>(params.adresse.trim() || null, params.adresseSource, params.adresseConfiance);

  return transaction((db) => {
    db.prepare(`UPDATE lieu SET adresse = ?, adresse_source = ?, adresse_confiance = ? WHERE id = ?`).run(
      adresse.valeur,
      adresse.source,
      adresse.confiance,
      params.lieuId,
    );
    enregistrerEvenement(db, {
      nomEntite: "lieu",
      entiteId: params.lieuId,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      motif: params.motif?.trim() || undefined,
      changements: [
        { champ: "adresse", avant: avant.adresse.valeur, apres: adresse.valeur },
        { champ: "adresse_source", avant: avant.adresse.source, apres: adresse.source },
        { champ: "adresse_confiance", avant: avant.adresse.confiance, apres: adresse.confiance },
      ],
    });
    return hydraterLieu(db.prepare(`SELECT ${COLONNES_LIEU} FROM lieu WHERE id = ?`).get(params.lieuId));
  });
}

// --- Bâtiments -------------------------------------------------------------------------------------

const COLONNES_BATIMENT = `id, dossier_id, lieu_id, nom, type, usage_actuel, usage_envisage, etat, description, source, created_at`;

export function listerBatiments(acteur: Acteur, dossierId: string): Batiment[] {
  exiger(acteur, dossierId, "lire", "lieux");
  return versObjets<Batiment>(
    obtenirBase().prepare(`SELECT ${COLONNES_BATIMENT} FROM batiment WHERE dossier_id = ? ORDER BY created_at`).all(dossierId),
  );
}

export function creerBatiment(
  acteur: Acteur,
  params: {
    dossierId: string;
    lieuId?: string | null;
    nom: string;
    type?: string;
    usageActuel?: string;
    usageEnvisage?: string;
    etat?: string;
    description?: string;
  },
): Batiment {
  exiger(acteur, params.dossierId, "ecrire", "lieux");
  const nom = params.nom.trim();
  if (nom === "") throw invalide("Le nom du bâtiment est obligatoire.");
  if (params.lieuId) {
    const lieu = obtenirBase().prepare(`SELECT dossier_id FROM lieu WHERE id = ?`).get(params.lieuId) as { dossier_id: string } | undefined;
    if (!lieu || lieu.dossier_id !== params.dossierId) throw invalide("Le lieu indiqué n'appartient pas à ce dossier.");
  }

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO batiment (id, dossier_id, lieu_id, nom, type, usage_actuel, usage_envisage, etat, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.dossierId,
      params.lieuId || null,
      nom,
      params.type?.trim() || null,
      params.usageActuel?.trim() || null,
      params.usageEnvisage?.trim() || null,
      params.etat?.trim() || null,
      params.description?.trim() || null,
    );
    enregistrerEvenement(db, { nomEntite: "batiment", entiteId: id, action: "creation", acteurId: acteur.personneId, dossierId: params.dossierId });
    return versObjet<Batiment>(db.prepare(`SELECT ${COLONNES_BATIMENT} FROM batiment WHERE id = ?`).get(id) as Record<string, unknown>);
  });
}

/**
 * Rattacher un bâtiment à un lieu, ou le changer de lieu : même droit et même garde-fou qu'à la
 * création, tracé avec avant/après. Sans effet si le lieu ne change pas.
 */
export function rattacherBatiment(acteur: Acteur, params: { batimentId: string; lieuId: string }): Batiment {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_BATIMENT} FROM batiment WHERE id = ?`).get(params.batimentId);
  if (!ligne) throw interdit();
  const avant = versObjet<Batiment>(ligne as Record<string, unknown>);
  exiger(acteur, avant.dossierId, "ecrire", "lieux");
  if (params.lieuId === "") throw invalide("Choisissez le lieu auquel rattacher le bâtiment.");
  const lieu = obtenirBase().prepare(`SELECT dossier_id FROM lieu WHERE id = ?`).get(params.lieuId) as { dossier_id: string } | undefined;
  if (!lieu || lieu.dossier_id !== avant.dossierId) throw invalide("Le lieu indiqué n'appartient pas à ce dossier.");
  if (params.lieuId === avant.lieuId) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE batiment SET lieu_id = ? WHERE id = ?`).run(params.lieuId, params.batimentId);
    enregistrerEvenement(db, {
      nomEntite: "batiment",
      entiteId: params.batimentId,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      changements: [{ champ: "lieu_id", avant: avant.lieuId, apres: params.lieuId }],
    });
    return versObjet<Batiment>(db.prepare(`SELECT ${COLONNES_BATIMENT} FROM batiment WHERE id = ?`).get(params.batimentId) as Record<string, unknown>);
  });
}

// --- Pièces ------------------------------------------------------------------------------------------

type PieceBrute = {
  id: string;
  dossierId: string;
  batimentId: string;
  nom: string;
  usage: string | null;
  surfaceCentiemes: number | null;
  surfaceSource: Source | null;
  surfaceConfiance: Confiance;
  surfaceDocumentId: string | null;
  description: string | null;
  createdAt: string;
};
const COLONNES_PIECE = `id, dossier_id, batiment_id, nom, usage, surface_centiemes, surface_source, surface_confiance, surface_document_id, description, created_at`;

function hydraterPiece(ligne: unknown): Piece {
  const b = versObjet<PieceBrute>(ligne as Record<string, unknown>);
  return {
    id: b.id,
    dossierId: b.dossierId,
    batimentId: b.batimentId,
    nom: b.nom,
    usage: b.usage,
    surface: { valeur: b.surfaceCentiemes, source: b.surfaceSource, confiance: b.surfaceConfiance, documentId: b.surfaceDocumentId },
    description: b.description,
    createdAt: b.createdAt,
  };
}

export function listerPieces(acteur: Acteur, dossierId: string): Piece[] {
  exiger(acteur, dossierId, "lire", "lieux");
  return (obtenirBase().prepare(`SELECT ${COLONNES_PIECE} FROM piece WHERE dossier_id = ? ORDER BY created_at`).all(dossierId) as unknown[]).map(hydraterPiece);
}

export function creerPiece(
  acteur: Acteur,
  params: {
    dossierId: string;
    batimentId: string;
    nom: string;
    usage?: string;
    surfaceCentiemes?: number | null;
    surfaceSource?: string;
    surfaceConfiance?: string;
    surfaceDocumentId?: string | null;
    description?: string;
  },
): Piece {
  exiger(acteur, params.dossierId, "ecrire", "lieux");
  const nom = params.nom.trim();
  if (nom === "") throw invalide("Le nom de la pièce est obligatoire.");
  const bat = obtenirBase().prepare(`SELECT dossier_id FROM batiment WHERE id = ?`).get(params.batimentId) as { dossier_id: string } | undefined;
  if (!bat || bat.dossier_id !== params.dossierId) throw invalide("Le bâtiment indiqué n'appartient pas à ce dossier.");
  if (params.surfaceCentiemes !== null && params.surfaceCentiemes !== undefined && (!Number.isInteger(params.surfaceCentiemes) || params.surfaceCentiemes <= 0)) {
    throw invalide("La surface doit être un nombre positif (en m², deux décimales au plus).");
  }
  const surface = construireValeurTracee<number>(params.surfaceCentiemes ?? null, params.surfaceSource, params.surfaceConfiance);

  return transaction((db) => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO piece (id, dossier_id, batiment_id, nom, usage, surface_centiemes, surface_source, surface_confiance, surface_document_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.dossierId,
      params.batimentId,
      nom,
      params.usage?.trim() || null,
      surface.valeur,
      surface.source,
      surface.confiance,
      surface.valeur === null ? null : params.surfaceDocumentId || null,
      params.description?.trim() || null,
    );
    enregistrerEvenement(db, {
      nomEntite: "piece",
      entiteId: id,
      action: "creation",
      acteurId: acteur.personneId,
      dossierId: params.dossierId,
      changements: [
        { champ: "surface_centiemes", avant: null, apres: surface.valeur },
        { champ: "surface_source", avant: null, apres: surface.source },
        { champ: "surface_confiance", avant: null, apres: surface.confiance },
      ],
    });
    return hydraterPiece(db.prepare(`SELECT ${COLONNES_PIECE} FROM piece WHERE id = ?`).get(id));
  });
}

/** Changer la surface d'une pièce = changer une provenance : tracé avec avant/après. */
export function modifierSurfacePiece(
  acteur: Acteur,
  params: { pieceId: string; surfaceCentiemes: number | null; surfaceSource?: string; surfaceConfiance?: string; surfaceDocumentId?: string | null; motif?: string },
): Piece {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_PIECE} FROM piece WHERE id = ?`).get(params.pieceId);
  if (!ligne) throw interdit();
  const avant = hydraterPiece(ligne);
  exiger(acteur, avant.dossierId, "ecrire", "lieux");
  if (params.surfaceCentiemes !== null && (!Number.isInteger(params.surfaceCentiemes) || params.surfaceCentiemes <= 0)) {
    throw invalide("La surface doit être un nombre positif (en m², deux décimales au plus).");
  }
  const surface = construireValeurTracee<number>(params.surfaceCentiemes, params.surfaceSource, params.surfaceConfiance);

  return transaction((db) => {
    db.prepare(`UPDATE piece SET surface_centiemes = ?, surface_source = ?, surface_confiance = ?, surface_document_id = ? WHERE id = ?`).run(
      surface.valeur,
      surface.source,
      surface.confiance,
      surface.valeur === null ? null : params.surfaceDocumentId || null,
      params.pieceId,
    );
    enregistrerEvenement(db, {
      nomEntite: "piece",
      entiteId: params.pieceId,
      action: "modification",
      acteurId: acteur.personneId,
      dossierId: avant.dossierId,
      motif: params.motif?.trim() || undefined,
      changements: [
        { champ: "surface_centiemes", avant: avant.surface.valeur, apres: surface.valeur },
        { champ: "surface_source", avant: avant.surface.source, apres: surface.source },
        { champ: "surface_confiance", avant: avant.surface.confiance, apres: surface.confiance },
      ],
    });
    return hydraterPiece(db.prepare(`SELECT ${COLONNES_PIECE} FROM piece WHERE id = ?`).get(params.pieceId));
  });
}
