// Fournisseur distant (Claude, via le SDK officiel Anthropic). Chargé dynamiquement par
// `src/lib/ia.ts` UNIQUEMENT si le dossier le demande et si `ANTHROPIC_API_KEY` est définie.
//
// Ce que ce fichier NE fait pas : décider quoi envoyer. Il reçoit un `ContexteAutorise` déjà
// filtré et l'écrit par `serialiserContexte`, la fonction qui sert aussi à l'afficher à l'écran
// avant l'envoi : ne pas l'écrire autrement ici. Il impose la forme de la réponse (sortie structurée validée
// par un schéma zod) : chaque élément porte constat + sources + hypothèse + suggestion +
// vérification + incertitude. Une réponse qui ne respecte pas le schéma est rejetée.
//
// Variables d'environnement : ANTHROPIC_API_KEY (obligatoire), ASSISTANT_IA_MODELE (facultatif,
// par défaut claude-opus-5-5).

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ContexteAutorise, FournisseurIA, ReponseIA } from "../../domain/ia/types";
import { AVERTISSEMENT_STANDARD, serialiserContexte } from "../../domain/ia/types";
import { ErreurApplicative } from "../erreurs";

const SchemaSource = z.object({
  titre: z.string(),
  reference: z.string().nullable(),
  date: z.string().nullable(),
  type: z.enum(["dossier", "regle_locale", "externe", "modele"]),
});

const SchemaElement = z.object({
  constat: z.object({ texte: z.string(), sources: z.array(SchemaSource) }),
  hypothese: z.string().nullable(),
  suggestion: z.string().nullable(),
  verification: z.object({ quoi: z.string(), parQui: z.string(), comment: z.string() }).nullable(),
  incertitude: z.enum(["faible", "moyen", "eleve"]),
  inattendue: z.boolean(),
});

const SchemaReponse = z.object({ elements: z.array(SchemaElement) });

const CONSIGNES = `Tu assistes un particulier ou un professionnel sur un projet immobilier (achat, rénovation, construction).
Tu reçois un extrait STRUCTURÉ et PARTIEL d'un dossier : uniquement les sections que l'utilisateur a autorisées. Tu ne reçois ni noms de personnes, ni adresses, ni fichiers.

Règles absolues :
- Tu réponds en français, sous forme d'éléments. Chaque élément = Constat (fait tiré du contexte, avec ses sources) → Hypothèse (à valider, ou null) → Suggestion (non décisionnelle, ou null) → Vérification (quoi, par qui, comment ; ou null) → niveau d'incertitude.
- Un constat ne cite QUE ce qui est dans le contexte fourni. Source de type "dossier" avec le titre de la donnée. Si tu t'appuies sur une connaissance générale, source de type "modele", date null, incertitude au moins "moyen", et tu dis explicitement que c'est à vérifier.
- Tu n'inventes AUCUN chiffre : pas de prix, surface, taux, montant d'aide, seuil réglementaire, délai légal. Si une valeur manque, tu dis qu'elle manque et qui peut la fournir.
- Points juridiques, fiscaux, financiers : tu structures la question et tu indiques le professionnel compétent (notaire, expert-comptable, courtier, architecte, urbanisme). Tu ne conclus jamais à leur place.
- Tu peux proposer une option inattendue, alors "inattendue": true.
- Tu ne prends aucune décision ; tu ne dis jamais qu'une estimation est un fait.`;

export class FournisseurAnthropic implements FournisseurIA {
  readonly nom = "anthropic";
  private readonly client = new Anthropic();
  private readonly modele = process.env.ASSISTANT_IA_MODELE ?? "claude-opus-5-5";

  async repondre(contexte: ContexteAutorise, question: string, maintenantISO: string): Promise<ReponseIA> {
    let reponse;
    try {
      reponse = await this.client.messages.parse({
        model: this.modele,
        max_tokens: 16000,
        system: CONSIGNES,
        messages: [
          {
            role: "user",
            content: `Date du jour : ${maintenantISO}\n\nContexte autorisé du dossier (JSON) :\n${serialiserContexte(contexte)}\n\nQuestion : ${question}`,
          },
        ],
        output_config: { format: zodOutputFormat(SchemaReponse) },
      });
    } catch (erreur) {
      if (erreur instanceof Anthropic.AuthenticationError) {
        throw new ErreurApplicative("IA_INDISPONIBLE", "Clé API Anthropic refusée (ANTHROPIC_API_KEY).");
      }
      if (erreur instanceof Anthropic.RateLimitError) {
        throw new ErreurApplicative("IA_INDISPONIBLE", "Fournisseur IA saturé : réessayez dans un instant.");
      }
      if (erreur instanceof Anthropic.APIError) {
        throw new ErreurApplicative("IA_INDISPONIBLE", `Fournisseur IA en erreur (${erreur.status ?? "?"}) : ${erreur.message}`);
      }
      throw erreur;
    }

    if (reponse.stop_reason === "refusal") {
      throw new ErreurApplicative("IA_INDISPONIBLE", "Le fournisseur a refusé de répondre à cette question.");
    }
    const parsed = reponse.parsed_output;
    if (!parsed) throw new ErreurApplicative("IA_INDISPONIBLE", "Réponse du fournisseur non conforme au format attendu ; rien n'a été retenu.");

    return {
      fournisseur: this.nom,
      modele: reponse.model,
      dateReponse: maintenantISO,
      question,
      elements: parsed.elements,
      perimetreUtilise: contexte.sections,
      avertissement: AVERTISSEMENT_STANDARD,
    };
  }
}
