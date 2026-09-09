import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installNativeViewport } from '../../src/mobile/viewport';

// Exercise real event ordering: focus precedes keyboard resize, blur precedes restoration.
test('native viewport reveals editing fields after resize, restores tabs, and cleans up listeners', () => {
  const events = new EventTarget();
  const viewport = Object.assign(new EventTarget(), { height: 800, scale: 1, offsetTop: 0 });
  const properties = new Map<string, string>();
  const classes = new Set<string>();
  let visible = 0;
  let frame: (() => void) | undefined;
  class Element {
    matches() { return true; }
    scrollIntoView(options: ScrollIntoViewOptions) { assert.equal(options.block, 'center'); visible++; }
  }
  const doc = Object.assign(events, { activeElement: null as Element | null, documentElement: {
    style: { setProperty: (name: string, value: string) => properties.set(name, value) },
    classList: { toggle: (name: string, value: boolean) => value ? classes.add(name) : classes.delete(name) },
  } });
  const win = Object.assign(new EventTarget(), { visualViewport: viewport, innerHeight: 800 });
  const originals = Object.getOwnPropertyDescriptors(globalThis);
  Object.assign(globalThis, { window: win, document: doc, HTMLElement: Element,
    requestAnimationFrame: (callback: () => void) => { frame = callback; return 1; },
    cancelAnimationFrame: () => { frame = undefined; },
  });
  try {
    const dispose = installNativeViewport();
    assert.equal(properties.get('--native-viewport-height'), '800px');
    doc.activeElement = new Element();
    doc.dispatchEvent(new Event('focusin'));
    assert.ok(classes.has('native-editing'));
    viewport.height = 390;
    viewport.dispatchEvent(new Event('resize'));
    frame?.();
    assert.equal(visible, 1);
    assert.equal(properties.get('--native-viewport-height'), '390px');
    viewport.offsetTop = 22;
    viewport.dispatchEvent(new Event('scroll'));
    assert.equal(properties.get('--native-viewport-top'), '22px', 'iOS viewport panning must not move the header under the status bar');
    viewport.scale = 2;
    viewport.height = 195;
    viewport.dispatchEvent(new Event('resize'));
    assert.equal(properties.get('--native-viewport-height'), '390px', 'pinch zoom must not shrink the shell');
    viewport.scale = 1;
    doc.activeElement = null;
    viewport.height = 800;
    viewport.dispatchEvent(new Event('resize'));
    assert.equal(classes.has('native-editing'), false);
    assert.equal(properties.get('--native-viewport-height'), '800px');
    dispose();
    viewport.height = 300;
    viewport.dispatchEvent(new Event('resize'));
    assert.equal(properties.get('--native-viewport-height'), '800px');
  } finally {
    for (const key of ['window', 'document', 'HTMLElement', 'requestAnimationFrame', 'cancelAnimationFrame']) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
