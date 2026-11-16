import assert from "node:assert/strict";
import { test } from "node:test";
import { harness, session, DeliveryApiError } from "./helpers/flow-harness.mjs";

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
