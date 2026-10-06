/* USPS export: CSV of ship-decided orders that have no tracking number yet,
   shaped for USPS Click-N-Ship bulk import. Auth via ?key= so the browser
   can download it directly. */

import { adminAuthorized, adminDb, errorResponse, unauthorized } from '@/lib/server/admin';

const HEADERS = [
  'Reference ID',
  'Item Description',
  'Recipient First Name',
  'Recipient Last Name',
  'Recipient Company',
  'Recipient Address Line 1',
  'Recipient Address Line 2',
  'Recipient City',
  'Recipient State',
  'Recipient ZIP Code',
  'Recipient Email',
  'Service Type',
  'Package Type',
  'Weight (oz)',
];

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function GET(req: Request) {
  if (!adminAuthorized(req)) return unauthorized();
  try {
    const url = new URL(req.url);
    const weightOz = url.searchParams.get('oz') ?? '10';

    const { data, error } = await adminDb()
      .from('pulls')
      .select('*, tee:tees(sku, name, size)')
      .eq('decision', 'shipped')
      .is('tracking', null)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    const rows = (data ?? [])
      .filter((o) => o.ship_address1 && o.ship_city && o.ship_state && o.ship_zip)
      .map((o) => {
        const name: string = (o.ship_name ?? '').trim();
        const space = name.lastIndexOf(' ');
        const first = space > 0 ? name.slice(0, space) : name;
        const last = space > 0 ? name.slice(space + 1) : '';
        const tee = o.tee as { sku?: string; name?: string; size?: string } | null;
        return [
          tee?.sku ?? o.id,
          `${tee?.name ?? 'Vintage tee'} (${tee?.size ?? ''})`.trim(),
          first,
          last,
          '',
          o.ship_address1 ?? '',
          o.ship_address2 ?? '',
          o.ship_city ?? '',
          o.ship_state ?? '',
          o.ship_zip ?? '',
          o.ship_email ?? '',
          'USPS Ground Advantage',
          'Package',
          weightOz,
        ].map(csvCell).join(',');
      });

    const csv = [HEADERS.join(','), ...rows].join('\r\n') + '\r\n';
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="thrifting-machine-usps-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
