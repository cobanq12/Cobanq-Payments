/**
 * When the app runs inside a hosted preview frame, the browser blocks normal
 * downloads and the host offers a save function instead. Returns true when the
 * host handled the file (or the viewer declined), false to fall back to a normal download.
 */
interface HostDownloads { save(req: { filename: string; data: string | Blob }): Promise<unknown> }
interface HostWindow { claude?: { use(name: string): Promise<unknown> } }

export async function saveViaHost(filename: string, data: string | Blob): Promise<boolean> {
  const host = (window as unknown as HostWindow).claude;
  if (!host) return false;
  try {
    const downloads = (await host.use('downloads')) as HostDownloads | null;
    if (!downloads) return false;
    await downloads.save({ filename, data });
  } catch {
    // Declined or unavailable: nothing more to do.
  }
  return true;
}
