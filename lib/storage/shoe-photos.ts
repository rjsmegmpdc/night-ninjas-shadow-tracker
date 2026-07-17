import 'server-only';
import { isWorkerd } from '@/lib/runtime';

/**
 * Shoe photo storage adapter — dual runtime, same idiom as `lib/db/index.ts`.
 *
 * Node (local dev): disk, exactly as before — <dataDir>/shoe-photos/<filename>.
 * Workerd (Cloudflare): the `PHOTOS` R2 binding (see wrangler.jsonc), keyed
 * by the same filename used on disk.
 *
 * Both drivers are pulled in via dynamic import so `node:fs`/`node:path`
 * never end up reachable on the workerd path, and `@opennextjs/cloudflare`
 * never loads under Node.
 */

async function nodeDir(): Promise<{ fs: typeof import('node:fs'); path: typeof import('node:path'); dir: string }> {
  const [{ default: fs }, { default: path }, { resolveDataDir }] = await Promise.all([
    import('node:fs'),
    import('node:path'),
    import('@/lib/db/data-dir'),
  ]);
  const dir = path.join(resolveDataDir(), 'shoe-photos');
  return { fs, path, dir };
}

async function r2Bucket() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const { env } = getCloudflareContext();
  return env.PHOTOS;
}

/** Save a shoe photo under `filename`. Creates the node-side directory if needed. */
export async function saveShoePhoto(filename: string, buffer: Buffer): Promise<void> {
  if (isWorkerd()) {
    const bucket = await r2Bucket();
    await bucket.put(filename, buffer);
    return;
  }
  const { fs, path, dir } = await nodeDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
}

/** Read a shoe photo. Returns null if it doesn't exist. */
export async function readShoePhoto(filename: string): Promise<Buffer | null> {
  if (isWorkerd()) {
    const bucket = await r2Bucket();
    const obj = await bucket.get(filename);
    if (!obj) return null;
    const arrayBuffer = await obj.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  const { fs, path, dir } = await nodeDir();
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

/** Delete a shoe photo. Best-effort — never throws (mirrors the previous disk-only behaviour). */
export async function deleteShoePhoto(filename: string): Promise<void> {
  try {
    if (isWorkerd()) {
      const bucket = await r2Bucket();
      await bucket.delete(filename);
      return;
    }
    const { fs, path, dir } = await nodeDir();
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore — matches the previous try/catch around fs.unlinkSync */
  }
}
