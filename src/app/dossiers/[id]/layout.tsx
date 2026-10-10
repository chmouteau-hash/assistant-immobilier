import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { obtenirActeurCourant } from "@/lib/acteur-courant";
import { obtenirDossierPourNavigation } from "@/lib/dossiers";
import { sectionsVisibles, autorise } from "@/lib/acces";
import { ErreurApplicative } from "@/lib/erreurs";
import { LIBELLES_SECTION, type Section } from "@/domain/droits";
import { libelleFournisseur } from "@/domain/ia/types";
import { Pastille } from "@/components/ui";
import { NavDossier } from "@/components/NavDossier";

export const dynamic = "force-dynamic";

const ROUTES: Array<{ section: Section; chemin: string; libelle: string }> = [
  { section: "identite", chemin: "", libelle: "Vue d'ensemble" },
  { section: "lieux", chemin: "/lieux", libelle: LIBELLES_SECTION.lieux },
  { section: "idees", chemin: "/idees", libelle: LIBELLES_SECTION.idees },
  { section: "scenarios", chemin: "/scenarios", libelle: LIBELLES_SECTION.scenarios },
  { section: "budget", chemin: "/budget", libelle: LIBELLES_SECTION.budget },
  { section: "documents", chemin: "/documents", libelle: LIBELLES_SECTION.documents },
  { section: "taches", chemin: "/actions", libelle: LIBELLES_SECTION.taches },
  { section: "personnes", chemin: "/personnes", libelle: LIBELLES_SECTION.personnes },
  { section: "ia", chemin: "/assistant", libelle: LIBELLES_SECTION.ia },
  { section: "droits", chemin: "/journal", libelle: "Journal d'audit" },
];

export default async function LayoutDossier({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acteur = await obtenirActeurCourant();
  let dossier;
  try {
    dossier = obtenirDossierPourNavigation(acteur, id);
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) notFound(); // interdit ou inexistant : même réponse
    throw erreur;
  }
  const visibles = new Set(sectionsVisibles(acteur, id));
  const peutIA = autorise(acteur, id, "lire", "ia");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link href="/dossiers" className="text-sm text-neutral-500 hover:underline">
            ← Mes dossiers
          </Link>
          <h1 className="text-xl font-semibold">{dossier.nom}</h1>
        </div>
        <p className="text-xs text-neutral-500">
          {acteur.nom}
          {acteur.simule && <Pastille ton="attention">simulation</Pastille>} · IA :{" "}
          {dossier.iaActivee ? <Pastille ton="ia">activée ({libelleFournisseur(dossier.iaFournisseur)})</Pastille> : <Pastille>désactivée</Pastille>}
        </p>
      </div>
      <NavDossier
        onglets={ROUTES.filter((r) => visibles.has(r.section) && (r.section !== "ia" || peutIA)).map((r) => ({
          href: `/dossiers/${id}${r.chemin}`,
          libelle: r.libelle,
        }))}
      />
      {children}
    </main>
  );
}
