import { describe, expect, it } from "vitest";
import { creerZip, lireZip } from "@/lib/zip";

describe("archiveur ZIP minimal", () => {
  it("écrit puis relit des entrées intactes (CRC vérifié, noms UTF-8)", () => {
    const entrees = [
      { nom: "LISEZMOI.txt", contenu: Buffer.from("Bonjour, été 2026 — à bientôt", "utf8") },
      { nom: "fichiers/façade.pdf", contenu: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x10]) },
      { nom: "vide.txt", contenu: Buffer.alloc(0) },
    ];
    const archive = creerZip(entrees);
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    const lues = lireZip(archive);
    expect(lues.map((e) => e.nom)).toEqual(entrees.map((e) => e.nom));
    for (let i = 0; i < entrees.length; i++) {
      expect(lues[i].contenu.equals(entrees[i].contenu)).toBe(true);
      expect(lues[i].crcOk).toBe(true);
    }
  });

  it("détecte une archive altérée", () => {
    const archive = creerZip([{ nom: "a.txt", contenu: Buffer.from("abcdef") }]);
    archive[30 + 5 + 2] ^= 0xff; // modifie un octet du contenu de a.txt
    expect(lireZip(archive)[0].crcOk).toBe(false);
  });
});
