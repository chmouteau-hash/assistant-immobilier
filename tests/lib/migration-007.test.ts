// La migration 007 sur une base qui a déjà des lieux (issue #2, bloc « Bien »).
//
// Les autres tests partent d'une base neuve, où aucun lieu n'existe quand la migration passe. La
// base réelle, elle, en a : ce test rejoue son cas sur une base à part, en mémoire, arrêtée à la
// migration 006, avec un lieu fictif de chaque type, puis applique la 007 comme `obtenirBase()`.
//
// Ce qu'il garde : un bien acquis déjà saisi reçoit le statut « acquis », les autres lieux restent
// « à renseigner », aucune clé étrangère n'est violée, et les déclencheurs sont actifs ensuite.

import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DOSSIER = path.join(process.cwd(), "src", "lib", "db", "migrations");

function appliquer(db: DatabaseSync, fichier: string): void {
  db.exec("BEGIN");
  db.exec(readFileSync(path.join(DOSSIER, fichier), "utf8"));
  db.exec("COMMIT");
}

describe("migration 007 sur une base qui a déjà des lieux", () => {
  it("donne le statut « acquis » aux biens acquis, laisse les autres à renseigner", () => {
    const fichiers = readdirSync(DOSSIER).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    const migration007 = fichiers.find((f) => f.startsWith("007_"));
    expect(migration007).toBeDefined();

    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = OFF;");
    for (const f of fichiers.filter((f) => f < "007")) appliquer(db, f);
    db.exec(`INSERT INTO dossier (id, nom) VALUES ('d1', 'Dossier d''essai (fictif)')`);
    for (const [id, type] of [["l1", "bien_candidat"], ["l2", "bien_acquis"], ["l3", "terrain"]]) {
      db.prepare(`INSERT INTO lieu (id, dossier_id, nom, type_lieu) VALUES (?, 'd1', ?, ?)`).run(id, `Lieu ${id} (fictif)`, type);
    }

    appliquer(db, migration007!);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.exec("PRAGMA foreign_keys = ON;");

    const lieux = db.prepare(`SELECT id, type_lieu, statut_bien, prix_demande_centimes, prix_demande_confiance FROM lieu ORDER BY id`).all();
    expect(lieux.map((l) => ({ ...l }))).toEqual([
      { id: "l1", type_lieu: "bien_candidat", statut_bien: null, prix_demande_centimes: null, prix_demande_confiance: "a_renseigner" },
      { id: "l2", type_lieu: "bien_acquis", statut_bien: "acquis", prix_demande_centimes: null, prix_demande_confiance: "a_renseigner" },
      { id: "l3", type_lieu: "terrain", statut_bien: null, prix_demande_centimes: null, prix_demande_confiance: "a_renseigner" },
    ]);
    expect(() => db.exec(`UPDATE lieu SET statut_bien = 'visite' WHERE id = 'l2'`)).toThrow(/bien acquis a le statut/);
    db.close();
  });
});
