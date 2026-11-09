// Runs inside the test VS Code (see runTest.ts). A minimal runner: no test framework needed.
// Covers the Phase 0 acceptance criteria plus the panel behaviour end to end.

import * as assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, readlinkSync } from 'node:fs';
import * as vscode from 'vscode';
import { stripMarkers } from '@lean-blackboard/core';
import type { PanelState } from '@lean-blackboard/core';
import type { LeanBlackboardApi } from '../../src/extension';

const tests: { name: string; fn: () => Promise<void> }[] = [];
function test(name: string, fn: () => Promise<void>): void {
  tests.push({ name, fn });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(what: string, probe: () => T | undefined, timeoutMs = 180_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = probe();
    if (v !== undefined) return v;
    if (Date.now() - t0 > timeoutMs) {
      const s = api?.panelState();
      const detail = s?.kind === 'goals' ? `mode ${s.mode}, ${s.goals?.length ?? 'null'} goal(s)` : s?.kind;
      throw new Error(`Timed out waiting for ${what} (panel: ${detail})`);
    }
    await sleep(250);
  }
}

/** Parent pid from `/proc/<pid>/stat` (Linux). */
function parentPid(pid: number): number | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // Field 4, after the parenthesised command name (which may contain spaces).
    return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
  } catch {
    return undefined;
  }
}

function descendsFrom(pid: number, ancestor: number): boolean {
  for (let p: number | undefined = pid; p !== undefined && p > 1; p = parentPid(p)) {
    if (p === ancestor) return true;
  }
  return false;
}

let api: LeanBlackboardApi;
const workspace = () => vscode.workspace.workspaceFolders![0].uri;

async function openAt(file: string, needle: string, column: 'start' | 'needle' = 'start'): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspace(), file));
  const editor = await vscode.window.showTextDocument(doc);
  const line = doc.getText().split('\n').findIndex((l) => l.includes(needle));
  assert.ok(line >= 0, `"${needle}" not found in ${file}`);
  const text = doc.lineAt(line).text;
  const character = column === 'needle' ? text.indexOf(needle) : text.search(/\S/);
  // Move away and back so that a selection change always fires.
  editor.selection = new vscode.Selection(0, 0, 0, 0);
  await sleep(50);
  editor.selection = new vscode.Selection(line, character, line, character);
  return editor;
}

type GoalsState = Extract<PanelState, { kind: 'goals' }>;
const goalsWhere = (pred: (s: GoalsState) => boolean) => () => {
  const s = api.panelState();
  return s.kind === 'goals' && pred(s) ? s : undefined;
};
const allLatex = (s: GoalsState) =>
  (s.goals ?? []).flatMap((g) => (g.kind === 'structured' ? [g.typeLatex, ...g.hyps.map((h) => h.typeLatex)] : [])).join(' ');

test('activates and waits without a Lean file (no errors)', async () => {
  const ext = vscode.extensions.getExtension<LeanBlackboardApi>('amaseroaragon.lean-blackboard');
  assert.ok(ext, 'extension not found');
  api = await ext.activate();
  assert.equal(api.panelState().kind, 'waiting');
  // Commands must not throw before Lean is ready.
  await vscode.commands.executeCommand('leanBlackboard.copyGoalState');
});

test('precise mode: goals with type-aware LaTeX', async () => {
  await vscode.commands.executeCommand('leanBlackboard.goals.focus');
  await openAt('LeanSample.lean', 'exact hpq hp');
  const s = await waitFor('precise goals', goalsWhere((s) => s.mode === 'precise' && (s.goals?.length ?? 0) > 0));
  assert.match(allLatex(s), /\\Rightarrow/);
  assert.ok((s.subexprs?.length ?? 0) > 0, 'interactive subterm table expected');
});

test('fast mode in a file without the companion import', async () => {
  await openAt('FastSample.lean', 'exact hqr (hpq hp)');
  const s = await waitFor('fast goals', goalsWhere((s) => s.mode === 'fast' && (s.goals?.length ?? 0) > 0));
  assert.match(allLatex(s), /\\to/);
});

test('expected type in term mode', async () => {
  await openAt('LeanSample.lean', 'h (by decide)', 'needle');
  const s = await waitFor('term goal', goalsWhere((s) => s.termGoal !== undefined));
  assert.equal(s.termGoal?.kind === 'structured' && s.termGoal.typeLatex.includes('<'), true);
});

test('definitions: signature and equations (precise mode)', async () => {
  await openAt('LeanSample.lean', '| n + 1 => (n + 1) * factorial n');
  const s = await waitFor('definition', goalsWhere((s) => s.mode === 'precise' && (s.definitions?.length ?? 0) > 0));
  const def = s.definitions?.[0];
  assert.equal(def?.name, 'factorial');
  assert.match(stripMarkers(def?.typeLatex ?? ''), /\\mathbb\{N\} \\to \\mathbb\{N\}/);
  assert.equal(def?.equations.length, 2);
  assert.match(stripMarkers(def?.equations[1]?.latex ?? ''), /\\cdot/);
  assert.equal(s.goals, null);
});

test('structure fields and inductive constructors (precise mode)', async () => {
  await openAt('LeanSample.lean', 'valid : lo ≤ hi');
  const st = await waitFor('structure', goalsWhere((s) => s.definitions?.[0]?.kind === 'structure'));
  assert.deepEqual(st.definitions?.[0]?.members.map((m) => m.name), ['lo', 'hi', 'valid']);
  assert.match(stripMarkers(st.definitions?.[0]?.members[2]?.typeLatex ?? ''), /\\mathrm\{lo\} \\leq \\mathrm\{hi\}/);
  await openAt('LeanSample.lean', '| node : Tree → Nat → Tree → Tree');
  const ind = await waitFor('inductive', goalsWhere((s) => s.definitions?.[0]?.kind === 'inductive'));
  assert.deepEqual(ind.definitions?.[0]?.members.map((m) => m.name), ['leaf', 'node']);
});

