import { ImageResponse } from "next/og";

// Icône PNG 180×180 générée au build pour iOS (qui ignore les icônes SVG à l'ajout sur l'écran
// d'accueil). Même dessin que public/icone.svg.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#171717", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 64 64" width="140" height="140">
          <path d="M14 34 L32 18 L50 34" fill="none" stroke="#fafafa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 31 V48 H44 V31" fill="none" stroke="#fafafa" strokeWidth="5" strokeLinejoin="round" />
          <rect x="29" y="38" width="6" height="10" fill="#fafafa" />
        </svg>
      </div>
    ),
    size,
  );
}
