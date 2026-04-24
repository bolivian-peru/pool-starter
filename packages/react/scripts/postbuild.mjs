#!/usr/bin/env node
/**
 * Post-build: re-inject `"use client"` at the top of the client entry.
 * tsup strips top-level directives during bundling, but Next.js 13+ needs
 * this directive to treat the module as a Client Component.
 *
 * The server entry (dist/server.*) must NOT have this directive — it runs
 * on the server only. That's why we patch specific files by name.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'dist');
const src = resolve(here, '..', 'src');

const CLIENT_FILES = ['index.mjs', 'index.cjs'];
const DIRECTIVE = `"use client";\n`;

for (const name of CLIENT_FILES) {
  const p = resolve(dist, name);
  if (!existsSync(p)) continue;
  const body = readFileSync(p, 'utf8');
  if (body.startsWith('"use client"') || body.startsWith("'use client'")) continue;
  writeFileSync(p, DIRECTIVE + body);
  console.log(`✓ Added "use client" to dist/${name}`);
}

// Copy the CSS next to the build output so the export map resolves it.
copyFileSync(resolve(src, 'styles.css'), resolve(dist, 'styles.css'));
console.log('✓ Copied styles.css');
