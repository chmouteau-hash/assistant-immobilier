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
import { validerPosition, type Position } from "../domain/geo";

export type Lieu = {
  id: string;
  dossierId: string;
  nom: string;
  typeLieu: string;
  adresse: ValeurTracee<string>;
  /** Repère sur la carte, en microdegrés. `note` : ce que le service d'adresses a compris, s'il a servi. */
  position: ValeurTracee<Position>;
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

// --- Garde-fous partagés par la création et la correction ---------------------------------------------

function nomExige(saisie: string, message: string): string {
  const nom = saisie.trim();
  if (nom === "") throw invalide(message);
  return nom;
}

function exigerTypeLieu(code: string): void {
  if (!obtenirBase().prepare(`SELECT 1 FROM ref_type_lieu WHERE code = ?`).get(code)) throw invalide("Type de lieu inconnu.");
}

export function exigerBatimentDuDossier(batimentId: string, dossierId: string): void {
  const bat = obtenirBase().prepare(`SELECT dossier_id FROM batiment WHERE id = ?`).get(batimentId) as { dossier_id: string } | undefined;
  if (!bat || bat.dossier_id !== dossierId) throw invalide("Le bâtiment indiqué n'appartient pas à ce dossier.");
}

/** Texte facultatif d'un formulaire : absent = inchangé, vide = redevient inconnu. */
function texteFacultatif(saisie: string | undefined, avant: string | null): string | null {
  return saisie === undefined ? avant : saisie.trim() || null;
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
  latitudeMicrodeg: number | null;
  longitudeMicrodeg: number | null;
  positionSource: Source | null;
  positionConfiance: Confiance;
  positionNote: string | null;
  parcelle: string | null;
  description: string | null;
  source: string;
  createdAt: string;
};
const COLONNES_LIEU = `id, dossier_id, nom, type_lieu, adresse, adresse_source, adresse_confiance,
  latitude_microdeg, longitude_microdeg, position_source, position_confiance, position_note, parcelle, description, source, created_at`;

function hydraterLieu(ligne: unknown): Lieu {
  const b = versObjet<LieuBrut>(ligne as Record<string, unknown>);
  const position = b.latitudeMicrodeg === null || b.longitudeMicrodeg === null ? null : { latitudeMicrodeg: b.latitudeMicrodeg, longitudeMicrodeg: b.longitudeMicrodeg };
  return {
    id: b.id,
    dossierId: b.dossierId,
    nom: b.nom,
    typeLieu: b.typeLieu,
    adresse: { valeur: b.adresse, source: b.adresseSource, confiance: b.adresseConfiance },
    position: { valeur: position, source: b.positionSource, confiance: b.positionConfiance, note: b.positionNote },
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

/** Un lieu par identifiant. Inconnu ou hors de portée de l'acteur : même refus, rien ne fuit. */
export function obtenirLieu(acteur: Acteur, lieuId: string): Lieu {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_LIEU} FROM lieu WHERE id = ?`).get(lieuId);
  if (!ligne) throw interdit();
  const lieu = hydraterLieu(ligne);
  exiger(acteur, lieu.dossierId, "lire", "lieux");
  return lieu;
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
  const nom = nomExige(params.nom, "Le nom du lieu est obligatoire.");
  exigerTypeLieu(params.typeLieu);
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

/**
 * Poser, déplacer ou effacer le repère d'un lieu sur la carte. Les deux coordonnées vont ensemble :
 * toutes deux données (en microdegrés entiers), ou aucune (« à renseigner »). Comme l'adresse,
 * c'est une provenance : source et confiance obligatoires dès qu'une position existe, tracé avec
 * avant/après. `note` dit d'après quoi le repère a été posé (l'adresse comprise par le service
 * d'adresses) ; absente, elle est effacée : une position déplacée à la main n'est plus celle du
 * service.
 */
export function modifierPositionLieu(
  acteur: Acteur,
  params: {
    lieuId: string;
    latitudeMicrodeg: number | null;
    longitudeMicrodeg: number | null;
    positionSource?: string;
    positionConfiance?: string;
    note?: string | null;
    motif?: string;
  },
): Lieu {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_LIEU} FROM lieu WHERE id = ?`).get(params.lieuId);
  if (!ligne) throw interdit();
  const avant = hydraterLieu(ligne);
  exiger(acteur, avant.dossierId, "ecrire", "lieux");
  if ((params.latitudeMicrodeg === null) !== (params.longitudeMicrodeg === null)) {
    throw invalide("Indiquez la latitude et la longitude, ou aucune des deux (position à renseigner).");
  }
  let valeur: Position | null = null;
  if (params.latitudeMicrodeg !== null && params.longitudeMicrodeg !== null) {
    valeur = { latitudeMicrodeg: params.latitudeMicrodeg, longitudeMicrodeg: params.longitudeMicrodeg };
    const verdict = validerPosition(valeur);
    if (!verdict.valide) throw invalide(verdict.motif);
  }
  const position = construireValeurTracee<Position>(valeur, params.positionSource, params.positionConfiance, valeur === null ? null : params.note?.trim() || null);

  return transaction((db) => {
    db.prepare(`UPDATE lieu SET latitude_microdeg = ?, longitude_microdeg = ?, position_source = ?, position_confiance = ?, position_note = ? WHERE id = ?`).run(
      position.valeur?.latitudeMicrodeg ?? null,
      position.valeur?.longitudeMicrodeg ?? null,
      position.source,
      position.confiance,
      position.note ?? null,
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
        { champ: "latitude_microdeg", avant: avant.position.valeur?.latitudeMicrodeg ?? null, apres: position.valeur?.latitudeMicrodeg ?? null },
        { champ: "longitude_microdeg", avant: avant.position.valeur?.longitudeMicrodeg ?? null, apres: position.valeur?.longitudeMicrodeg ?? null },
        { champ: "position_source", avant: avant.position.source, apres: position.source },
        { champ: "position_confiance", avant: avant.position.confiance, apres: position.confiance },
        // La note n'existe que pour une position venue du service d'adresses : elle ne s'écrit au
        // journal que si elle change, pour ne pas y laisser une ligne « — → — » à chaque déplacement.
        ...((avant.position.note ?? null) === (position.note ?? null) ? [] : [{ champ: "position_note", avant: avant.position.note ?? null, apres: position.note ?? null }]),
      ],
    });
    return hydraterLieu(db.prepare(`SELECT ${COLONNES_LIEU} FROM lieu WHERE id = ?`).get(params.lieuId));
  });
}

