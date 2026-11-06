import { useMemo, useSyncExternalStore } from 'react';
import { parseRoute, routeHref, type Route } from '../lib/route';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** The route in the URL hash, live. Links to a route are plain `<a href={routeHref(route)}>`. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseRoute(hash), [hash]);
}

/** Goes to a route from code (a shortcut, a key); the browser's back button returns. */
export function navigate(route: Route): void {
  window.location.hash = routeHref(route);
}
