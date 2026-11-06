import { describe, expect, it } from 'vitest';
import { CHEATSHEET_TABS, HOME, TRAINING_SCREENS, parseRoute, routeHref, type Route } from './route';

const ROUTES: Route[] = [
  HOME,
  { page: 'timer' },
  ...CHEATSHEET_TABS.map((tab): Route => ({ page: 'cheatsheet', tab })),
  { page: 'training', screen: null },
  ...TRAINING_SCREENS.map((screen): Route => ({ page: 'training', screen })),
];

describe('routes', () => {
  it('reads every link back as the route it was made from', () => {
    for (const route of ROUTES) expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it('gives every route a link of its own', () => {
    expect(new Set(ROUTES.map(routeHref)).size).toBe(ROUTES.length);
  });

  it('writes readable links', () => {
    expect(routeHref({ page: 'cheatsheet', tab: 'f2l' })).toBe('#/cheatsheet/f2l');
    expect(routeHref({ page: 'training', screen: 'miniCross' })).toBe('#/training/mini-cross');
  });

  it('opens the home page for an empty or unknown hash', () => {
    for (const hash of ['', '#', '#/', '#/statistics', '#timer/']) {
      expect(parseRoute(hash), hash).toEqual(hash === '#timer/' ? { page: 'timer' } : HOME);
    }
  });

  it('opens the start of a section for an unknown part of it', () => {
    expect(parseRoute('#/cheatsheet/zbll')).toEqual({ page: 'cheatsheet', tab: 'moves' });
    expect(parseRoute('#/training/blind')).toEqual({ page: 'training', screen: null });
  });
});