test('definitions in fast mode (source equations, Lean type)', async () => {
  await openAt('FastSample.lean', '| n + 1 => double n + 2');
  const s = await waitFor('fast definition', goalsWhere((s) => s.mode === 'fast' && s.definitions?.[0]?.name === 'double'));
  const def = s.definitions?.[0];
  assert.equal(def?.type, 'Nat → Nat');
  assert.deepEqual(def?.equations.map((e) => e.lean), ['double 0 = 0', 'double (n + 1) = double n + 2']);
  assert.match(def?.equations[1]?.latex ?? '', /\\operatorname\{double\}\\left\(n \+ 1\\right\)/);
});

test('Before/After with changed subterms (precise mode)', async () => {
  const editor = await openAt('LeanSample.lean', 'rw [Nat.mul_comm]');
  const line = editor.selection.active.line;
  editor.selection = new vscode.Selection(line, 100, line, 100); // end of line
  const s = await waitFor('goals before', goalsWhere((s) => s.mode === 'precise' && (s.goalsBefore?.length ?? 0) > 0));
  const before = s.goalsBefore?.[0];
  const after = s.goals?.[0];
  assert.ok(before?.kind === 'structured' && before.typeLatex.includes('lbdiff=old'), 'old subterm marked');
  assert.ok(after?.kind === 'structured' && after.typeLatex.includes('lbdiff=new'), 'new subterm marked');
});

test('Before in fast mode', async () => {
  const editor = await openAt('FastSample.lean', 'intro hpq hqr hp');
  const line = editor.selection.active.line;
  editor.selection = new vscode.Selection(line, 100, line, 100);
  await waitFor('fast goals before', goalsWhere((s) => s.mode === 'fast' && (s.goalsBefore?.length ?? 0) > 0));
});

test('messages with expressions on the cursor line', async () => {
  await openAt('Errors.lean', 'exact h');
  const s = await waitFor('messages', goalsWhere((s) => (s.messages ?? []).some((m) => m.severity === 'error')));
  const parts = s.messages?.flatMap((m) => m.parts) ?? [];
  assert.ok(parts.some((p) => p.kind === 'expr' && p.latex.includes('<')), 'expression rendered as maths');
});

test('goals update after an edit while the file keeps elaborating (simp only)', async () => {
  const editor = await openAt('Ticks.lean', 'simp only [Nat.add_zero, Nat.mul_one]');
  await waitFor('initial goals', goalsWhere((s) => (s.goals?.length ?? 0) > 0));
  // Edit inside the brackets (as when typing a lemma), which re-elaborates the rest of the file:
  // its slow commands keep changing the diagnostics for a few seconds.
  const line = editor.selection.active.line;
  const text = editor.document.lineAt(line).text;
  const inside = text.indexOf('Nat.mul_one');
  await editor.edit((b) => b.insert(new vscode.Position(line, inside), ' '));
  // Then click after `]`: the panel must show the state after `simp only` while the rest of the
  // file is still elaborating, not only once everything is done.
  const after = editor.document.lineAt(line).text.indexOf(']') + 1;
  editor.selection = new vscode.Selection(line, after, line, after);
  const t0 = Date.now();
  await waitFor(
    'goals after simp',
    goalsWhere((s) => s.goals?.[0]?.kind === 'structured' && /a = b/.test(s.goals[0].type)),
    20_000,
  );
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2500, `goals took ${elapsed} ms to update (the file was still elaborating)`);
  await editor.edit((b) => b.delete(new vscode.Range(line, inside, line, inside + 1)));
});

test('pin command runs', async () => {
  await vscode.commands.executeCommand('leanBlackboard.pinGoalState');
});

test('a single Lean server process for the project', async () => {
  if (process.platform !== 'linux') return;
  const root = workspace().fsPath;
  const pids = execSync('pgrep -f "lake serve" || true').toString().split('\n').filter(Boolean);
  // Only servers started by this test instance (the user may have other VS Code windows open).
  const ours = pids.filter((pid) => {
    try {
      return readlinkSync(`/proc/${pid}/cwd`) === root && descendsFrom(Number(pid), process.pid);
    } catch {
      return false;
    }
  });
  assert.equal(ours.length, 1, `expected one 'lake serve' in ${root}, found ${ours.length}`);
});

test('RPC session stays alive after more than 30 s idle', async () => {
  await sleep(40_000);
  await openAt('LeanSample.lean', 'apply hqr');
  await waitFor('goals after idle', goalsWhere((s) => s.mode === 'precise' && allLatex(s).includes('\\Rightarrow')), 30_000);
});

test('recovers after "Lean 4: Restart Server"', async () => {
  await vscode.commands.executeCommand('lean4.restartServer');
  await sleep(2000);
  await openAt('LeanSample.lean', 'intro hpq hqr hp');
  await waitFor('goals after restart', goalsWhere((s) => s.mode === 'precise' && (s.goals?.length ?? 0) > 0));
});

export async function run(): Promise<void> {
  const failures: string[] = [];
  for (const t of tests) {
    const t0 = Date.now();
    try {
      await t.fn();
      console.log(`  ✓ ${t.name} (${Date.now() - t0} ms)`);
    } catch (e) {
      console.log(`  ✗ ${t.name}\n      ${e instanceof Error ? e.message : String(e)}`);
      failures.push(t.name);
    }
  }
  if (failures.length > 0) throw new Error(`${failures.length} integration test(s) failed`);
}
