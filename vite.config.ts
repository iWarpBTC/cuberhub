import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * What this build is: the version and the commit it was built from (with `+` when the working copy had
 * changes). The version is year.month.build, the build counting the month's releases; package.json has
 * it as npm wants it (26.11.1) and `npm run bump` moves it on, here it gets its two digits (26.11.01).
 */
function buildInfo() {
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  const git = (command: string) => execSync(`git ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  let commit = 'unknown';
  try {
    commit = git('rev-parse --short HEAD') + (git('status --porcelain') === '' ? '' : '+');
  } catch {
    // Not a git checkout (a source archive): the version alone has to do.
  }
  const shown = version
    .split('.')
    .map((part) => part.padStart(2, '0'))
    .join('.');
  return { version: shown, commit, date: new Date().toISOString() };
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __BUILD__: JSON.stringify(buildInfo()) },
  // The database starts workers and loads SQLite as WebAssembly, both by paths next to its own files,
  // which only hold while Vite serves those files as they are instead of prebundling them.
  optimizeDeps: { exclude: ['@evolu/web', '@evolu/sqlite-wasm'] },
  // Only this project's tests: Claude Code keeps whole copies of the repository under .claude/worktrees.
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
