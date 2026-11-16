import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
const load = createRequire(import.meta.url);
const ts = load("typescript");

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const session = (id = 'session-A', token = 'token-A') => ({ id, guestSessionToken: token });
class DeliveryApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

// Execute the production hook with deterministic effects/timers and controlled API outcomes.
// No source matching, snapshots, dependencies or live server are needed.
function harness(flow = false) {
  const slots = [], effects = [], timers = new Map(), calls = [];
  let cursor = 0, nextTimer = 0, result, queued = false, mounted = true;
  const submits = [];
  let args = ['0901234567', session(), true, true, 0];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const schedule = () => {
    if (queued || !mounted) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (mounted) render(); });
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, value => {
        if (typeof value === "function") value = value(slots[index].value);
        if (Object.is(slots[index].value, value)) return;
        slots[index].value = value; schedule();
      }];
    },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { value: fn, deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (same(slots[i]?.deps, deps)) return;
      const previous = slots[i];
      const slot = { deps };
      slots[i] = slot;
      effects.push(() => { previous?.cleanup?.(); slot.cleanup = fn(); });
    },
  };
  const api = {
    DeliveryApiError,
    resolveRecipient(...request) { const response = deferred(); calls.push({ request, response }); return response.promise; },
    scanWaybill: async () => ({ status: 'Succeeded', phones: ['0901234567', '0909999999'], isMasked: false }),
    submitDelivery(...request) { const response = deferred(); submits.push({ request, response }); return response.promise; },
  };
  const data = new Map([['boxora.delivery.draft', JSON.stringify({ lockerCode: 'LKR-A', session: { ...session(), sessionExpiresAt: '2099-01-01' } })]]);
  const card = Object.assign(() => {}, { Content: 'Card.Content' });
  const ui = new Proxy({ Card: card }, { get: (target, name) => target[name] ?? name });
  const tag = (type, props) => ({ type, props: props ?? {} });
  const compiledHook = { exports: {} };
  const context = {
    module: compiledHook, exports: compiledHook.exports, Error, URL, Date, console,
    process: { env: { NODE_ENV: 'development' } },
    createImageBitmap: async () => ({ width: 100, height: 100, close() {} }),
    File: class { constructor(_parts, name) { this.name = name; } },
    document: {
      createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: callback => callback({}) }),
      addEventListener() {}, removeEventListener() {},
    },
    window: {
      location: { search: '?locker=LKR-A' },
      sessionStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) },
      setTimeout(fn) { const i = ++nextTimer; timers.set(i, fn); return i; },
      clearTimeout(i) { timers.delete(i); },
      addEventListener() {}, removeEventListener() {},
    },
    URLSearchParams,
    require(name) {
      if (name === 'react') return react;
      if (name === './delivery-api') return api;
      if (name === './use-recipient-verification') return hook;
      if (name === 'react/jsx-runtime') return { jsx: tag, jsxs: tag, Fragment: 'Fragment' };
      if (name === '@heroui/react' || name === '@gravity-ui/icons') return ui;
      if (name === 'next/image') return { default: 'Image' };
      if (name === './locker-support') return { LockerSupport: 'LockerSupport' };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  function compile(file, target) {
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/app/${file}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, { ...context, module: target, exports: target.exports });
  }
  compile('use-recipient-verification.ts', compiledHook);
  const hook = compiledHook.exports;
  const flowModule = { exports: {} };
  if (flow) {
    context.URL = { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} };
    compile('delivery-flow.tsx', flowModule);
  }
  function render() { cursor = 0; result = flow ? flowModule.exports.DeliveryFlow() : hook.useRecipientVerification(...args); while (effects.length) effects.shift()(); }
  function nodes(value, found = []) {
    if (Array.isArray(value)) value.forEach(child => nodes(child, found));
    else if (value && typeof value === 'object') { found.push(value); nodes(value.props?.children, found); }
    return found;
  }
  const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join(' ') : value ? text(value.props?.children) : '';
  render();
  return {
    calls, submits,
    text: () => text(result),
    find: type => nodes(result).filter(node => node.type === type),
    button: label => nodes(result).find(node => node.type === 'Button' && text(node).includes(label)),
    get current() { return result; },
    async flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); },
    update(changes) { args = args.map((value, i) => i in changes ? changes[i] : value); render(); },
    debounce() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}
async function found(h, name = 'Recipient A') {
  h.debounce(); h.calls.at(-1).response.resolve({ fullName: name }); await h.flush();
}

test('phone A to B invalidates synchronously before debounce, including a retained submit callback', async () => {
  const h = harness(); await found(h);
  const oldCheck = h.current.isVerified;
  assert.equal(oldCheck(session(), '0901 234 567'), true);
  h.current.invalidate();
  assert.equal(oldCheck(session(), '0901234567'), false);
  assert.equal(oldCheck(session(), '0909999999'), false);
  h.update({ 0: '0909999999' }); await h.flush();
  assert.equal(h.current.name, ''); assert.equal(h.current.status, 'idle');
  assert.equal(h.calls.length, 1);
  await found(h, 'Recipient B');
  assert.equal(h.current.isVerified(session(), '0909999999'), true);
  assert.equal(h.current.isVerified(session(), '0901234567'), false);
});