/**
 * Corriger un lieu après sa création : nom, type, parcelle, description. Un champ absent ne change
 * pas, un champ facultatif vidé redevient inconnu, seuls les champs changés sont tracés. L'adresse
 * et la position portent une provenance : chacune garde son propre formulaire
 * (`modifierAdresseLieu`, `modifierPositionLieu`).
 */
export function modifierLieu(acteur: Acteur, params: { lieuId: string; nom?: string; typeLieu?: string; parcelle?: string; description?: string }): Lieu {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_LIEU} FROM lieu WHERE id = ?`).get(params.lieuId);
  if (!ligne) throw interdit();
  const avant = hydraterLieu(ligne);
  exiger(acteur, avant.dossierId, "ecrire", "lieux");
  const apres = {
    nom: params.nom === undefined ? avant.nom : nomExige(params.nom, "Le nom du lieu est obligatoire."),
    typeLieu: params.typeLieu ?? avant.typeLieu,
    parcelle: texteFacultatif(params.parcelle, avant.parcelle),
    description: texteFacultatif(params.description, avant.description),
  };
  if (apres.typeLieu !== avant.typeLieu) exigerTypeLieu(apres.typeLieu);

  const changements = [
    { champ: "nom", avant: avant.nom, apres: apres.nom },
    { champ: "type_lieu", avant: avant.typeLieu, apres: apres.typeLieu },
    { champ: "parcelle", avant: avant.parcelle, apres: apres.parcelle },
    { champ: "description", avant: avant.description, apres: apres.description },
  ].filter((c) => c.avant !== c.apres);
  if (changements.length === 0) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE lieu SET nom = ?, type_lieu = ?, parcelle = ?, description = ? WHERE id = ?`).run(apres.nom, apres.typeLieu, apres.parcelle, apres.description, params.lieuId);
    enregistrerEvenement(db, { nomEntite: "lieu", entiteId: params.lieuId, action: "modification", acteurId: acteur.personneId, dossierId: avant.dossierId, changements });
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
  const nom = nomExige(params.nom, "Le nom du bâtiment est obligatoire.");
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
 * Corriger un bâtiment après sa création : nom, type, état, usages. Mêmes règles que pour un lieu.
 * Son lieu se change à part (`rattacherBatiment`).
 */
