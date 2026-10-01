"use server";

// Server Actions — c'est ici que passe tout changement d'état. Dans ce monorepo Next.js, c'est
// l'équivalent du contrat généré d'Ergonomia (routes Rust → OpenAPI → client TS) : un seul point
// d'entrée, typé par TypeScript des deux côtés puisque front et back partagent le même langage —
// pas besoin d'un pipeline de génération séparé pour obtenir la même garantie.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { creerDossier, creerScenario, changerStatutScenario, ajouterLigneBudget } from "@/lib/dossiers";
import { creerTache, changerStatutTache } from "@/lib/taches";
import { parserMontant } from "@/lib/montant";
import { ErreurApplicative } from "@/lib/erreurs";

export type EtatFormulaire = { erreur: string | null };

export async function actionCreerDossier(
  _etatPrecedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  try {
    const dossier = creerDossier({
      nom: String(donnees.get("nom") ?? ""),
      objectif: String(donnees.get("objectif") ?? ""),
      stade: String(donnees.get("stade") ?? ""),
    });
    revalidatePath("/dossiers");
    redirect(`/dossiers/${dossier.id}`);
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return { erreur: erreur.message };
    throw erreur;
  }
}

export async function actionCreerScenario(
  _etatPrecedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const dossierId = String(donnees.get("dossierId") ?? "");
  try {
    creerScenario({
      dossierId,
      nom: String(donnees.get("nom") ?? ""),
      description: String(donnees.get("description") ?? ""),
    });
    revalidatePath(`/dossiers/${dossierId}`);
    return { erreur: null };
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return { erreur: erreur.message };
    throw erreur;
  }
}

export async function actionChangerStatut(
  _etatPrecedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const dossierId = String(donnees.get("dossierId") ?? "");
  try {
    changerStatutScenario({
      scenarioId: String(donnees.get("scenarioId") ?? ""),
      nouveauStatut: String(donnees.get("statut") ?? ""),
      motif: String(donnees.get("motif") ?? ""),
    });
    revalidatePath(`/dossiers/${dossierId}`);
    return { erreur: null };
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return { erreur: erreur.message };
    throw erreur;
  }
}

export async function actionCreerTache(
  _etatPrecedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const dossierId = String(donnees.get("dossierId") ?? "");
  const scenarioId = String(donnees.get("scenarioId") ?? "");
  try {
    creerTache({
      dossierId,
      scenarioId: scenarioId === "" ? null : scenarioId,
      description: String(donnees.get("description") ?? ""),
      echeance: String(donnees.get("echeance") ?? ""),
      responsable: String(donnees.get("responsable") ?? ""),
    });
    revalidatePath(`/dossiers/${dossierId}`);
    revalidatePath("/");
    return { erreur: null };
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return { erreur: erreur.message };
    throw erreur;
  }
}

export async function actionChangerStatutTache(
  _etatPrecedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const dossierId = String(donnees.get("dossierId") ?? "");
  try {
    changerStatutTache({
      tacheId: String(donnees.get("tacheId") ?? ""),
      nouveauStatut: String(donnees.get("statut") ?? ""),
    });
    revalidatePath(`/dossiers/${dossierId}`);
    revalidatePath("/");
    return { erreur: null };
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return { erreur: erreur.message };
    throw erreur;
  }
}

export async function actionAjouterLigneBudget(
  _etatPrecedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const dossierId = String(donnees.get("dossierId") ?? "");
  const montantSaisi = String(donnees.get("montant") ?? "");
  const montantCentimes = parserMontant(montantSaisi);
  if (montantCentimes === null) {
    return { erreur: `Montant invalide : « ${montantSaisi} ». Exemple attendu : 1250,50` };
  }
  try {
    ajouterLigneBudget({
      scenarioId: String(donnees.get("scenarioId") ?? ""),
      poste: String(donnees.get("poste") ?? ""),
      montantCentimes,
      typeMontant: String(donnees.get("typeMontant") ?? ""),
      source: String(donnees.get("source") ?? "estimation"),
    });
    revalidatePath(`/dossiers/${dossierId}`);
    return { erreur: null };
  } catch (erreur) {
    if (erreur instanceof ErreurApplicative) return { erreur: erreur.message };
    throw erreur;
  }
}
