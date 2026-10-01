// Enveloppe d'erreur uniforme — reprend le principe d'Ergonomia (`backend-server/src/error.rs`) :
// un seul type d'erreur applicative, qui sait se traduire en réponse, avec un code STABLE
// (utilisable par le code, pas seulement affiché) distinct du message (destiné à l'utilisateur).
//
// Pourquoi ça compte même dans une appli locale sans vrais "clients" API : le jour où un écran
// doit distinguer "ce champ est invalide" d'"aucun scénario retenu pour comparer", un message
// texte seul oblige à comparer des chaînes. Un code le permet sans fragilité.

export type CodeErreur =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLIT";

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
