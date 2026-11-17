import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/app/session-generation.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module, exports: module.exports });
const { createSessionGenerationGate } = module.exports;

test('stale resolve after reset cannot commit over the new session', async () => {
  const old = Promise.withResolvers();
  const next = Promise.withResolvers();
  const committed = [];
  let starts = 0;
  const gate = createSessionGenerationGate();
  const start = () => starts++ === 0 ? old.promise : next.promise;
  const oldRequest = gate.ensure(start, (value) => committed.push(value));
  gate.reset();
  const newRequest = gate.ensure(start, (value) => committed.push(value));
  old.resolve({ id: 'old' });
  await assert.rejects(oldRequest, /superseded/);
  assert.deepEqual(committed, []);
  next.resolve({ id: 'new' });
  assert.deepEqual(await newRequest, { id: 'new' });
  assert.deepEqual(committed, [{ id: 'new' }]);
});

test('stale rejection does not clear or poison the new pending request', async () => {
  const old = Promise.withResolvers();
  const next = Promise.withResolvers();
  const committed = [];
  let starts = 0;
  const gate = createSessionGenerationGate();
  const start = () => starts++ === 0 ? old.promise : next.promise;
  const oldRequest = gate.ensure(start, (value) => committed.push(value));
  gate.reset();
  const newRequest = gate.ensure(start, (value) => committed.push(value));
  old.reject(new Error('old network failure'));
  await assert.rejects(oldRequest, /old network failure/);
  assert.deepEqual(committed, []);
  next.resolve({ id: 'new' });
  assert.deepEqual(await newRequest, { id: 'new' });
  assert.deepEqual(committed, [{ id: 'new' }]);
});
