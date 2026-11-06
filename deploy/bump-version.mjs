#!/usr/bin/env node
// Gives the app its next version: year.month.build, where the build counts the releases of the month
// (26.11.01, 26.11.02, …, then 26.12.01). Run it before the commit that is to be released:
//
//   npm run bump
//
// package.json holds the version the way npm accepts it, without leading zeros (26.11.1); the app shows
// it with two digits each (vite.config.ts).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version: current } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const now = new Date();
const year = now.getFullYear() % 100;
const month = now.getMonth() + 1;
const [y, m, build] = current.split('.').map(Number);
// The first release of a month starts its count again.
const next = `${year}.${month}.${y === year && m === month ? build + 1 : 1}`;

// npm writes it to package.json and package-lock.json; the commit is left to you.
execFileSync('npm', ['version', next, '--no-git-tag-version'], { cwd: root, stdio: 'ignore' });

const shown = (version) => version.split('.').map((part) => part.padStart(2, '0')).join('.');
console.log(`${shown(current)} → ${shown(next)}`);
