"use client";

// Enveloppe générique d'un formulaire relié à une Server Action : état « en cours », message
// d'erreur, message de succès. Les champs sont passés en enfants (rendus côté serveur) : ce
// composant ne connaît pas le métier, il ne fait que soumettre.
//
// React 19 vide un formulaire non contrôlé après chaque action, même en erreur : l'utilisateur
// perdait une saisie longue pour une virgule mal placée. On mémorise donc les valeurs envoyées et,
// si l'action répond par une erreur, on les remet en place (sauf les champs fichier, que le
// navigateur interdit de pré-remplir).

import { useActionState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { EtatFormulaire } from "@/app/dossiers/actions";

const ETAT_INITIAL: EtatFormulaire = { erreur: null, ok: false };

export function FormulaireAction({
  action,
  children,
  bouton,
  titre,
  compact = false,
  className = "",
  apresSucces,
}: {
  action: (etat: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>;
  children: ReactNode;
  bouton: string;
  titre?: string;
  compact?: boolean;
  className?: string;
  /** Appelé une fois l'action réussie : par exemple pour quitter un mode de l'écran. */
  apresSucces?: () => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const dernieresValeurs = useRef<FormData | null>(null);

  const [etat, soumettre, enCours] = useActionState(async (precedent: EtatFormulaire, donnees: FormData) => {
    dernieresValeurs.current = donnees;
    const resultat = await action(precedent, donnees);
    if (resultat.ok && !resultat.erreur) apresSucces?.();
    return resultat;
  }, ETAT_INITIAL);

  useEffect(() => {
    if (!etat.erreur || !formRef.current || !dernieresValeurs.current) return;
    const form = formRef.current;
    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      if (!element.name || element.type === "hidden" || element.type === "file" || element.type === "submit") continue;
      const valeurs = dernieresValeurs.current.getAll(element.name).map(String);
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        element.checked = valeurs.includes(element.value);
      } else if (element instanceof HTMLSelectElement && element.multiple) {
        for (const option of Array.from(element.options)) option.selected = valeurs.includes(option.value);
      } else if (valeurs.length > 0) {
        element.value = valeurs[0];
      }
    }
  }, [etat]);

  return (
    <form
      ref={formRef}
      action={soumettre}
      className={
        compact
          ? `flex flex-wrap items-end gap-2 text-sm ${className}`
          : `flex flex-col gap-3 rounded-lg border border-dashed border-neutral-300 p-4 text-sm ${className}`
      }
    >
      {titre && <h3 className="font-medium">{titre}</h3>}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={enCours}
          className="min-h-10 rounded border border-neutral-900 px-3 py-2 font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-50"
        >
          {enCours ? "…" : bouton}
        </button>
        {etat.erreur && (
          <p role="alert" className="text-red-600">
            {etat.erreur}
          </p>
        )}
        {etat.ok && !etat.erreur && <p className="text-green-700">Enregistré.</p>}
      </div>
    </form>
  );
}
