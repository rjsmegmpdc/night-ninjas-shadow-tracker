import { NextResponse } from 'next/server';
import { buildDataExport } from '@/lib/actions/settings-admin';

/**
 * GET /api/settings/export
 *
 * Streams a JSON dump of every user-data table as a browser download.
 * Replaces the old "write to <dataDir>/exports/<file>.json, show the path,
 * let the user copy it" flow (cloud-3: no runtime disk write on either
 * node or workerd — see lib/actions/settings-admin.ts's buildDataExport).
 */
export async function GET() {
  const { json, filename } = await buildDataExport();

  return new NextResponse(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
