import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const ts = createRequire(import.meta.url)("typescript");
export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
export const session = (id = 'session-A', token = 'token-A') => ({ id, guestSessionToken: token });
export class DeliveryApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

const sessionGenerationModule = {
  createSessionGenerationGate() {
    let generation = 0;
    let pending = null;
    return {
      ensure(start, commit) {
        if (pending) return pending;
        const owner = generation;
        const request = start()
          .then(value => {
            if (owner !== generation) throw new Error('Delivery session request was superseded.');
            commit(value);
            return value;
          })
          .finally(() => {
            if (owner === generation) pending = null;
          });
        pending = request;
        return request;
      },
      reset() {
        generation += 1;
        pending = null;
      },
    };
  },
};
const pureShipperHelpers = {
  MAX_WAYBILL_IMAGE_BYTES: 5 * 1024 * 1024,
  validateWaybillFile(file) {
    if (!file) return { valid: false, message: "Chỉ hỗ trợ ảnh JPEG hoặc PNG." };
    const type = file.type?.toLowerCase().trim();
    const extension = file.name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    const supportedType = type === "image/jpeg" || type === "image/png";
    const supportedExtension = extension === "jpg" || extension === "jpeg" || extension === "png";
    if ((type && !supportedType) || (!type && !supportedExtension)) return { valid: false, message: "Chỉ hỗ trợ ảnh JPEG hoặc PNG." };
    if (typeof file.size === "number" && file.size > pureShipperHelpers.MAX_WAYBILL_IMAGE_BYTES) return { valid: false, message: "Ảnh không được vượt quá 5 MB." };
    return { valid: true };
  },
};

// Execute the production hook with deterministic effects/timers and controlled API outcomes.
// No source matching, snapshots, dependencies or live server are needed.
export function harness(flow = false, options = {}) {
  const slots = [], effects = [], timers = new Map(), intervals = new Map(), calls = [], listeners = new Map();
  const events = {
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
  };
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
  const incidents = [];
  const api = {
    validateReturnPickup: async () => ({ returnRequestId: "return-B", guestSessionToken: "pickup-B", compartmentCode: "A01", expiresAt: "2099-01-01" }),
    getReturnPickup: async () => ({ completed: false }),
    reportGuestIncident(...request) { const response = deferred(); incidents.push({ request, response }); return response.promise; },
    DeliveryApiError,
    resolveRecipient(...request) { const response = deferred(); calls.push({ request, response }); return response.promise; },
    scanWaybill: async () => ({ status: 'Succeeded', phones: ['0901234567', '0909999999'], isMasked: false }),
    submitDelivery(...request) { const response = deferred(); submits.push({ request, response }); return response.promise; },
    ...options.api,
  };
  const data = new Map([['boxora.delivery.draft', JSON.stringify(options.draft ?? { lockerCode: 'LKR-A', session: { ...session(), sessionExpiresAt: '2099-01-01' } })]]);
  const card = Object.assign(() => {}, { Content: 'Card.Content' });
  const ui = new Proxy({ Card: card }, { get: (target, name) => target[name] ?? name });
  const tag = (type, props) => ({ type, props: props ?? {} });
  const compiledHook = { exports: {} };
  const context = {
    module: compiledHook, exports: compiledHook.exports, Error, URL, Date, console,
    process: { env: { NODE_ENV: 'development' } },
    createImageBitmap: async () => ({ width: 100, height: 100, close() {} }),
    File: class { constructor(_parts, name) { this.name = name; } },
    navigator: { onLine: true },
    document: {
      visibilityState: options.visible ? 'visible' : 'hidden',
      createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: callback => callback({}) }),
      ...events,
    },
    window: {
      location: { search: options.search ?? '?locker=LKR-A' },
      sessionStorage: { getItem: key => data.get(key), setItem: (key, value) => {
        if (options.failOpenMarkerStorage && JSON.parse(value).openRequested) throw new Error('Storage unavailable');
        data.set(key, value);
      }, removeItem: key => data.delete(key) },
      setTimeout(fn) { const i = ++nextTimer; timers.set(i, fn); return i; },
      clearTimeout(i) { timers.delete(i); },
      setInterval(fn) { const i = ++nextTimer; intervals.set(i, fn); return i; }, clearInterval(i) { intervals.delete(i); },
      ...events,
    },
    URLSearchParams,
    require(name) {
      if (name === 'react') return react;
      if (name === './delivery-api') return api;
      if (name === './session-generation') return sessionGenerationModule;
      if (name === './pure-shipper-helpers') return pureShipperHelpers;
      if (name === './use-recipient-verification') return hook;
      if (name === 'react/jsx-runtime') return { jsx: tag, jsxs: tag, Fragment: 'Fragment' };
      if (name === '@heroui/react' || name === '@gravity-ui/icons') return ui;
      if (name === 'next/image') return { default: 'Image' };
      if (name === './locker-support') return { LockerSupport: 'LockerSupport' };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  function compile(file, target) {
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../../src/app/${file}`, import.meta.url), 'utf8'), {
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
    else if (value && typeof value === 'object') { found.push(value); nodes(value.props?.children, found); nodes(value.props?.actions, found); nodes(value.props?.details, found); }
    return found;
  }
  const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join(' ') : value ? text(value.props?.children) : '';
  render();
  return {
    calls, submits, incidents,
    get draft() { return data.get('boxora.delivery.draft'); },
    get timerCount() { return timers.size; },
    get intervalCount() { return intervals.size; },
    tick() { for (const fn of [...intervals.values()]) fn(); },
    dispatch(name) { for (const callback of [...(listeners.get(name) ?? [])]) callback(); },
    text: () => text(result),
    find: type => nodes(result).filter(node => node.type === type || node.type?.name === type),
    button: label => nodes(result).find(node => node.type === 'Button' && text(node).includes(label)),
    get current() { return result; },
    async flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); },
    update(changes) { args = args.map((value, i) => i in changes ? changes[i] : value); render(); },
    debounce() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}
