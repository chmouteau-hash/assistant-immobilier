// La migration 008 sur une base qui a déjà des bâtiments (issue #2, bloc « Bâtiment »).
//
// Même raison que pour la 007 (`migration-007.test.ts`) : les autres tests partent d'une base
// neuve. Ce test arrête une base à part à la migration 007, y met un bâtiment fictif, puis applique
// la 008 comme `obtenirBase()` : SQLite vérifie les CHECK d'une colonne ajoutée sur les lignes
// existantes, et le bâtiment doit en sortir « à renseigner ».

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

describe("migration 008 sur une base qui a déjà des bâtiments", () => {
  it("laisse leur surface à renseigner, sans violer de contrainte", () => {
    const fichiers = readdirSync(DOSSIER).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    const migration008 = fichiers.find((f) => f.startsWith("008_"));
    expect(migration008).toBeDefined();

    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = OFF;");
    for (const f of fichiers.filter((f) => f < "008")) appliquer(db, f);
    db.exec(`INSERT INTO dossier (id, nom) VALUES ('d1', 'Dossier d''essai (fictif)')`);
    db.exec(`INSERT INTO batiment (id, dossier_id, nom) VALUES ('b1', 'd1', 'Bâtiment d''essai (fictif)')`);

    appliquer(db, migration008!);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.exec("PRAGMA foreign_keys = ON;");

    expect({ ...db.prepare(`SELECT surface_centiemes, surface_source, surface_confiance FROM batiment WHERE id = 'b1'`).get() }).toEqual({
      surface_centiemes: null,
      surface_source: null,
      surface_confiance: "a_renseigner",
    });
    expect(() => db.exec(`UPDATE batiment SET surface_centiemes = 100, surface_source = 'source_externe', surface_confiance = 'connu' WHERE id = 'b1'`)).toThrow(/CHECK/);
    db.close();
  });
});
