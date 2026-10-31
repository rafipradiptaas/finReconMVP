import { CsvImportDialog } from '@/components/csv-import-dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { VendorStatusSelect } from '@/components/vendors/vendor-status-select';
import { getSessionContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { vendorReadiness, type VendorReadiness } from '@/lib/vendor-readiness';

const READINESS_VARIANT: Record<VendorReadiness, 'default' | 'secondary' | 'destructive'> = {
  Aman: 'default',
  'Perlu Review': 'secondary',
  'Belum Siap': 'destructive',
};

export default async function VendorsPage() {
  const session = await getSessionContext();
  const supabase = await createClient();
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select(
      'id, vendor_code, vendor_name, npwp, bank_name, bank_account_number, bank_account_holder, status, last_verified_at, contact_email',
    )
    .order('vendor_code');
  const now = new Date();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vendor</h1>
        {session?.role === 'admin' && (
          <CsvImportDialog title="Import Vendor" endpoint="/api/vendors/import" />
        )}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          Gagal memuat data vendor.
        </p>
      )}
      {vendors?.length === 0 && (
        <p className="text-muted-foreground text-sm">Belum ada vendor. Admin dapat mengimpor CSV.</p>
      )}
      {vendors && vendors.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>NPWP</TableHead>
              <TableHead>Rekening</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Terakhir diverifikasi</TableHead>
              <TableHead>Kesiapan</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((vendor) => {
              const readiness = vendorReadiness(vendor, now);
              return (
                <TableRow key={vendor.id}>
                  <TableCell>{vendor.vendor_code}</TableCell>
                  <TableCell className="font-medium">{vendor.vendor_name}</TableCell>
                  <TableCell>{vendor.npwp ?? '-'}</TableCell>
                  <TableCell>
                    {vendor.bank_name ?? '-'} {vendor.bank_account_number}
                  </TableCell>
                  <TableCell>
                    {vendor.contact_email ?? <Badge variant="outline">kontak belum ada</Badge>}
                  </TableCell>
                  <TableCell>{vendor.last_verified_at ?? 'Belum pernah'}</TableCell>
                  <TableCell>
                    <Badge variant={READINESS_VARIANT[readiness]}>{readiness}</Badge>
                  </TableCell>
                  <TableCell>
                    <VendorStatusSelect vendorId={vendor.id} status={vendor.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
