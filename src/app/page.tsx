import Link from "next/link";

export default function Accueil() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-start justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Assistant immobilier</h1>
      <p className="text-neutral-600">
        Dossier privé, local à ce PC. Rien n&apos;est envoyé ailleurs — la base de données vit
        dans le dossier <code className="rounded bg-neutral-200 px-1 py-0.5 text-sm">data/</code>{" "}
        à côté du code, exclue du dépôt git.
      </p>
      <Link
        href="/dossiers"
        className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700"
      >
        Voir mes dossiers
      </Link>
    </main>
  );
}
