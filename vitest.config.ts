import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest (dépendance de développement) : il résout l'alias `@/` et les imports TypeScript sans
// extension exactement comme Next.js, ce que `node --test` seul ne fait pas. Les tests qui
// touchent la base utilisent une SQLite EN MÉMOIRE (voir `reinitialiserBasePourTests`), jamais
// `data/dossier.sqlite`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { ASSISTANT_DB_PATH: ":memory:" },
    fileParallelism: false, // une seule connexion partagée à la base en mémoire
  },
});
