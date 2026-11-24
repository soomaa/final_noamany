/**
 * "A new version is available". A release swaps the entry bundle `index-<hash>.js` in the
 * management HTML; a tab opened before it keeps running the old code until someone refreshes
 * (and the installed app has no address bar to refresh from). The page compares its own entry
 * name with the one the server names now.
 *
 * On the Noamany server `/index.html` is the public website, not the management system: the
 * management shell is `public/system.html`, served for `/login` (with `Cache-Control: no-cache`)
 * and every other application route. So the check asks for `/login`, never `/index.html`.
 */

const ENTRY = /\/assets\/(index-[A-Za-z0-9_-]+\.js)/;

/** The URL whose HTML is the management shell on the server and in `vite preview`. */
export const SHELL_PATH = '/login';

/** The entry bundle a piece of HTML loads, or null. */
export function entryBundle(html: string | null | undefined): string | null {
  return ENTRY.exec(String(html ?? ''))?.[1] ?? null;
}

/** The entry bundle this tab is running, read from its own module script tags. */
export function runningBundle(doc: Pick<Document, 'querySelectorAll'> = document): string | null {
  for (const script of Array.from(doc.querySelectorAll('script[type="module"][src]'))) {
    const name = entryBundle((script as HTMLScriptElement).getAttribute('src'));
    if (name) return name;
  }
  return null;
}

/** A newer release is live when both names are known and differ. */
export function updateAvailable(running: string | null, live: string | null): boolean {
  return running != null && live != null && running !== live;
}

/** Fetch the live management HTML past every cache (the query is new each time). */
export async function liveBundle(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher(`${SHELL_PATH}?v=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });
    if (!response.ok) return null;
    return entryBundle(await response.text());
  } catch {
    return null;
  }
}
