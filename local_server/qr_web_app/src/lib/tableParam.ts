/** Haqiqiy bosilgan QR kodlar `services.py::build_table_qr_url` orqali
 *  `/table/<uuid>/` yo'li sifatida generatsiya qilinadi (domain bilan yoki
 *  domainsiz) — `?table=`/`?qr=` query parametri emas. Ikkalasini ham qo'llab
 *  quvvatlaymiz, lekin path ustuvor: haqiqiy chop etilgan kod shu shaklda. */
export function getQrCodeFromUrl(): string {
  const searchParams = new URLSearchParams(window.location.search);

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const tableIndex = pathParts.indexOf('table');
  if (tableIndex !== -1 && pathParts[tableIndex + 1]) {
    return pathParts[tableIndex + 1];
  }

  if (searchParams.get('table')) return searchParams.get('table')!;
  return 'demo';
}
