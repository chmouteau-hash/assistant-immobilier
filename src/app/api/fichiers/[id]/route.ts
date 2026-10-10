// Sert le fichier original d'un document — APRÈS contrôle des droits côté serveur. Le fichier n'est
// jamais exposé en statique : `data/fichiers/` n'est pas dans `public/`.

import { readFileSync } from "node:fs";
import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { cheminAbsoluDocument } from "@/lib/documents";
import { ErreurApplicative } from "@/lib/erreurs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const acteur = await obtenirActeurCourant();
    const { chemin, mime, nom } = cheminAbsoluDocument(acteur, id);
    const contenu = readFileSync(chemin);
    return new Response(new Uint8Array(contenu), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nom)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return new Response("Introuvable", { status: 404 });
    throw erreur;
  }
}
