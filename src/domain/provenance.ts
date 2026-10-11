// Provenance et confiance d'une donnée — fonctions PURES (aucune base, aucun framework).
//
// Principe du cadrage : « toute donnée affichée indique sa provenance et son statut ; aucune
// estimation n'apparaît comme une donnée certaine ». Ce module est la seule définition de ces
// règles ; la base (contraintes CHECK) et l'interface (étiquettes) s'y réfèrent.
//
// Vocabulaire :
// - `Source` : D'OÙ vient la valeur (qui l'a produite).
// - `Confiance` : À QUEL POINT on peut s'y fier aujourd'hui.
// Les deux sont indépendantes mais contraintes l'une par l'autre (voir `validerValeurTracee`).

export const SOURCES = ["saisie", "import", "estimation", "source_externe", "suggestion_ia"] as const;
export type Source = (typeof SOURCES)[number];

export const CONFIANCES = ["connu", "estime", "a_confirmer", "a_renseigner"] as const;
export type Confiance = (typeof CONFIANCES)[number];

// Un seul nom par origine et par niveau de certitude, sur toute l'application (issue #15). La
// pastille affiche le nom court ; les formulaires posent une question, et chaque réponse proposée
// reprend ce nom. « Document importé », pas « pièce » : une pièce est aussi une salle.
export const LIBELLES_SOURCE: Record<Source, string> = {
  saisie: "saisie",
  import: "document importé",
  estimation: "estimation",
  source_externe: "source externe",
  suggestion_ia: "suggestion de l'IA",
};

export const LIBELLES_CONFIANCE: Record<Confiance, string> = {
  connu: "connu",
  estime: "estimé",
  a_confirmer: "à confirmer",
  a_renseigner: "à renseigner",
};

export const QUESTION_SOURCE = "D'où vient cette information ?";
export const REPONSES_SOURCE: Record<Source, string> = {
  saisie: "Je l'ai saisie moi-même",
  import: "Elle vient d'un document importé",
  estimation: "C'est une estimation",
  source_externe: "Elle vient d'une source externe (annonce, professionnel)",
  suggestion_ia: "C'est une suggestion de l'IA",
};

export const QUESTION_CONFIANCE = "En êtes-vous sûr ?";
export const REPONSES_CONFIANCE: Record<Confiance, string> = {
  connu: "Oui, c'est connu",
  estime: "Non, c'est estimé",
  a_confirmer: "Pas encore, c'est à confirmer",
  a_renseigner: "Je ne la connais pas : à renseigner",
};

/** Choix proposé quand on ne répond pas à la seconde question : voir `confianceParDefaut`. */
export const REPONSE_HABITUELLE = "— réponse habituelle pour cette origine —";

/**
 * Une valeur accompagnée de sa provenance. `valeur: null` signifie explicitement « à renseigner »
 * — jamais zéro, jamais une valeur par défaut présentée comme réelle.
 */
export type ValeurTracee<T> = {
  valeur: T | null;
  source: Source | null;
  confiance: Confiance;
  /** Document (devis, plan, facture…) dont la valeur est tirée, s'il existe. */
  documentId?: string | null;
  /** Précision libre : « devis non reçu », « plan du 12/03/2027 »… */
  note?: string | null;
};

/** Valeur inconnue, explicitement. */
export function aRenseigner<T>(): ValeurTracee<T> {
  return { valeur: null, source: null, confiance: "a_renseigner" };
}

/**
 * Confiance proposée par défaut pour une source donnée. Une estimation est « estimée », une
 * suggestion de l'IA ou une source externe « à confirmer » ; seules la saisie et l'import
 * donnent « connu » par défaut — l'utilisateur peut toujours abaisser la confiance.
 */
export function confianceParDefaut(source: Source): Confiance {
  switch (source) {
    case "saisie":
    case "import":
      return "connu";
    case "estimation":
      return "estime";
    case "source_externe":
    case "suggestion_ia":
      return "a_confirmer";
  }
}

export type ResultatValidation = { valide: true } | { valide: false; motif: string };

/**
 * Règles de cohérence entre valeur, source et confiance :
 * 1. valeur absente ⇔ confiance « à renseigner » (et pas de source) ;
 * 2. une estimation n'est jamais « connue » ;
 * 3. une suggestion de l'IA n'est jamais « connue » ni « estimée » : elle attend une confirmation
 *    humaine (principe « validation avant effet ») ;
 * 4. une source externe (annonce, dire d'un professionnel) n'est pas « connue » tant qu'elle n'est
 *    pas appuyée par un document importé — elle reste au mieux « à confirmer ».
 */
export function validerValeurTracee<T>(v: ValeurTracee<T>): ResultatValidation {
  if (v.valeur === null || v.valeur === undefined) {
    if (v.confiance !== "a_renseigner") {
      return { valide: false, motif: "Une valeur absente doit porter le statut « à renseigner »." };
    }
    if (v.source !== null && v.source !== undefined) {
      return { valide: false, motif: "Une valeur absente n'a pas de source." };
    }
    return { valide: true };
  }
  if (v.confiance === "a_renseigner") {
    return { valide: false, motif: "Une valeur renseignée ne peut pas être « à renseigner »." };
  }
  if (!v.source) {
    return { valide: false, motif: "Toute valeur renseignée doit indiquer sa source." };
  }
  if (v.source === "estimation" && v.confiance === "connu") {
    return { valide: false, motif: "Une estimation ne peut pas être présentée comme connue." };
  }
  if (v.source === "suggestion_ia" && v.confiance !== "a_confirmer") {
    return {
      valide: false,
      motif: "Une suggestion de l'IA reste « à confirmer » jusqu'à validation humaine.",
    };
  }
  if (v.source === "source_externe" && v.confiance === "connu") {
    return {
      valide: false,
      motif: "Une source externe reste au mieux « à confirmer » sans document importé.",
    };
  }
  return { valide: true };
}

/**
 * Étiquette d'affichage, toujours complète : « 92 m² — source : document importé, statut : connu ».
 * `formater` transforme la valeur brute en texte (montant, surface, date…). Une valeur absente
 * s'affiche « À renseigner », jamais « 0 ».
 */
export function etiquetteProvenance<T>(v: ValeurTracee<T>, formater: (valeur: T) => string): string {
  if (v.valeur === null || v.valeur === undefined) return "À renseigner";
  const source = v.source ? LIBELLES_SOURCE[v.source] : "source inconnue";
  const note = v.note ? ` (${v.note})` : "";
  return `${formater(v.valeur)} — source : ${source}${note}, statut : ${LIBELLES_CONFIANCE[v.confiance]}`;
}

/** Vrai si la donnée peut être présentée comme un fait (et non une hypothèse). */
export function estUnFait<T>(v: ValeurTracee<T>): boolean {
  return v.valeur !== null && v.valeur !== undefined && v.confiance === "connu";
}

export function estSource(x: string): x is Source {
  return (SOURCES as readonly string[]).includes(x);
}

export function estConfiance(x: string): x is Confiance {
  return (CONFIANCES as readonly string[]).includes(x);
}