export function modifierBatiment(
  acteur: Acteur,
  params: { batimentId: string; nom?: string; type?: string; etat?: string; usageActuel?: string; usageEnvisage?: string },
): Batiment {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_BATIMENT} FROM batiment WHERE id = ?`).get(params.batimentId);
  if (!ligne) throw interdit();
  const avant = versObjet<Batiment>(ligne as Record<string, unknown>);
  exiger(acteur, avant.dossierId, "ecrire", "lieux");
  const apres = {
    nom: params.nom === undefined ? avant.nom : nomExige(params.nom, "Le nom du bâtiment est obligatoire."),
    type: texteFacultatif(params.type, avant.type),
    etat: texteFacultatif(params.etat, avant.etat),
    usageActuel: texteFacultatif(params.usageActuel, avant.usageActuel),
    usageEnvisage: texteFacultatif(params.usageEnvisage, avant.usageEnvisage),
  };

  const changements = [
    { champ: "nom", avant: avant.nom, apres: apres.nom },
    { champ: "type", avant: avant.type, apres: apres.type },
    { champ: "etat", avant: avant.etat, apres: apres.etat },
    { champ: "usage_actuel", avant: avant.usageActuel, apres: apres.usageActuel },
    { champ: "usage_envisage", avant: avant.usageEnvisage, apres: apres.usageEnvisage },
  ].filter((c) => c.avant !== c.apres);
  if (changements.length === 0) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE batiment SET nom = ?, type = ?, etat = ?, usage_actuel = ?, usage_envisage = ? WHERE id = ?`).run(
      apres.nom,
      apres.type,
      apres.etat,
      apres.usageActuel,
      apres.usageEnvisage,
      params.batimentId,
    );
    enregistrerEvenement(db, { nomEntite: "batiment", entiteId: params.batimentId, action: "modification", acteurId: acteur.personneId, dossierId: avant.dossierId, changements });
    return versObjet<Batiment>(db.prepare(`SELECT ${COLONNES_BATIMENT} FROM batiment WHERE id = ?`).get(params.batimentId) as Record<string, unknown>);
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
  const nom = nomExige(params.nom, "Le nom de la pièce est obligatoire.");
  exigerBatimentDuDossier(params.batimentId, params.dossierId);
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

/**
 * Corriger une pièce après sa création : nom, usage, et bâtiment (une pièce posée dans le mauvais
 * bâtiment s'y déplace, dans le même dossier). Mêmes règles que pour un lieu. La surface porte une
 * provenance : elle garde son propre formulaire (`modifierSurfacePiece`).
 */
