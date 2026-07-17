import { NextResponse } from 'next/server';
import { isWorkerd } from '@/lib/runtime';
import { getLogFilePath, logEvent } from '@/lib/store/usage-log';

/**
 * POST /api/feedback/reveal-log
 *
 * Node (desktop-style local run): opens the OS file manager focused on the
 * usage log file, exactly as before, via platform-specific shell commands.
 *
 * Workerd (Cloudflare): "reveal in Explorer" is a desktop-only concept and
 * there is no child_process on workerd anyway. The usage log itself is a
 * no-op on workerd (see lib/store/usage-log.ts), so there is never a file
 * to reveal there — respond with a clear 501 rather than trying (and
 * failing) to shell out.
 */
export async function POST() {
  if (isWorkerd()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Reveal-in-Explorer is a desktop-only feature and the usage log is disabled on this deployment.',
        path: null,
      },
      { status: 501 }
    );
  }

  // Node path — unchanged from before.
  const [{ exec }, { promisify }, { default: path }] = await Promise.all([
    import('node:child_process'),
    import('node:util'),
    import('node:path'),
  ]);
  const execAsync = promisify(exec);

  const filePath = getLogFilePath();
  const dir = path.dirname(filePath);

  try {
    if (process.platform === 'win32') {
      // /select,"path" needs special escaping; safest is to spawn explorer.exe
      // with the argument quoted. Use exec with quoted path.
      await execAsync(`explorer.exe /select,"${filePath}"`).catch(() => {
        // explorer.exe always exits non-zero with /select even on success — ignore
      });
    } else if (process.platform === 'darwin') {
      await execAsync(`open -R "${filePath}"`);
    } else {
      // Linux: open the containing directory
      await execAsync(`xdg-open "${dir}"`);
    }

    logEvent({ type: 'action', name: 'reveal-log', outcome: 'ok' });
    return NextResponse.json({ ok: true, path: filePath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    logEvent({ type: 'error', name: 'reveal-log', outcome: 'error', errorTag: 'ExecFailed' });
    return NextResponse.json({ ok: false, error: msg, path: filePath }, { status: 500 });
  }
}
