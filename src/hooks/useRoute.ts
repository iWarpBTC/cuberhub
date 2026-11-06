import { useMemo, useSyncExternalStore } from 'react';
import { IOS_APP } from '../lib/platform';
import { parseRoute, routeHref, type Route } from '../lib/route';

/*
 * Where the app is lives in the URL hash, so the back button works and a page can be bookmarked.
 *
 * Not in the app on an iPhone's home screen: there it is kept in memory. Since Safari 26.2, a change of
 * the address within the page makes iOS replace the status bar's background with a shadow that also
 * darkens the top of the page, the app's header (WebKit bug 305546). That app shows no address and has
 * no back button, so nothing visible is lost; the place is remembered for the session, so loading the
 * app again returns to it.
 */
const PLACE_KEY = 'cuberhub:place';

function storedPlace(): string | null {
  try {
    return sessionStorage.getItem(PLACE_KEY);
  } catch {
    return null;
  }
}

let place = IOS_APP ? (storedPlace() ?? window.location.hash) : '';
const listeners = new Set<() => void>();

function go(hash: string): void {
  if (hash === place) return;
  place = hash;
  try {
    sessionStorage.setItem(PLACE_KEY, hash);
  } catch {
    // Without session storage the place is just not remembered.
  }
  for (const listener of listeners) listener();
}

if (IOS_APP) {
  // Links to a route are plain `<a href="#/…">`; following one would change the address, so the app goes there itself.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const link = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
    if (link === null) return;
    e.preventDefault();
    go(link.getAttribute('href') ?? '');
  });
}

function subscribe(onChange: () => void): () => void {
  if (IOS_APP) {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const currentHash = IOS_APP ? () => place : () => window.location.hash;

/** The route the app is at, live. Links to a route are plain `<a href={routeHref(route)}>`. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, currentHash);
  return useMemo(() => parseRoute(hash), [hash]);
}

/** Goes to a route from code (a shortcut, a key); in a browser, its back button returns. */
export function navigate(route: Route): void {
  if (IOS_APP) go(routeHref(route));
  else window.location.hash = routeHref(route);
}
