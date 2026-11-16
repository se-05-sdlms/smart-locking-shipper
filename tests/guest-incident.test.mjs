import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { harness, DeliveryApiError } from './helpers/flow-harness.mjs';
const ts = createRequire(import.meta.url)('typescript');

function apiHarness(status = 200) {
  const calls = [], compiled = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/delivery-api.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    module: compiled, exports: compiled.exports, Error,
    fetch: async (...args) => { calls.push(args); return { ok: status < 400, status, json: async () => status < 400 ? { referenceCode: 'INC-TEST' } : { message: 'Rejected session' } }; },
  });
  return { api: compiled.exports, calls };
}
for (const [id, token] of [['deliveryRequestId', 'delivery-A'], ['returnRequestId', 'pickup-B'], [null, undefined]]) {
  test(`actual guest incident API sends ${id ?? 'anonymous'} identity and header`, async () => {
    const h = apiHarness();
    const body = { lockerCode: 'LKR-A', type: 'Other', description: 'Synthetic test', ...(id ? { [id]: 'request-A' } : {}) };
    await h.api.reportGuestIncident(body, token);
    const [url, init] = h.calls[0];
    assert.equal(url, '/backend/incidents/guest');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['X-Guest-Session-Token'], token);
    assert.deepEqual(JSON.parse(init.body), body);
    assert.equal(init.body.includes(token ?? 'guestSessionToken'), false);
  });
}
for (const status of [400, 401, 410, 429, 500]) {
  test(`actual API propagates ${status} once without anonymous retry`, async () => {
    const h = apiHarness(status);
    await assert.rejects(h.api.reportGuestIncident({ lockerCode: 'LKR-A', deliveryRequestId: 'request-A' }, 'invalid-token'), error => error.status === status);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][1].headers['X-Guest-Session-Token'], 'invalid-token');
  });
}
async function flow(search = '?locker=LKR-A') {
  const h = harness(true, { search }); h.debounce(); await h.flush(); return h;
}
async function report(h, welcome = false) {
  if (welcome) h.find('WelcomeScreen')[0].props.onReport();
  else h.button('Báo sự cố tại tủ').props.onPress();
  await h.flush();
  h.find('RadioGroup')[0].props.onChange('Other');
  h.find('TextField')[0].props.onChange('Ngăn tủ không mở sau khi xác nhận.');
  await h.flush();
  return () => h.find('Form')[0].props.onSubmit({ preventDefault() {} });
}
test('welcome report does not link a restored delivery session; duplicate submit is synchronous', async () => {
  const h = await flow(), submit = await report(h, true);
  submit(); submit();
  assert.equal(h.incidents.length, 1);
  const [body, token] = h.incidents[0].request;
  assert.equal(token, undefined);
  assert.equal(body.deliveryRequestId, undefined); assert.equal(body.returnRequestId, undefined);
  h.incidents[0].response.resolve({ referenceCode: 'INC-TEST' }); await h.flush();
  assert.equal(h.find('StatusScreen').some(node => node.props.title === 'Đã gửi báo cáo sự cố'), true);
  h.unmount();
});
test('delivery report sends the captured delivery id and token', async () => {
  const h = await flow('?locker=LKR-A&preview=compartment'), submit = await report(h);
  submit();
  const [body, token] = h.incidents[0].request;
  assert.equal(token, 'token-A'); assert.equal(body.deliveryRequestId, 'session-A'); assert.equal(body.returnRequestId, undefined);
  h.unmount();
});
test('pickup report chooses pickup identity even with a restored delivery session', async () => {
  const h = await flow();
  h.find('WelcomeScreen')[0].props.onReceive(); await h.flush();
  h.find('InputOTP')[0].props.onChange('123456'); await h.flush();
  h.find('Form')[0].props.onSubmit({ preventDefault() {} }); await h.flush();
  h.button('Mở ngăn').props.onPress(); await h.flush();
  const submit = await report(h); submit();
  const [body, token] = h.incidents[0].request;
  assert.equal(token, 'pickup-B'); assert.equal(body.returnRequestId, 'return-B'); assert.equal(body.deliveryRequestId, undefined);
  h.unmount();
});
test('returning from pickup to delivery never links the leftover pickup session', async () => {
  const h = await flow();
  h.find('WelcomeScreen')[0].props.onReceive(); await h.flush();
  h.find('InputOTP')[0].props.onChange('123456'); await h.flush();
  h.find('Form')[0].props.onSubmit({ preventDefault() {} }); await h.flush();
  h.find('AppHeader')[0].props.goBack(); await h.flush();
  h.find('AppHeader')[0].props.goBack(); await h.flush();
  await h.find('input')[0].props.onChange({ target: { files: [{ name: 'waybill.jpg' }], value: '' } }); await h.flush();
  h.debounce(); h.calls.at(-1).response.resolve({ fullName: 'Synthetic resident' }); await h.flush();
  h.button('Gửi yêu cầu').props.onPress(); h.submits[0].response.resolve({}); await h.flush();
  const submit = await report(h); submit();
  const [body, token] = h.incidents[0].request;
  assert.equal(token, 'token-A'); assert.equal(body.deliveryRequestId, 'session-A'); assert.equal(body.returnRequestId, undefined);
  h.unmount();
});
for (const status of [401, 410]) {
  test(`expired session ${status} stays on error and requires explicit reset before anonymous report`, async () => {
    const h = await flow('?locker=LKR-A&preview=compartment'), submit = await report(h);
    submit(); h.incidents[0].response.reject(new DeliveryApiError('Expired', status)); await h.flush();
    assert.equal(h.incidents.length, 1);
    assert.equal(h.find('StatusScreen').some(node => node.props.title === 'Đã gửi báo cáo sự cố'), false);
    assert.equal(h.find('ApiErrorCard').some(node => node.props.message.includes('Phiên giao hoặc lấy hàng đã hết hiệu lực')), true);
    h.button('Về trang đầu để báo sự cố tại tủ').props.onPress(); await h.flush();
    const again = await report(h, true); again();
    assert.equal(h.incidents.length, 2);
    const [body, token] = h.incidents[1].request;
    assert.equal(token, undefined); assert.equal(body.deliveryRequestId, undefined); assert.equal(body.returnRequestId, undefined);
    h.unmount();
  });
}