export function modifierPiece(acteur: Acteur, params: { pieceId: string; nom?: string; usage?: string; batimentId?: string }): Piece {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_PIECE} FROM piece WHERE id = ?`).get(params.pieceId);
  if (!ligne) throw interdit();
  const avant = hydraterPiece(ligne);
  exiger(acteur, avant.dossierId, "ecrire", "lieux");
  const apres = {
    nom: params.nom === undefined ? avant.nom : nomExige(params.nom, "Le nom de la pièce est obligatoire."),
    usage: texteFacultatif(params.usage, avant.usage),
    batimentId: params.batimentId || avant.batimentId,
  };
  if (apres.batimentId !== avant.batimentId) exigerBatimentDuDossier(apres.batimentId, avant.dossierId);

  const changements = [
    { champ: "nom", avant: avant.nom, apres: apres.nom },
    { champ: "usage", avant: avant.usage, apres: apres.usage },
    { champ: "batiment_id", avant: avant.batimentId, apres: apres.batimentId },
  ].filter((c) => c.avant !== c.apres);
  if (changements.length === 0) return avant;

  return transaction((db) => {
    db.prepare(`UPDATE piece SET nom = ?, usage = ?, batiment_id = ? WHERE id = ?`).run(apres.nom, apres.usage, apres.batimentId, params.pieceId);
    enregistrerEvenement(db, { nomEntite: "piece", entiteId: params.pieceId, action: "modification", acteurId: acteur.personneId, dossierId: avant.dossierId, changements });
    return hydraterPiece(db.prepare(`SELECT ${COLONNES_PIECE} FROM piece WHERE id = ?`).get(params.pieceId));
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

// --- Retirer ------------------------------------------------------------------------------------------
//
// Un lieu, un bâtiment ou une pièce ne se retire que vide (issue #22). Le schéma, lui, laisserait
// faire : un bâtiment supprimé emporterait ses pièces, et idées, postes et documents perdraient
// leur rattachement sans que personne l'ait décidé. La règle est donc tenue ici, et l'écran lit la
// même phrase que le contrôle pour dire pourquoi un objet ne se retire pas.

type Entite = "lieu" | "batiment" | "piece";

// Ce que le schéma rattache à chaque objet : les clés étrangères de migrations/002_v1.sql. Une
// table qui se met à pointer vers un lieu, un bâtiment ou une pièce s'ajoute ici.
const RATTACHES: Record<Entite, Array<{ table: string; colonne: string; un: string; plusieurs: string }>> = {
  lieu: [
    { table: "batiment", colonne: "lieu_id", un: "bâtiment", plusieurs: "bâtiments" },
    { table: "document", colonne: "lieu_id", un: "document", plusieurs: "documents" },
  ],
  batiment: [
    { table: "piece", colonne: "batiment_id", un: "pièce", plusieurs: "pièces" },
    { table: "idee", colonne: "batiment_id", un: "idée", plusieurs: "idées" },
    { table: "poste_budget", colonne: "batiment_id", un: "poste de budget", plusieurs: "postes de budget" },
    { table: "document", colonne: "batiment_id", un: "document", plusieurs: "documents" },
  ],
  piece: [
    { table: "idee", colonne: "piece_id", un: "idée", plusieurs: "idées" },
    { table: "document", colonne: "piece_id", un: "document", plusieurs: "documents" },
  ],
};

const REFUS_NON_VIDE: Record<Entite, (rattaches: string) => string> = {
  lieu: (r) => `Ce lieu n'est pas vide (${r}) : seul un lieu vide se retire.`,
  batiment: (r) => `Ce bâtiment n'est pas vide (${r}) : seul un bâtiment vide se retire.`,
  piece: (r) => `Cette pièce n'est pas vide (${r}) : seule une pièce vide se retire.`,
};

/** Par identifiant, la phrase de refus de chaque objet non vide du dossier. */
function refusParObjet(dossierId: string): Record<string, string> {
  const db = obtenirBase();
  const refus: Record<string, string> = {};
  for (const entite of ["lieu", "batiment", "piece"] as const) {
    const rattaches = new Map<string, string[]>();
    for (const { table, colonne, un, plusieurs } of RATTACHES[entite]) {
      const lignes = db
        .prepare(`SELECT r.${colonne} AS id, COUNT(*) AS n FROM ${table} r JOIN ${entite} o ON o.id = r.${colonne} WHERE o.dossier_id = ? GROUP BY r.${colonne}`)
        .all(dossierId) as Array<{ id: string; n: number }>;
      for (const { id, n } of lignes) rattaches.set(id, [...(rattaches.get(id) ?? []), `${n} ${n > 1 ? plusieurs : un}`]);
    }
    for (const [id, liste] of rattaches) refus[id] = REFUS_NON_VIDE[entite](liste.join(", "));
  }
  return refus;
}

