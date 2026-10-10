import type { MetadataRoute } from "next";

// Manifeste web : permet « Ajouter à l'écran d'accueil » sur le téléphone (icône, plein écran).
// Aucun service worker, aucun cache hors ligne : l'application reste servie par le PC.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Assistant immobilier",
    short_name: "Immobilier",
    description: "Dossier de projet immobilier, local et sans serveur distant.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#171717",
    lang: "fr",
    icons: [
      { src: "/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
