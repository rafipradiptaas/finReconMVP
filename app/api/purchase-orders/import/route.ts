import { logAudit } from '@/lib/audit';
import { readCsvUpload } from '@/lib/csv/parse';
import { groupPurchaseOrders, parsePurchaseOrdersCsv } from '@/lib/csv/purchase-orders';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';

export const POST = withWriteContext(['admin'], async (ctx, request: Request) => {
  const text = await readCsvUpload(request);
  if (text === null) return fail(400, 'FILE_REQUIRED', 'Pilih file CSV (maksimal 5 MB).');

  const { data: vendors, error: vendorError } = await ctx.db
    .from('vendors')
    .select('id, vendor_code')
    .eq('organization_id', ctx.organizationId);
  if (vendorError) throw vendorError;
  const vendorIds = new Map(vendors.map((vendor) => [vendor.vendor_code, vendor.id]));

  const parsed = parsePurchaseOrdersCsv(text, new Set(vendorIds.keys()));
  if (!parsed.ok) {
    return fail(400, 'CSV_INVALID', 'File ditolak. Tidak ada data yang disimpan.', {
      errors: parsed.errors,
    });
  }
  const groups = groupPurchaseOrders(parsed.rows);

  // total_amount is maintained by a trigger on purchase_order_lines.
  const { data: orders, error: orderError } = await ctx.db
    .from('purchase_orders')
    .upsert(
      groups.map((group) => ({
        organization_id: ctx.organizationId,
        po_number: group.po_number,
        vendor_id: vendorIds.get(group.vendor_code)!,
        po_date: group.po_date,
        currency: group.currency,
      })),
      { onConflict: 'organization_id,po_number' },
    )
    .select('id, po_number');
  if (orderError) throw orderError;
  const orderIds = new Map(orders.map((order) => [order.po_number, order.id]));

  const lines = groups.flatMap((group) =>
    group.lines.map((line) => ({
      ...line,
      organization_id: ctx.organizationId,
      po_id: orderIds.get(group.po_number)!,
    })),
  );

  const { data: previous, error: previousError } = await ctx.db
    .from('purchase_order_lines')
    .select('id, po_id, line_no')
    .eq('organization_id', ctx.organizationId)
    .in('po_id', [...orderIds.values()]);
  if (previousError) throw previousError;

  // Re-import makes the file the truth for each PO it names: upsert first so a
  // failure never leaves a PO without lines, then drop lines the file no longer has.
  const { error: lineError } = await ctx.db
    .from('purchase_order_lines')
    .upsert(lines, { onConflict: 'po_id,line_no' });
  if (lineError) throw lineError;

  const kept = new Set(lines.map((line) => `${line.po_id}#${line.line_no}`));
  const staleIds = previous
    .filter((line) => !kept.has(`${line.po_id}#${line.line_no}`))
    .map((line) => line.id);
  if (staleIds.length > 0) {
    const { error: deleteError } = await ctx.db
      .from('purchase_order_lines')
      .delete()
      .eq('organization_id', ctx.organizationId)
      .in('id', staleIds);
    if (deleteError) throw deleteError;
  }

  const counts = { orders: groups.length, lines: lines.length, linesRemoved: staleIds.length };
  await logAudit({ entityType: 'purchase_order', action: 'purchase_orders_imported', newValue: counts }, ctx);

  return ok(counts);
});