/**
 * Pourquoi chaque objet non vide du dossier ne se retire pas, par identifiant ; un objet absent de
 * la réponse est vide. Réservé à qui peut retirer : la phrase compte des idées, des postes et des
 * documents, que tout rôle qui écrit les lieux peut aussi lire (tests/domain/droits.test.ts).
 */
export function objetsNonVides(acteur: Acteur, dossierId: string): Record<string, string> {
  exiger(acteur, dossierId, "ecrire", "lieux");
  return refusParObjet(dossierId);
}

/** Retire un objet vide. Le journal garde ce qu'il contenait : la valeur d'avant, puis rien. */
function retirer(acteur: Acteur, entite: Entite, objet: { id: string; dossierId: string }, contenu: Record<string, string | number | null>): void {
  exiger(acteur, objet.dossierId, "ecrire", "lieux");
  transaction((db) => {
    const refus = refusParObjet(objet.dossierId)[objet.id];
    if (refus) throw invalide(refus);
    db.prepare(`DELETE FROM ${entite} WHERE id = ?`).run(objet.id);
    enregistrerEvenement(db, {
      nomEntite: entite,
      entiteId: objet.id,
      action: "suppression",
      acteurId: acteur.personneId,
      dossierId: objet.dossierId,
      changements: Object.entries(contenu)
        .filter(([, avant]) => avant !== null)
        .map(([champ, avant]) => ({ champ, avant, apres: null })),
    });
  });
}

export function retirerLieu(acteur: Acteur, params: { lieuId: string }): void {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_LIEU} FROM lieu WHERE id = ?`).get(params.lieuId);
  if (!ligne) throw interdit();
  const l = hydraterLieu(ligne);
  retirer(acteur, "lieu", l, {
    nom: l.nom,
    type_lieu: l.typeLieu,
    adresse: l.adresse.valeur,
    adresse_source: l.adresse.source,
    adresse_confiance: l.adresse.valeur === null ? null : l.adresse.confiance,
    latitude_microdeg: l.position.valeur?.latitudeMicrodeg ?? null,
    longitude_microdeg: l.position.valeur?.longitudeMicrodeg ?? null,
    position_source: l.position.source,
    position_confiance: l.position.valeur === null ? null : l.position.confiance,
    position_note: l.position.note ?? null,
    parcelle: l.parcelle,
    description: l.description,
  });
}

export function retirerBatiment(acteur: Acteur, params: { batimentId: string }): void {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_BATIMENT} FROM batiment WHERE id = ?`).get(params.batimentId);
  if (!ligne) throw interdit();
  const b = versObjet<Batiment>(ligne as Record<string, unknown>);
  retirer(acteur, "batiment", b, {
    nom: b.nom,
    lieu_id: b.lieuId,
    type: b.type,
    etat: b.etat,
    usage_actuel: b.usageActuel,
    usage_envisage: b.usageEnvisage,
    description: b.description,
  });
}

export function retirerPiece(acteur: Acteur, params: { pieceId: string }): void {
  const ligne = obtenirBase().prepare(`SELECT ${COLONNES_PIECE} FROM piece WHERE id = ?`).get(params.pieceId);
  if (!ligne) throw interdit();
  const p = hydraterPiece(ligne);
  retirer(acteur, "piece", p, {
    nom: p.nom,
    batiment_id: p.batimentId,
    usage: p.usage,
    surface_centiemes: p.surface.valeur,
    surface_source: p.surface.source,
    surface_confiance: p.surface.valeur === null ? null : p.surface.confiance,
    description: p.description,
  });
}
