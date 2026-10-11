// Enveloppe d'erreur uniforme : un seul type d'erreur applicative, avec un code STABLE
// (utilisable par le code) distinct du message (destiné à l'utilisateur).

export type CodeErreur = "NOT_FOUND" | "VALIDATION" | "CONFLIT" | "INTERDIT" | "IA_INDISPONIBLE" | "SERVICE_INDISPONIBLE";

export class ErreurApplicative extends Error {
  readonly code: CodeErreur;

  constructor(code: CodeErreur, message: string) {
    super(message);
    this.code = code;
    this.name = "ErreurApplicative";
  }
}

export function introuvable(quoi: string): ErreurApplicative {
  return new ErreurApplicative("NOT_FOUND", `${quoi} introuvable`);
}

export function invalide(message: string): ErreurApplicative {
  return new ErreurApplicative("VALIDATION", message);
}

/** Un service distant (adresses, carte) ne répond pas : l'application continue sans lui. */
export function serviceIndisponible(message: string): ErreurApplicative {
  return new ErreurApplicative("SERVICE_INDISPONIBLE", message);
}

/**
 * Accès refusé. Le message ne précise jamais si la ressource existe : pour un acteur non
 * autorisé, un dossier inconnu et un dossier interdit se présentent de la même façon.
 */
export function interdit(): ErreurApplicative {
  return new ErreurApplicative("INTERDIT", "Accès refusé à cette ressource.");
}
