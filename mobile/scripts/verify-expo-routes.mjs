#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const callbackFile = path.join(projectRoot, 'app', 'google-calendar-callback.tsx');
const layoutFile = path.join(projectRoot, 'app', '_layout.tsx');
const routerTypesFile = path.join(projectRoot, '.expo', 'types', 'router.d.ts');
const expectedPath = '/google-calendar-callback';
const runFullExport = process.argv.includes('--export');

function fail(message) {
  console.error(`verify:routes — ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`verify:routes — ${message}`);
}

if (!fs.existsSync(callbackFile)) {
  fail(`missing ${path.relative(projectRoot, callbackFile)}`);
}
pass(`found app/google-calendar-callback.tsx`);

const layoutSource = fs.readFileSync(layoutFile, 'utf8');
if (
  /<Stack\.Screen\b[^>]*>/m.test(layoutSource) &&
  !layoutSource.includes('name="google-calendar-callback"') &&
  !layoutSource.includes("name='google-calendar-callback'")
) {
  fail(
    'app/_layout.tsx declares explicit Stack.Screen children but omits google-calendar-callback',
  );
}
pass('root Stack will register file-based routes (no blocking explicit screen list)');

if (fs.existsSync(routerTypesFile)) {
  const routerTypes = fs.readFileSync(routerTypesFile, 'utf8');
  if (!routerTypes.includes(`pathname: \`${expectedPath}\``)) {
    fail(`Expo typed routes missing ${expectedPath} (run "npx expo start" once to regenerate)`);
  }
  pass(`typed route registered: ${expectedPath}`);
} else {
  console.warn(
    'verify:routes — .expo/types/router.d.ts not found; run "npx expo start" to generate typed routes',
  );
}

if (runFullExport) {
  const outputDir = path.join(projectRoot, '.expo-route-verify');
  fs.rmSync(outputDir, { recursive: true, force: true });
  execSync(`npx expo export --platform web --output-dir ${outputDir}`, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  const htmlPath = path.join(outputDir, 'google-calendar-callback.html');
  if (!fs.existsSync(htmlPath)) {
    fail(`static export did not generate ${expectedPath}`);
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  if (!html.includes('Connecting Google Calendar')) {
    fail(`${expectedPath} export does not render the callback screen`);
  }
  pass(`static export renders callback screen at ${expectedPath}`);
}

pass('OK');
