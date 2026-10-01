import Link from "next/link";
import { listerDossiers } from "@/lib/dossiers";
import { FormulaireDossier } from "./FormulaireDossier";

// Sans ça, Next.js ne voit aucune dépendance dynamique (pas de cookies, pas de `fetch` non mis en
// cache) et PRÉ-RENDT cette page une fois pour toutes au `build` — elle sert alors indéfiniment
// la photo du contenu de `data/dossier.sqlite` prise à ce moment-là, même après un redémarrage
// avec une base différente. Constaté : un dossier créé après le build restait invisible, et un
// lien vers un dossier créé avant mais depuis supprimé menait à un 404. Toute page qui lit la
// base locale doit porter cette ligne.
export const dynamic = "force-dynamic";

export default function PageDossiers() {
  const dossiers = listerDossiers();

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-xl font-semibold">Mes dossiers</h1>

      {dossiers.length === 0 ? (
        <p className="text-neutral-500">Aucun dossier pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dossiers.map((dossier) => (
            <li key={dossier.id}>
              <Link
                href={`/dossiers/${dossier.id}`}
                className="block rounded-lg border border-neutral-200 p-3 hover:border-neutral-400"
              >
                <span className="font-medium">{dossier.nom}</span>
                {dossier.stade && <span className="ml-2 text-sm text-neutral-500">· {dossier.stade}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <FormulaireDossier />
    </main>
  );
}
