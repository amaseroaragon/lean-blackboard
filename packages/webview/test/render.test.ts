// @vitest-environment jsdom
// Renders the real webview script (`src/main.ts`) in a simulated DOM with representative states.
// Guards against exceptions that would leave the panel showing a stale state.

import type { GoalView, PanelState } from '@lean-blackboard/core';
import { beforeAll, describe, expect, it } from 'vitest';

const posted: unknown[] = [];
const errors: unknown[] = [];

beforeAll(async () => {
  document.body.innerHTML = '<main id="root"></main>';
  const g = globalThis as Record<string, unknown>;
  g.acquireVsCodeApi = () => ({ postMessage: (m: unknown) => posted.push(m), getState: () => undefined, setState: () => {} });
  g.ResizeObserver = class {
    observe(): void {}
    disconnect(): void {}
  };
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
    original(...args);
  };
  await import('../src/main');
});

const root = () => document.getElementById('root') as HTMLElement;
const send = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }));
const show = (state: PanelState) => send({ type: 'state', state });

const goal = (typeLatex: string, type: string, hyps: [string, string][] = []): GoalView => ({
  kind: 'structured',
  prefix: '⊢ ',
  hyps: hyps.map(([n, t]) => ({ names: [n], namesLatex: n, type: t, typeLatex: t, isInserted: false, isRemoved: false })),
  type,
  typeLatex,
  isInserted: false,
  isRemoved: false,
});

const after = goal('a = b', 'a = b', [['h', 'a = b']]);
const before = goal('a + 0 = b \\cdot 1', 'a + 0 = b * 1', [['h', 'a = b']]);
const base = { kind: 'goals', location: 'Simp.lean:4:40', mode: 'fast' } as const;

describe('webview rendering', () => {
  it('one goal and no expected type (after `simp only [...]`) renders the new goal and Before', () => {
    show({ ...base, goals: [after], goalsBefore: [before] });
    expect(errors).toEqual([]);
    expect(root().querySelectorAll('section.goal')).toHaveLength(2);
    expect(root().querySelector('details.before')).not.toBeNull();
    expect(root().textContent).not.toContain('could not draw');
  });

  it('hides Before when nothing changed', () => {
    show({ ...base, goals: [after], goalsBefore: [after] });
    expect(root().querySelector('details.before')).toBeNull();
  });

  it('hides an expected type that repeats the only goal, shows a different one', () => {
    show({ ...base, goals: [after], termGoal: after });
    expect(root().textContent).not.toContain('Expected type');
    show({ ...base, goals: [after], termGoal: goal('\\mathbb{N}', 'Nat') });
    expect(root().textContent).toContain('Expected type');
  });

  it('no tactic state with an expected type', () => {
    show({ ...base, goals: null, termGoal: goal('p', 'p') });
    expect(root().textContent).toContain('Expected type');
    expect(root().textContent).not.toContain('No tactic state');
  });

  it('messages with expressions and embedded goals', () => {
    show({
      ...base,
      goals: [after],
      messages: [
        {
          severity: 'error',
          line: 3,
          parts: [
            { kind: 'text', text: 'unsolved goals\n' },
            { kind: 'expr', latex: 'n < 5', lean: 'n < 5' },
            { kind: 'goal', goal: before },
          ],
        },
      ],
    });
    expect(root().querySelector('.msg.error')).not.toBeNull();
    expect(root().querySelectorAll('.msg section.goal')).toHaveLength(1);
  });

  it('pins the current state and keeps it when the state changes', () => {
    show({ ...base, goals: [before] });
    send({ type: 'pin' });
    show({ ...base, location: 'Simp.lean:5:9', goals: [after] });
    expect(root().querySelectorAll('section.pin')).toHaveLength(1);
    expect(root().querySelector('section.pin')?.textContent).toContain('Simp.lean:4:40');
  });

  it('a state that cannot be drawn shows an error instead of the previous state', () => {
    show({ ...base, goals: [after] });
    // Malformed on purpose: a goal entry that is not an object.
    show({ ...base, goals: [null as unknown as GoalView] });
    expect(root().textContent).toContain('could not draw');
    errors.length = 0;
  });

  it('posts ready on load', () => {
    expect(posted).toContainEqual({ type: 'ready' });
  });
});
