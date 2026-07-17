import { NextResponse, type NextRequest } from 'next/server';
import { readShoePhoto } from '@/lib/storage/shoe-photos';

/**
 * GET /api/shoes/photo?file=<filename>
 *
 * Serves shoe photos through the storage adapter (disk on node, R2 `PHOTOS`
 * binding on workerd — see lib/storage/shoe-photos.ts). The browser can't
 * access either store directly, so we proxy via this route. Filenames are
 * validated against a strict pattern to prevent directory traversal.
 */

const FILENAME_PATTERN = /^shoe-\d+-\d+\.(jpg|jpeg|png|webp)$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('file');

  if (!filename || !FILENAME_PATTERN.test(filename)) {
    return new NextResponse('Invalid filename', { status: 400 });
  }

  const buffer = await readShoePhoto(filename);
  if (!buffer) {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  const contentType =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    'image/jpeg';

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
