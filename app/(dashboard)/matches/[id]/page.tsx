export default async function MatchDetailPage({ params }: PageProps<'/matches/[id]'>) {
  const { id } = await params;

  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Review Panel</h1>
      <p className="text-muted-foreground text-sm">
        Panel review untuk match {id} muncul di Fase 5.
      </p>
    </section>
  );
}
