// Fournisseur « règles locales » — déterministe, sans réseau, sans modèle. Il lit le contexte
// autorisé et signale ce qui manque pour avancer. C'est le mode par défaut quand l'assistant est
// activé sans fournisseur distant : il permet de tester le RÔLE de l'IA (où elle aide, où elle
// gêne) avant de payer un modèle et avant de transmettre des données hors du PC.
//
// Chaque élément cite sa source : la donnée du dossier concernée (type `dossier`) et la règle
// appliquée (type `regle_locale`). Incertitude « faible » : ce sont des constats sur les données
// du dossier lui-même, pas des avis.

import type { ContexteAutorise, ElementReponse, FournisseurIA, ReponseIA, SourceReponse } from "./types";
import { AVERTISSEMENT_STANDARD } from "./types";

function regle(code: string): SourceReponse {
  return { titre: `Règle locale ${code}`, reference: `src/domain/ia/questions-manquantes.ts#${code}`, date: null, type: "regle_locale" };
}

function donnee(titre: string, maintenantISO: string): SourceReponse {
  return { titre, reference: null, date: maintenantISO, type: "dossier" };
}

export function detecterQuestionsManquantes(ctx: ContexteAutorise, maintenantISO: string): ElementReponse[] {
  const elements: ElementReponse[] = [];

  if (ctx.dossier) {
    if (!ctx.dossier.typeProjet) {
      elements.push({
        constat: { texte: "Le type de projet du dossier n'est pas renseigné.", sources: [donnee("Dossier : type de projet", maintenantISO), regle("R01")] },
        hypothese: "Sans type de projet, les étapes proposées restent génériques.",
        suggestion: "Choisir un type (travaux ciblés, recherche de bien, bien acquis, construction neuve, projet collectif).",
        verification: { quoi: "Le type correspond-il au projet réel ?", parQui: "le propriétaire du dossier", comment: "dans l'en-tête du dossier" },
        incertitude: "faible",
        inattendue: false,
      });
    }
  }

  if (ctx.lieux) {
    for (const lieu of ctx.lieux) {
      if (!lieu.adresseRenseignee) {
        elements.push({
          constat: { texte: `Le lieu « ${lieu.nom} » n'a pas d'adresse renseignée.`, sources: [donnee(`Lieu ${lieu.nom}`, maintenantISO), regle("R10")] },
          hypothese: "Le bien n'est peut-être pas encore identifié (phase de recherche).",
          suggestion: "Laisser « à renseigner » tant que le bien n'est pas choisi ; ne pas saisir d'adresse approximative.",
          verification: null,
          incertitude: "faible",
          inattendue: false,
        });
      }
      for (const b of lieu.batiments) {
        const sansSurface = b.pieces.filter((p) => p.surfaceCentiemes === null);
        if (sansSurface.length > 0) {
          elements.push({
            constat: {
              texte: `Bâtiment « ${b.nom} » : ${sansSurface.length} pièce(s) sans surface (${sansSurface.map((p) => p.nom).join(", ")}).`,
              sources: [donnee(`Bâtiment ${b.nom}`, maintenantISO), regle("R11")],
            },
            hypothese: "Les surfaces conditionnent la plupart des estimations de travaux.",
            suggestion: "Mesurer ou reprendre un plan ; saisir la surface avec sa source (plan importé, mesure, estimation).",
            verification: { quoi: "Surface réelle", parQui: "l'utilisateur ou un professionnel", comment: "mesure sur place ou plan coté" },
            incertitude: "faible",
            inattendue: false,
          });
        }
        const estimees = b.pieces.filter((p) => p.surfaceCentiemes !== null && p.surfaceConfiance !== "connu");
        if (estimees.length > 0) {
          elements.push({
            constat: { texte: `Bâtiment « ${b.nom} » : ${estimees.length} surface(s) non confirmée(s).`, sources: [donnee(`Bâtiment ${b.nom}`, maintenantISO), regle("R12")] },
            hypothese: null,
            suggestion: "Confirmer ces surfaces avant de comparer les scénarios qui en dépendent.",
            verification: { quoi: "Surfaces estimées", parQui: "l'utilisateur", comment: "mesure ou document" },
            incertitude: "faible",
            inattendue: false,
          });
        }
      }
    }
  }

  if (ctx.scenarios) {
    if (ctx.scenarios.length === 1) {
      elements.push({
        constat: { texte: "Un seul scénario existe : aucune comparaison n'est possible.", sources: [donnee("Scénarios", maintenantISO), regle("R20")] },
        hypothese: "Une alternative (rénover plutôt que reconstruire, ou l'inverse) pourrait être pertinente.",
        suggestion: "Créer un second scénario, même sommaire, pour rendre les écarts visibles.",
        verification: null,
        incertitude: "moyen",
        inattendue: false,
      });
    }
    for (const s of ctx.scenarios) {
      if (s.nbPostes === 0) {
        elements.push({
          constat: { texte: `Scénario « ${s.nom} » : aucun poste budgétaire.`, sources: [donnee(`Scénario ${s.nom}`, maintenantISO), regle("R21")] },
          hypothese: null,
          suggestion: "Lister les postes même sans montant : chaque poste « à renseigner » rend l'inconnu visible.",
          verification: null,
          incertitude: "faible",
          inattendue: false,
        });
      } else if (s.nbPostesARenseigner > 0) {
        elements.push({
          constat: { texte: `Scénario « ${s.nom} » : ${s.nbPostesARenseigner} poste(s) sans aucun montant.`, sources: [donnee(`Scénario ${s.nom}`, maintenantISO), regle("R22")] },
          hypothese: "Le total affiché est partiel ; il ne peut pas servir à comparer.",
          suggestion: "Demander un devis ou saisir une estimation étiquetée comme telle.",
          verification: { quoi: "Montant du poste", parQui: "un artisan ou l'utilisateur", comment: "devis écrit de préférence" },
          incertitude: "faible",
          inattendue: false,
        });
      }
      if (s.nbPostesSurEstimation > 0 && s.statut === "retenue") {
        elements.push({
          constat: { texte: `Scénario « ${s.nom} » retenu alors que ${s.nbPostesSurEstimation} poste(s) reposent sur des estimations.`, sources: [donnee(`Scénario ${s.nom}`, maintenantISO), regle("R23")] },
          hypothese: "La décision pourrait changer si les devis s'écartent des estimations.",
          suggestion: "Noter la décision comme conditionnelle et fixer un seuil d'écart qui la remettrait en cause.",
          verification: { quoi: "Devis réels", parQui: "artisans", comment: "consultation" },
          incertitude: "moyen",
          inattendue: false,
        });
      }
      for (const h of s.hypothesesOuvertes) {
        elements.push({
          constat: { texte: `Hypothèse ouverte sur « ${s.nom} » : ${h}`, sources: [donnee(`Scénario ${s.nom}`, maintenantISO), regle("R24")] },
          hypothese: null,
          suggestion: "Décider qui la valide et comment, puis la passer « validée » ou « invalidée ».",
          verification: { quoi: h, parQui: "à désigner", comment: "à définir" },
          incertitude: "moyen",
          inattendue: false,
        });
      }
    }
  }

  if (ctx.documents) {
    const enAttente = ctx.documents.reduce((n, d) => n + d.extractionsEnAttente, 0);
    if (enAttente > 0) {
      elements.push({
        constat: { texte: `${enAttente} champ(s) extrait(s) de documents attendent une validation.`, sources: [donnee("Documents", maintenantISO), regle("R30")] },
        hypothese: null,
        suggestion: "Valider ou corriger ces champs : tant qu'ils ne le sont pas, ils n'entrent pas au budget.",
        verification: { quoi: "Montants, dates, fournisseurs extraits", parQui: "l'utilisateur", comment: "comparer au document original" },
        incertitude: "faible",
        inattendue: false,
      });
    }
    const nonRattaches = ctx.documents.filter((d) => !d.rattache);
    if (nonRattaches.length > 0) {
      elements.push({
        constat: { texte: `${nonRattaches.length} document(s) ne sont rattachés à aucun lieu, scénario ni poste.`, sources: [donnee("Documents", maintenantISO), regle("R31")] },
        hypothese: null,
        suggestion: "Les classer pour les retrouver depuis la pièce, le scénario ou le poste concerné.",
        verification: null,
        incertitude: "faible",
        inattendue: false,
      });
    }
  }

  if (ctx.taches) {
    const sansResponsable = ctx.taches.filter((t) => t.statut !== "fait" && t.responsable === null);
    if (sansResponsable.length > 0) {
      elements.push({
        constat: { texte: `${sansResponsable.length} action(s) ouverte(s) sans responsable.`, sources: [donnee("Actions", maintenantISO), regle("R40")] },
        hypothese: null,
        suggestion: "Attribuer un responsable à chaque action, même « moi ».",
        verification: null,
        incertitude: "faible",
        inattendue: false,
      });
    }
    const bloquees = ctx.taches.filter((t) => t.statut !== "fait" && t.bloqueePar > 0);
    if (bloquees.length > 0) {
      elements.push({
        constat: { texte: `${bloquees.length} action(s) attendent un prérequis non fait.`, sources: [donnee("Actions", maintenantISO), regle("R41")] },
        hypothese: null,
        suggestion: "Regarder d'abord les prérequis : ce sont eux qui débloquent le plus d'actions.",
        verification: null,
        incertitude: "faible",
        inattendue: false,
      });
    }
  }

  if (ctx.idees) {
    const aEtudier = ctx.idees.filter((i) => i.statut === "a_etudier" && i.scenarioNom === null);
    if (aEtudier.length > 0) {
      elements.push({
        constat: { texte: `${aEtudier.length} idée(s) « à étudier » ne sont rattachées à aucun scénario.`, sources: [donnee("Idées", maintenantISO), regle("R50")] },
        hypothese: "Une idée à l'étude sans scénario n'a ni coût ni conséquence planning visibles.",
        suggestion: "La rattacher au scénario où elle s'applique, ou la laisser « idée ».",
        verification: null,
        incertitude: "faible",
        inattendue: false,
      });
    }
  }

  return elements;
}

export class FournisseurReglesLocales implements FournisseurIA {
  readonly nom = "regles_locales";

  async repondre(contexte: ContexteAutorise, question: string, maintenantISO: string): Promise<ReponseIA> {
    return {
      fournisseur: this.nom,
      modele: null,
      dateReponse: maintenantISO,
      question,
      elements: detecterQuestionsManquantes(contexte, maintenantISO),
      perimetreUtilise: contexte.sections,
      avertissement: AVERTISSEMENT_STANDARD,
    };
  }
}
