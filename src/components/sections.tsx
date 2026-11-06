import type { CheatsheetTab, Route, Section } from '../lib/route';

export const APP_NAME = 'Cuber Hub';

/**
 * One cube colour per section, as a quiet accent next to its name or icon
 * (never the only thing telling sections apart).
 */
export const SECTION_ACCENT: Record<Section, string> = {
  timer: '#3b82f6',
  cheatsheet: '#facc15',
  training: '#22c55e',
};

/** Where a section opens; the cheatsheet comes back to the tab last looked at. */
export function sectionRoute(section: Section, cheatsheetTab: CheatsheetTab): Route {
  switch (section) {
    case 'timer':
      return { page: 'timer' };
    case 'cheatsheet':
      return { page: 'cheatsheet', tab: cheatsheetTab };
    case 'training':
      return { page: 'training', screen: null };
  }
}

export function SectionIcon({ section, className }: { section: Section; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {section === 'timer' ? (
        <>
          <circle cx="10" cy="11.25" r="6" />
          <path d="M10 8v3.25l2 1.5M8 2.75h4M10 2.75v2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : section === 'cheatsheet' ? (
        <path d="M3.75 4.5c2.25-.9 4.5-.9 6.25.5v11c-1.75-1.4-4-1.4-6.25-.5zM16.25 4.5c-2.25-.9-4.5-.9-6.25.5v11c1.75-1.4 4-1.4 6.25-.5z" strokeLinejoin="round" />
      ) : (
        <>
          <path d="M10 2.75l6.5 3.75v7l-6.5 3.75-6.5-3.75v-7z" strokeLinejoin="round" />
          <path d="M10 10l6.5-3.5M10 10v7.25M10 10L3.5 6.5" strokeLinejoin="round" />
          <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
