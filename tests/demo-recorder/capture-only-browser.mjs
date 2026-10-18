// Isolated synthetic browser test. This is not a recording of the deployed Demo or a marketing asset.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CAPTURE_APP, CAPTURE_API, installCaptureGuard } from '../../scripts/demo/recorder/capture-only-policy.mjs';
import { inspectMotionFile } from '../../scripts/demo/capture-existing-demo.mjs';
const exec = promisify(execFile);
const base = resolve('test-results/capture-only'); await mkdir(base, { recursive: true });
const dir = await mkdtemp(join(base, 'browser-'));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, recordVideo: { dir, size: { width: 960, height: 720 } }, serviceWorkers: 'block', permissions: [] });
  const upstream = [];
  // All approved test requests terminate here: no live API or app traffic in this test.
  await context.route('**/*', async route => {
    upstream.push({ method: route.request().method(), url: route.request().url() });
    if (new URL(route.request().url()).origin === CAPTURE_APP) return route.fulfill({ contentType: 'text/html', body: `<style>body{font:30px sans-serif;background:#def;margin:30px}section{height:700px;border:5px solid #789;padding:30px}button{font:30px sans-serif;padding:20px}</style><h1>SYNTHETIC RECORDER TEST</h1><button onclick="document.querySelector('#detail').hidden=false">Open test detail</button><section id="detail" hidden><h2>Test detail opened</h2><p>This page tests actual browser motion.</p></section><section><h2>Test confirmation</h2></section>` });
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': CAPTURE_APP }, body: '[]' });
  });
  const counters = await installCaptureGuard(context);
  const page = await context.newPage();
  await page.goto(CAPTURE_APP);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Open test detail' }).click();
  await page.waitForTimeout(1800);
  for (let i = 0; i < 35; i++) { await page.mouse.wheel(0, 20); await page.waitForTimeout(60); }
  await page.waitForTimeout(1800);
  const read = await page.evaluate(async api => {
    const r = await fetch(api + '/rest/v1/rpc/servsync_homeowner_service_requests', { method: 'POST', body: '{}' }); return r.ok;
  }, CAPTURE_API);
  assert.equal(read, true);
  const written = await page.evaluate(async api => {
    try { await fetch(api + '/rest/v1/service_requests', { method: 'POST', body: '{}' }); return true; } catch { return false; }
  }, CAPTURE_API);
  assert.equal(written, false);
  assert.equal(upstream.some(r => r.method === 'POST'), false);
  assert.equal(upstream.some(r => r.url.includes('/rpc/servsync_homeowner_service_requests') && r.method === 'GET'), true);
  assert.equal(counters.rewrittenReadRpcs, 1);
  const video = page.video(); await context.close();
  const output = join(dir, 'synthetic-motion-test.mp4');
  await exec('ffmpeg', ['-y', '-v', 'error', '-i', await video.path(), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', output]);
  const inspection = await inspectMotionFile(output);
  assert.ok(inspection.changedFramePairs >= 3);
  console.log(JSON.stringify({ status: 'passed', syntheticTestOnly: true, liveNetwork: false, writeReachedUpstream: false, inspection }));
} finally { await browser.close(); }