test('lookup responses in reverse order cannot replace the new phone/name', async () => {
  const h = harness(); h.debounce();
  h.current.invalidate(); h.update({ 0: '0909999999' }); h.debounce();
  h.calls[1].response.resolve({ fullName: 'Recipient B' }); await h.flush();
  h.calls[0].response.resolve({ fullName: 'Recipient A' }); await h.flush();
  assert.equal(h.current.name, 'Recipient B');
  assert.equal(h.current.isVerified(session(), '0909999999'), true);
});

test('an old failure cannot overwrite a newer successful lookup', async () => {
  const h = harness(); h.debounce();
  h.current.invalidate(); h.update({ 0: '0909999999' }); h.debounce(); await h.flush();
  h.calls[1].response.resolve({ fullName: 'Recipient B' }); await h.flush();
  h.calls[0].response.reject(new DeliveryApiError('old', 404, 'delivery/recipient_not_found')); await h.flush();
  assert.equal(h.current.status, 'found'); assert.equal(h.current.name, 'Recipient B');
});

for (const replacement of [session('session-B'), session('session-A', 'token-B')]) {
  test(`lookup belongs to both session id and token (${replacement.id}/${replacement.guestSessionToken})`, async () => {
    const h = harness(); h.debounce();
    h.current.invalidate(); h.update({ 1: replacement }); h.debounce();
    h.calls[0].response.resolve({ fullName: 'Old session' }); await h.flush();
    assert.equal(h.current.status, 'loading');
    h.calls[1].response.resolve({ fullName: 'Current session' }); await h.flush();
    assert.equal(h.current.isVerified(session(), '0901234567'), false);
    assert.equal(h.current.isVerified(replacement, '0901234567'), true);
  });
}

test('leaving recipient and unmounting ignore an in-flight response', async () => {
  for (const unmount of [false, true]) {
    const h = harness(); h.debounce();
    if (unmount) h.unmount(); else h.update({ 2: false });
    h.calls[0].response.resolve({ fullName: 'Late' }); await h.flush();
    assert.equal(h.current.isVerified(session(), '0901234567'), false);
    assert.notEqual(h.current.name, 'Late');
  }
});

test('invalid phone, missing session and unavailable image never look up or verify', async () => {
  for (const changes of [{ 0: '123' }, { 1: null }, { 3: false }]) {
    const h = harness(); h.update(changes); h.debounce(); await h.flush();
    assert.equal(h.calls.length, 0); assert.equal(h.current.isVerified(session(), '0901234567'), false);
  }
});

test('retrying the same OCR candidate invalidates the old identity until fresh confirmation', async () => {
  const h = harness(); await found(h);
  h.current.invalidate(); h.update({ 4: 1 });
  assert.equal(h.current.isVerified(session(), '0901234567'), false);
  await found(h, 'Confirmed again');
  assert.equal(h.current.isVerified(session(), '0901234567'), true);
});

for (const [code, expected] of [['delivery/recipient_not_found', 'not-found'], ['delivery/recipient_cannot_receive', 'cannot-receive'], ['delivery/lookup_limit_reached', 'limit'], ['unknown', 'error']]) {
  test(`lookup error ${code} remains recoverable and cannot verify`, async () => {
    const h = harness(); h.debounce(); h.calls[0].response.reject(new DeliveryApiError('Try again', 400, code)); await h.flush();
    assert.equal(h.current.status, expected); assert.equal(h.current.isVerified(session(), '0901234567'), false);
    h.update({ 4: 1 }); await found(h);
    assert.equal(h.current.status, 'found');
  });
}

async function recipientFlow() {
  const h = harness(true); h.debounce(); await h.flush();
  await h.find('input')[0].props.onChange({ target: { files: [{ name: 'waybill.jpg' }], value: '' } });
  await h.flush(); await found(h); return h;
}

test('actual form and submit handler block manual replacement before debounce; current verification submits exactly once', async () => {
  const h = await recipientFlow();
  const previous = h.button('Gửi yêu cầu');
  assert.equal(previous.props.isDisabled, false);
  h.find('TextField')[0].props.onChange('0909999999');
  await previous.props.onPress(); // stale closure, bypass disabled UI intentionally
  assert.equal(h.submits.length, 0);
  await h.flush();
  assert.equal(h.button('Gửi yêu cầu').props.isDisabled, true);
  assert.equal(h.text().includes('Recipient A'), false);
  await found(h, 'Recipient B');
  const send = h.button('Gửi yêu cầu');
  assert.equal(send.props.isDisabled, false);
  void send.props.onPress(); void send.props.onPress();
  assert.equal(h.submits.length, 1);
  assert.deepEqual(h.submits[0].request.slice(0, 2), ['session-A', 'token-A']);
  assert.equal(h.submits[0].request[3], '0909999999');
  h.unmount();
});

test('actual OCR candidate selection invalidates name and retained submit callback immediately', async () => {
  const h = await recipientFlow();
  const previous = h.button('Gửi yêu cầu');
  h.button('0909 999 999').props.onPress();
  await previous.props.onPress(); await h.flush();
  assert.equal(h.submits.length, 0);
  assert.equal(h.button('Gửi yêu cầu').props.isDisabled, true);
  assert.equal(h.text().includes('Recipient A'), false);
  await found(h, 'Recipient B');
  assert.equal(h.button('Gửi yêu cầu').props.isDisabled, false);
  h.unmount();
});
