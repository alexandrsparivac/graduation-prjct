import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Express serves the source files directly; no bundle or transpilation is needed.
// Check both JavaScript modules and inline scripts without executing browser code.
const root = fileURLToPath(new URL('..', import.meta.url));
let checked = 0;
let failed = 0;

function check(label, args, input) {
  const result = spawnSync(process.execPath, ['--check', ...args], {
    cwd: root, encoding: 'utf8', input, timeout: 10_000,
  });
  checked++;
  if (result.error || result.status !== 0) {
    failed++;
    console.error(`${label}:\n${result.error?.message || result.stderr || 'Syntax check failed'}`);
  }
}

async function checkFile(file) {
  if (file.endsWith('.js')) {
    check(file, [file]);
  } else if (file.endsWith('.html')) {
    const html = await readFile(path.join(root, file), 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const [, attrs, source] = match;
      if (/\bsrc\s*=/i.test(attrs) || !source.trim()) continue;
      const type = /\btype\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1].toLowerCase();
      if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
      const line = html.slice(0, match.index).split('\n').length;
      check(`${file}:${line}`, [`--input-type=${type === 'module' ? 'module' : 'commonjs'}`], source);
    }
  }
}

async function walk(dir) {
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) await checkFile(file);
  }
}

await checkFile('server.js');
for (const dir of ['lib', 'shared', 'tools', 'test']) await walk(dir);

if (failed) {
  console.error(`Build validation failed: ${failed} of ${checked} scripts.`);
  process.exitCode = 1;
} else {
  console.log(`Build validation passed: ${checked} scripts. Start the app with npm start.`);
}
