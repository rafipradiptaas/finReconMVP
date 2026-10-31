import { CsvImportDialog } from '@/components/csv-import-dialog';
import { PoRow, type Po } from '@/components/purchase-orders/po-row';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getSessionContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function PurchaseOrdersPage() {
  const session = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(
      'id, po_number, po_date, currency, total_amount, vendors(vendor_name), purchase_order_lines(id, line_no, item_description, quantity, unit_price)',
    )
    .order('po_number')
    .order('line_no', { referencedTable: 'purchase_order_lines' });

  const orders = data?.map(
    ({ vendors, purchase_order_lines, ...order }): Po => ({
      ...order,
      vendor_name: vendors.vendor_name,
      lines: purchase_order_lines,
    }),
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Purchase Order</h1>
        {session?.role === 'admin' && (
          <CsvImportDialog title="Import PO" endpoint="/api/purchase-orders/import" />
        )}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          Gagal memuat data PO.
        </p>
      )}
      {orders?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Belum ada PO. Impor vendor lebih dulu, lalu impor PO.
        </p>
      )}
      {orders && orders.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Nomor PO</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Baris</TableHead>
              <TableHead className="text-right">Total (sebelum PPN)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((po) => (
              <PoRow key={po.id} po={po} />
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
