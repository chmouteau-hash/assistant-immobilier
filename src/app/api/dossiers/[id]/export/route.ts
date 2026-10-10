// Téléchargement de l'export complet d'un dossier (ZIP) — propriétaire seulement, contrôlé dans
// `src/lib/export.ts`. Réponse non mise en cache : elle contient des données personnelles.

import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { exporterDossierZip } from "@/lib/export";
import { ErreurApplicative } from "@/lib/erreurs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const acteur = await obtenirActeurCourant();
    const { nomFichier, archive } = exporterDossierZip(acteur, id);
    return new Response(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomFichier)}`,
        "Content-Length": String(archive.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return new Response("Introuvable", { status: 404 });
    throw erreur;
  }
}
