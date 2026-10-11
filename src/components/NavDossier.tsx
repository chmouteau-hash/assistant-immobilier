"use client";

// Navigation d'un dossier : onglet courant mis en évidence, barre collée en haut pendant le
// défilement. Au doigt (écran tactile), une seule ligne qui défile horizontalement, au lieu de
// quatre lignes d'onglets. À la souris, les onglets passent à la ligne : sur une seule ligne sans
// barre de défilement, deux onglets sur dix restaient hors de vue même en plein écran (issue #18).
// Composant client uniquement pour connaître l'URL courante.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type OngletDossier = { href: string; libelle: string };

export function NavDossier({ onglets }: { onglets: OngletDossier[] }) {
  const chemin = usePathname();
  const actifRef = useRef<HTMLAnchorElement | null>(null);

  // La vue d'ensemble (/dossiers/<id>) n'est active que sur sa propre URL ; les autres onglets le
  // sont aussi sur leurs sous-pages (ex. /documents/<docId>).
  const estActif = (href: string) => {
    const estVueEnsemble = href.split("/").length === 3;
    return estVueEnsemble ? chemin === href : chemin === href || chemin.startsWith(href + "/");
  };

  useEffect(() => {
    // Centre l'onglet courant dans la barre (utile sur téléphone, où elle défile ; sans effet à la
    // souris, où rien ne dépasse). On déplace la barre elle-même, pas la page : `scrollIntoView`
    // ferait aussi défiler la fenêtre.
    const actif = actifRef.current;
    const barre = actif?.parentElement;
    if (!actif || !barre) return;
    const cible = actif.offsetLeft - (barre.clientWidth - actif.offsetWidth) / 2;
    barre.scrollTo({ left: Math.max(0, cible) });
  }, [chemin]);

  return (
    <nav
      aria-label="Sections du dossier"
      className="sticky top-0 z-10 -mx-6 flex flex-wrap gap-1 border-b border-neutral-200 bg-neutral-50/95 px-6 py-2 text-sm backdrop-blur pointer-coarse:flex-nowrap pointer-coarse:overflow-x-auto pointer-coarse:[scrollbar-width:none]"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      {onglets.map((o) => {
        const actif = estActif(o.href);
        return (
          <Link
            key={o.href}
            href={o.href}
            ref={actif ? actifRef : undefined}
            aria-current={actif ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded px-3 py-2 ${
              actif ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
            }`}
          >
            {o.libelle}
          </Link>
        );
      })}
    </nav>
  );
}
