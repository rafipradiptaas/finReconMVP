export default async function DocumentDetailPage({ params }: PageProps<'/documents/[id]'>) {
  const { id } = await params;

  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Detail Dokumen</h1>
      <p className="text-muted-foreground text-sm">
        Field hasil ekstraksi dan koreksi manual untuk dokumen {id} muncul di Fase 3.
      </p>
    </section>
  );
}
