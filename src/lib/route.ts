import { DRY_MODES, type DryMode } from './dryPractice';

export type CheatsheetTab = 'moves' | 'f2l' | 'algorithms';

export const CHEATSHEET_TABS: readonly CheatsheetTab[] = ['moves', 'f2l', 'algorithms'];

/** What the training section can show besides its menu: a scored mode, or the Cross Trainer (a guide, with no levels or points). */
export type TrainingScreen = DryMode | 'trainer';

export const TRAINING_SCREENS: readonly TrainingScreen[] = ['trainer', ...DRY_MODES];

/** The sections of the app next to the home page. */
export type Section = 'timer' | 'cheatsheet' | 'training';

export const SECTIONS: readonly Section[] = ['timer', 'cheatsheet', 'training'];

/** Where the app is, as written in the URL hash. */
export type Route =
  | { page: 'home' }
  | { page: 'timer' }
  | { page: 'cheatsheet'; tab: CheatsheetTab }
  | { page: 'training'; screen: TrainingScreen | null };

export const HOME: Route = { page: 'home' };

const TRAINING_SLUGS: Record<TrainingScreen, string> = {
  trainer: 'cross-trainer',
  hunter: 'edge-hunter',
  tracker: 'edge-tracker',
  miniCross: 'mini-cross',
  cross: 'cross-challenge',
};

/** The link to a route: `#/`, `#/timer`, `#/cheatsheet/f2l`, `#/training/mini-cross`, … */
export function routeHref(route: Route): string {
  switch (route.page) {
    case 'home':
      return '#/';
    case 'timer':
      return '#/timer';
    case 'cheatsheet':
      return route.tab === 'moves' ? '#/cheatsheet' : `#/cheatsheet/${route.tab}`;
    case 'training':
      return route.screen === null ? '#/training' : `#/training/${TRAINING_SLUGS[route.screen]}`;
  }
}

/** The route a URL hash stands for. Anything unknown is the home page; an unknown part of a section is the section's start. */
export function parseRoute(hash: string): Route {
  const [page, sub] = hash.replace(/^#/, '').split('/').filter(Boolean);
  switch (page) {
    case 'timer':
      return { page: 'timer' };
    case 'cheatsheet':
      return { page: 'cheatsheet', tab: CHEATSHEET_TABS.find((tab) => tab === sub) ?? 'moves' };
    case 'training':
      return { page: 'training', screen: TRAINING_SCREENS.find((screen) => TRAINING_SLUGS[screen] === sub) ?? null };
    default:
      return HOME;
  }
}
