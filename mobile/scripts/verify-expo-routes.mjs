#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const callbackFile = path.join(projectRoot, 'app', 'google-calendar-callback.tsx');
const oauthRedirectFile = path.join(projectRoot, 'app', 'oauthredirect.tsx');
const oauthRedirectLegacyFile = path.join(projectRoot, 'app', '--', 'oauthredirect.tsx');
const layoutFile = path.join(projectRoot, 'app', '_layout.tsx');
const routerTypesFile = path.join(projectRoot, '.expo', 'types', 'router.d.ts');
const expectedPaths = ['/google-calendar-callback', '/oauthredirect', '/--/oauthredirect'];
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
pass('found app/google-calendar-callback.tsx');

if (!fs.existsSync(oauthRedirectFile)) {
  fail(`missing ${path.relative(projectRoot, oauthRedirectFile)}`);
}
pass('found app/oauthredirect.tsx');

if (!fs.existsSync(oauthRedirectLegacyFile)) {
  fail(`missing ${path.relative(projectRoot, oauthRedirectLegacyFile)}`);
}
pass('found app/--/oauthredirect.tsx');

const callbackDir = path.join(projectRoot, 'app', 'google-calendar-callback');
if (fs.existsSync(callbackDir)) {
  fail(
    'remove app/google-calendar-callback/ directory — use app/google-calendar-callback.tsx only',
  );
}

const layoutSource = fs.readFileSync(layoutFile, 'utf8');
if (
  /<Stack\.Screen\b[^>]*>/m.test(layoutSource) &&
  !layoutSource.includes('name="google-calendar-callback"')
) {
  fail('app/_layout.tsx must declare Stack.Screen name="google-calendar-callback"');
}
pass('root Stack registers google-calendar-callback');

if (fs.existsSync(routerTypesFile)) {
  const routerTypes = fs.readFileSync(routerTypesFile, 'utf8');
  for (const expectedPath of expectedPaths) {
    if (!routerTypes.includes(`pathname: \`${expectedPath}\``)) {
      fail(`Expo typed routes missing ${expectedPath} (run "npx expo start" once to regenerate)`);
    }
    pass(`typed route registered: ${expectedPath}`);
  }
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
  const folderHtmlPath = path.join(outputDir, 'google-calendar-callback', 'index.html');
  const resolvedHtmlPath = fs.existsSync(htmlPath)
    ? htmlPath
    : fs.existsSync(folderHtmlPath)
      ? folderHtmlPath
      : null;

  if (!resolvedHtmlPath) {
    fail(`static export did not generate ${expectedPath}`);
  }
  const html = fs.readFileSync(resolvedHtmlPath, 'utf8');
  if (!html.includes('Connecting Google Calendar')) {
    fail(`${expectedPath} export does not render the callback screen`);
  }
  pass(`static export renders callback screen at ${expectedPath}`);
}

pass('OK');
