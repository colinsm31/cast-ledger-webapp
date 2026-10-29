import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createRequestTracker, useLatestRequest } from './latestRequest';

describe('createRequestTracker', () => {
  it('only the latest request is current', () => {
    const tracker = createRequestTracker();
    const first = tracker.start();
    expect(first()).toBe(true);
    const second = tracker.start();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('a late answer to an older request is out of date, whatever order they finish in', async () => {
    const tracker = createRequestTracker();
    const shown: string[] = [];
    const request = async (label: string, delay: number) => {
      const isLatest = tracker.start();
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (isLatest()) shown.push(label);
    };
    await Promise.all([request('Year to date', 30), request('Today', 5)]);
    expect(shown).toEqual(['Today']);
  });

  it('cancel makes every started request out of date', () => {
    const tracker = createRequestTracker();
    const pending = tracker.start();
    tracker.cancel();
    expect(pending()).toBe(false);
    expect(tracker.start()()).toBe(true);
  });
});

describe('useLatestRequest', () => {
  it("gives a component its own tracker, where only the latest request is current", () => {
    let startRequest: (() => () => boolean) | undefined;
    function Page() {
      startRequest = useLatestRequest();
      return null;
    }
    renderToString(createElement(Page));
    const first = startRequest!();
    const second = startRequest!();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
