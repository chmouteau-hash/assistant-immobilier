// Règles d'accès — fonction PURE `peut()`, appliquée CÔTÉ SERVEUR par `src/lib/acces.ts` avant
// toute lecture ou écriture. L'interface ne fait que masquer ce qui est de toute façon refusé.
//
// Modèle : une Personne participe à un Dossier avec un Rôle. Un professionnel (notaire,
// architecte, artisan…) ne voit que les SECTIONS listées dans son périmètre, et seulement tant
// que sa participation n'est pas révoquée. Sans participation : aucun accès — c'est ce qui
// garantit qu'un dossier n'expose jamais ses données à un autre dossier.
//
// Ce module ne connaît ni la base ni l'utilisateur courant : il reçoit la liste des
// participations d'un dossier et répond vrai/faux. Il est donc testable sans rien d'autre.

export const ROLES = ["proprietaire", "contributeur", "lecteur", "professionnel"] as const;
export type Role = (typeof ROLES)[number];

export const LIBELLES_ROLE: Record<Role, string> = {
  proprietaire: "Propriétaire du dossier",
  contributeur: "Contributeur",
  lecteur: "Lecteur",
  professionnel: "Professionnel (accès limité)",
};

/** Découpage du dossier en sections, unité d'autorisation pour les professionnels. */
export const SECTIONS = [
  "identite", // nom, type, stade du dossier
  "personnes",
  "lieux", // biens, terrains, bâtiments, pièces
  "idees",
  "scenarios",
  "budget",
  "documents",
  "taches",
  "ia",
  "droits",
] as const;
export type Section = (typeof SECTIONS)[number];

export const LIBELLES_SECTION: Record<Section, string> = {
  identite: "Identité du dossier",
  personnes: "Personnes",
  lieux: "Lieux, bâtiments, pièces",
  idees: "Idées",
  scenarios: "Scénarios",
  budget: "Budget",
  documents: "Documents et photos",
  taches: "Actions et planning",
  ia: "Assistant IA",
  droits: "Droits d'accès",
};

export type Action = "lire" | "ecrire" | "gerer_droits" | "activer_ia" | "supprimer_dossier" | "exporter";

export type Participation = {
  personneId: string;
  role: Role;
  /** Sections visibles pour un professionnel ; ignoré pour les autres rôles. */
  perimetre: Section[];
  /** Date ISO de révocation ; `null` si active. */
  revoqueeLe: string | null;
};

function participationActive(participations: Participation[], personneId: string): Participation | null {
  return participations.find((p) => p.personneId === personneId && p.revoqueeLe === null) ?? null;
}

/**
 * Décide si `acteurId` peut faire `action` sur `section` d'un dossier dont voici les
 * participations. Refus par défaut : toute situation non prévue répond `false`.
 */
export function peut(
  participations: Participation[],
  acteurId: string,
  action: Action,
  section: Section,
): boolean {
  const p = participationActive(participations, acteurId);
  if (!p) return false;

  switch (p.role) {
    case "proprietaire":
      return true;

    case "contributeur":
      // Écrit partout sauf sur les droits et l'activation de l'IA ; ne supprime ni n'exporte le
      // dossier (l'export contient tout, droits et journal compris).
      if (action === "gerer_droits" || action === "activer_ia" || action === "supprimer_dossier" || action === "exporter") return false;
      if (section === "droits") return action === "lire";
      return true;

    case "lecteur":
      return action === "lire" && section !== "droits";

    case "professionnel":
      if (!p.perimetre.includes(section)) return false;
      if (section === "droits" || section === "ia") return false;
      if (action === "lire") return true;
      // Un professionnel peut déposer des documents et proposer des lignes dans son périmètre
      // (un devis, une facture) — jamais décider d'un scénario ni toucher aux personnes.
      if (action === "ecrire") return section === "documents" || section === "budget" || section === "taches";
      return false;
  }
}

/** Sections lisibles par un acteur — sert à construire les vues et le contexte transmis à l'IA. */
export function sectionsLisibles(participations: Participation[], acteurId: string): Section[] {
  return SECTIONS.filter((s) => peut(participations, acteurId, "lire", s));
}

/**
 * Un dossier doit toujours garder au moins un propriétaire actif : on ne peut ni révoquer ni
 * rétrograder le dernier.
 */
export function peutRetirerProprietaire(participations: Participation[], personneId: string): boolean {
  const proprietairesActifs = participations.filter(
    (p) => p.role === "proprietaire" && p.revoqueeLe === null,
  );
  const cible = proprietairesActifs.find((p) => p.personneId === personneId);
  if (!cible) return true; // ce n'est pas un propriétaire : pas de contrainte
  return proprietairesActifs.length > 1;
}

export function estRole(x: string): x is Role {
  return (ROLES as readonly string[]).includes(x);
}

export function estSection(x: string): x is Section {
  return (SECTIONS as readonly string[]).includes(x);
}
