import { fetchIndividualImage, fetchSpeciesImage } from './syncService';

/**
 * Prioritised, rate-limited queue for lazily fetching full-size images from the API.
 *
 * Why: the sync payload leaves most images out, so they are fetched one request each. Firing
 * all of them at once saturates the browser's per-host connection limit and starves the images
 * the user is actually looking at (e.g. the Species page waiting behind Individuals images).
 *
 *  - 'high' priority: items on the page the user is looking at (and anything they just
 *    searched/filtered to). Served first, in the order requested (top of page first).
 *  - 'low' priority: background restore of everything else.
 *  - A page cancels its group on unmount / filter change; queued items it no longer needs are
 *    dropped (or demoted to 'low' if the background restore also wants them).
 */

type Priority = 'high' | 'low';

interface Task {
  key: string;
  priority: Priority;
  group?: string;
  background: boolean; // also wanted by the background restore, so never fully cancel
  run: () => Promise<string | null>;
  promise: Promise<string | null>;
  resolve: (v: string | null) => void;
  started: boolean;
}

// Leave connections free for ordinary <img> loads (browsers allow ~6 per host on HTTP/1.1).
const MAX_CONCURRENT = 3;

const tasks = new Map<string, Task>();
const queue: Task[] = [];
let running = 0;

const pump = () => {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    let idx = queue.findIndex(t => t.priority === 'high');
    if (idx < 0) idx = 0;
    const task = queue.splice(idx, 1)[0];
    task.started = true;
    running++;
    task.run()
      .then(task.resolve, () => task.resolve(null))
      .finally(() => {
        running--;
        tasks.delete(task.key);
        pump();
      });
  }
};

const enqueue = (
  key: string,
  run: () => Promise<string | null>,
  priority: Priority,
  group?: string
): Promise<string | null> => {
  const existing = tasks.get(key);
  if (existing) {
    if (priority === 'low') existing.background = true;
    // A page now wants something the background was already going to fetch: bump it.
    if (!existing.started && priority === 'high') {
      existing.priority = 'high';
      existing.group = group;
      // Re-queue at the back of the high-priority items so page order is preserved.
      const i = queue.indexOf(existing);
      if (i >= 0) { queue.splice(i, 1); queue.push(existing); }
    }
    return existing.promise;
  }
  let resolve!: (v: string | null) => void;
  const promise = new Promise<string | null>(r => { resolve = r; });
  const task: Task = { key, priority, group, background: priority === 'low', run, promise, resolve, started: false };
  tasks.set(key, task);
  queue.push(task);
  pump();
  return promise;
};

/** Drop (or demote) queued high-priority work belonging to a page that no longer needs it. */
export const cancelImageGroup = (group: string) => {
  for (let i = queue.length - 1; i >= 0; i--) {
    const t = queue[i];
    if (t.group !== group || t.priority !== 'high') continue;
    if (t.background) {
      t.priority = 'low';
      t.group = undefined;
    } else {
      queue.splice(i, 1);
      tasks.delete(t.key);
      t.resolve(null);
    }
  }
};

export const queueIndividualImage = (id: string, opts: { priority?: Priority; group?: string } = {}) =>
  enqueue(`ind:${id}`, () => fetchIndividualImage(id), opts.priority ?? 'low', opts.group);

export const queueSpeciesImage = (id: string, opts: { priority?: Priority; group?: string } = {}) =>
  enqueue(`sp:${id}`, () => fetchSpeciesImage(id), opts.priority ?? 'low', opts.group);

/**
 * Collect results as they arrive and flush them in batches, so a page doesn't re-render and
 * rewrite the whole local cache once per image.
 */
export const createBatcher = <T>(flush: (items: T[]) => void, delayMs = 400) => {
  let buffer: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    timer = null;
    if (buffer.length === 0) return;
    const items = buffer;
    buffer = [];
    flush(items);
  };
  return {
    add: (item: T) => { buffer.push(item); if (!timer) timer = setTimeout(run, delayMs); },
    flushNow: () => { if (timer) clearTimeout(timer); run(); },
  };
};
