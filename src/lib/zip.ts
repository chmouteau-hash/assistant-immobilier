// Archiveur ZIP minimal, sans dépendance : entrées « stockées » (aucune compression), lisibles
// par tout explorateur de fichiers. Suffisant pour l'export d'un dossier (JSON + photos et PDF,
// déjà compressés par nature). Spécification : PKWARE APPNOTE, en-têtes locaux + répertoire
// central + fin de répertoire. CRC-32 fourni par `node:zlib`.
//
// Limites assumées : pas de ZIP64 (archive < 4 Go, < 65 535 entrées), pas de chiffrement.

import { crc32 } from "node:zlib";

export type EntreeZip = { nom: string; contenu: Buffer; date?: Date };

function dateDos(d: Date): { heure: number; date: number } {
  const annee = Math.max(1980, d.getFullYear());
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((annee - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function creerZip(entrees: EntreeZip[]): Buffer {
  if (entrees.length > 65535) throw new Error("Trop d'entrées pour un ZIP sans ZIP64.");
  const morceaux: Buffer[] = [];
  const central: Buffer[] = [];
  let decalage = 0;

  for (const e of entrees) {
    const nom = Buffer.from(e.nom.replace(/\\/g, "/"), "utf8");
    const crc = crc32(e.contenu) >>> 0;
    const { heure, date } = dateDos(e.date ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature en-tête local
    local.writeUInt16LE(20, 4); // version requise
    local.writeUInt16LE(0x0800, 6); // drapeau : noms en UTF-8
    local.writeUInt16LE(0, 8); // méthode : stocké
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.contenu.length, 18);
    local.writeUInt32LE(e.contenu.length, 22);
    local.writeUInt16LE(nom.length, 26);
    local.writeUInt16LE(0, 28);
    morceaux.push(local, nom, e.contenu);

    const entete = Buffer.alloc(46);
    entete.writeUInt32LE(0x02014b50, 0); // signature répertoire central
    entete.writeUInt16LE(20, 4); // version créée par
    entete.writeUInt16LE(20, 6); // version requise
    entete.writeUInt16LE(0x0800, 8);
    entete.writeUInt16LE(0, 10);
    entete.writeUInt16LE(heure, 12);
    entete.writeUInt16LE(date, 14);
    entete.writeUInt32LE(crc, 16);
    entete.writeUInt32LE(e.contenu.length, 20);
    entete.writeUInt32LE(e.contenu.length, 24);
    entete.writeUInt16LE(nom.length, 28);
    entete.writeUInt16LE(0, 30); // extra
    entete.writeUInt16LE(0, 32); // commentaire
    entete.writeUInt16LE(0, 34); // disque
    entete.writeUInt16LE(0, 36); // attributs internes
    entete.writeUInt32LE(0, 38); // attributs externes
    entete.writeUInt32LE(decalage, 42); // position de l'en-tête local
    central.push(entete, nom);

    decalage += local.length + nom.length + e.contenu.length;
  }

  const tailleCentral = central.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); // signature fin de répertoire
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(decalage, 16);
  fin.writeUInt16LE(0, 20);

  return Buffer.concat([...morceaux, ...central, fin]);
}

/** Lecture minimale (tests et vérification) : liste les entrées via le répertoire central. */
export function lireZip(archive: Buffer): Array<{ nom: string; contenu: Buffer; crcOk: boolean }> {
  const fin = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0) throw new Error("Fin de répertoire ZIP introuvable.");
  const nb = archive.readUInt16LE(fin + 10);
  let pos = archive.readUInt32LE(fin + 16);
  const resultat: Array<{ nom: string; contenu: Buffer; crcOk: boolean }> = [];
  for (let i = 0; i < nb; i++) {
    if (archive.readUInt32LE(pos) !== 0x02014b50) throw new Error("En-tête de répertoire central invalide.");
    const crc = archive.readUInt32LE(pos + 16);
    const taille = archive.readUInt32LE(pos + 20);
    const nomLen = archive.readUInt16LE(pos + 28);
    const extraLen = archive.readUInt16LE(pos + 30);
    const commLen = archive.readUInt16LE(pos + 32);
    const local = archive.readUInt32LE(pos + 42);
    const nom = archive.subarray(pos + 46, pos + 46 + nomLen).toString("utf8");
    const nomLocalLen = archive.readUInt16LE(local + 26);
    const extraLocalLen = archive.readUInt16LE(local + 28);
    const debut = local + 30 + nomLocalLen + extraLocalLen;
    const contenu = archive.subarray(debut, debut + taille);
    resultat.push({ nom, contenu, crcOk: (crc32(contenu) >>> 0) === crc });
    pos += 46 + nomLen + extraLen + commLen;
  }
  return resultat;
}
