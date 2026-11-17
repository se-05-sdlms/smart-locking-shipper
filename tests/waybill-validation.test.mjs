import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/app/waybill-validation.ts', import.meta.url), 'utf8');
const compiledModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: compiledModule, exports: compiledModule.exports });
const { MAX_WAYBILL_IMAGE_BYTES, validateWaybillFile } = compiledModule.exports;

test('accepts JPEG/PNG at or below the 5 MiB backend boundary', () => {
  assert.equal(validateWaybillFile({ name: 'waybill.jpg', type: 'image/jpeg', size: MAX_WAYBILL_IMAGE_BYTES }).valid, true);
  assert.equal(validateWaybillFile({ name: 'waybill.png', type: 'image/png', size: 1 }).valid, true);
});

test('rejects unsupported types and files above 5 MiB before upload', () => {
  const unsupported = validateWaybillFile({ name: 'waybill.pdf', type: 'application/pdf', size: 1 });
  assert.equal(unsupported.valid, false);
  assert.equal(unsupported.message, 'Chỉ hỗ trợ ảnh JPEG hoặc PNG.');
  const oversized = validateWaybillFile({ name: 'waybill.jpg', type: 'image/jpeg', size: MAX_WAYBILL_IMAGE_BYTES + 1 });
  assert.equal(oversized.valid, false);
  assert.equal(oversized.message, 'Ảnh không được vượt quá 5 MB.');
});

test('uses the extension when browser metadata omits MIME type', () => {
  assert.equal(validateWaybillFile({ name: 'waybill.jpeg', size: 1 }).valid, true);
  assert.equal(validateWaybillFile({ name: 'waybill.gif', size: 1 }).valid, false);
});
