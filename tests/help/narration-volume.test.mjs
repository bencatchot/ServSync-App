import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildSceneAudioFilter } from '../../scripts/help/retime-narrated-help-recording.mjs';

test('retiming preserves original loudness for both early and late narration', t => {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  if (spawnSync(ffmpeg, ['-version']).error?.code === 'ENOENT') {
    t.skip('FFmpeg is needed for the audio signal regression');
    return;
  }
  const segments = [
    { sourceStart: 0, sourceEnd: 0.5, outputSegmentStart: 0 },
    { sourceStart: 0.5, sourceEnd: 1, outputSegmentStart: 1 },
    { sourceStart: 1, sourceEnd: 1.5, outputSegmentStart: 2 },
  ];
  const result = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=48000:duration=1.5',
    '-filter_complex', buildSceneAudioFilter(segments), '-map', '[a]',
    '-f', 'f32le', '-ac', '1', 'pipe:1',
  ]);
  assert.equal(result.status, 0, result.stderr?.toString());
  function rms(start, end) {
    let sum = 0;
    const first = Math.round(start * 48000);
    const last = Math.round(end * 48000);
    for (let i = first; i < last; i++) sum += result.stdout.readFloatLE(i * 4) ** 2;
    return Math.sqrt(sum / (last - first));
  }
  const expected = 0.125 / Math.sqrt(2);
  for (const start of [0.1, 1.1, 2.1]) assert.ok(Math.abs(rms(start, start + 0.2) - expected) < 0.001);
  assert.ok(rms(0.6, 0.8) < 0.00001, 'quiet scene gaps stay silent');
});
