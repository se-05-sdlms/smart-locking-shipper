import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harness, deferred, DeliveryApiError } from './helpers/flow-harness.mjs';

const allocated = { status: 'Allocated', compartmentCode: 'B02', reservationExpiresAt: '2099-01-01' };
const deposited = { ...allocated, status: 'Deposited', parcelId: 'parcel-1' };
async function start(screen, outcomes, options = {}) {
  const reads = [], mutations = [];
  const forbidden = name => async () => { mutations.push(name); throw new Error(`Unexpected ${name}`); };
  const h = harness(true, {
    visible: true, search: `?locker=LKR-A&preview=${screen}`, ...options,
    api: {
      async getDeliveryStatus(...args) {
        reads.push(args); const next = outcomes.shift() ?? allocated;
        if (next instanceof Error) throw next;
        return await next;
      },
      initiateDelivery: forbidden('initiate'), submitDelivery: forbidden('submit'), reserveCompartment: forbidden('reserve'),
      ...options.api,
    },
  });
  h.debounce(); await h.flush(); return { h, reads, mutations };
}
for (const screen of ['compartment', 'closing']) {
  test(`${screen} polls authoritative deposit without any mutation`, async () => {
    const { h, reads, mutations } = await start(screen, [allocated, deposited]);
    assert.equal(reads.length, 1);
    if (screen === 'closing') assert.ok(h.button('Tôi đã đóng cửa'));
    h.debounce(); await h.flush();
    assert.equal(h.find('StatusScreen')[0].props.title, 'Gửi hàng thành công');
    assert.equal(JSON.stringify(h.find('InfoRows')[0]).includes('parcel-1'), true);
    assert.deepEqual(mutations, []); assert.equal(h.timerCount, 0);
    h.unmount(); assert.equal(h.intervalCount, 0);
  });
  for (const status of ['Expired', 'Failed', 'Rejected', 'Cancelled']) test(`${screen} maps ${status} to incomplete outcome with evidence`, async () => {
    const { h, reads, mutations } = await start(screen, [{ ...allocated, status, failureCode: 'ReservationExpired' }]);
    const page = h.find('StatusScreen')[0];
    assert.equal(page.props.title, 'Lượt gửi chưa hoàn tất');
    assert.equal(page.props.description.includes('liên hệ người vận hành'), true);
    assert.equal(JSON.stringify(page.props.details).includes('B02'), true);
    assert.equal(h.find('LockerSupport')[0].props.reference, 'session-A');
    assert.equal(h.draft, undefined);
    h.dispatch('online'); h.dispatch('visibilitychange'); h.debounce(); h.tick(); await h.flush();
    assert.equal(reads.length, 1); assert.deepEqual(mutations, []);
    h.button('Báo sự cố tại tủ').props.onPress(); await h.flush();
    h.find('RadioGroup')[0].props.onChange('Other');
    h.find('TextField')[0].props.onChange('Cần kiểm tra kiện hàng trong ngăn.'); await h.flush();
    h.find('Form')[0].props.onSubmit({ preventDefault() {} });
    assert.equal(h.incidents[0].request[1], undefined);
    assert.equal(h.incidents[0].request[0].deliveryRequestId, undefined);
    assert.equal(h.find('LockerSupport')[0].props.reference, 'session-A'); h.unmount();
  });
}
test('manual verification uses terminal mapping and does not duplicate a pending poll', async () => {
  const response = deferred();
  const { h, reads, mutations } = await start('closing', [response.promise, { ...allocated, status: 'Expired' }]);
  await h.button('Tôi đã đóng cửa').props.onPress();
  assert.equal(reads.length, 1);
  response.resolve(allocated); await h.flush();
  await h.button('Tôi đã đóng cửa').props.onPress(); await h.flush();
  assert.equal(reads.length, 2);
  assert.equal(h.find('StatusScreen')[0].props.title, 'Lượt gửi chưa hoàn tất');
  assert.deepEqual(mutations, []); h.unmount();
});
test('closing remains closing on Allocated; resume serializes reads and recovers transient failure', async () => {
  const { h, reads, mutations } = await start('closing', [new DeliveryApiError('Busy', 500), allocated, deposited]);
  assert.equal(h.find('ApiErrorCard')[0].props.message, 'Busy');
  h.dispatch('online'); h.dispatch('visibilitychange'); await h.flush();
  assert.equal(reads.length, 2); assert.ok(h.button('Tôi đã đóng cửa'));
  assert.equal(h.find('ApiErrorCard').length, 0);
  h.debounce(); await h.flush();
  assert.equal(h.find('StatusScreen')[0].props.title, 'Gửi hàng thành công');
  assert.deepEqual(mutations, []); h.unmount();
});
test('expired client deadline never infers terminal state or loops immediately', async () => {
  const expiredDeadline = { ...allocated, reservationExpiresAt: '2000-01-01' };
  const { h, reads, mutations } = await start('closing', [expiredDeadline]);
  const initialReads = reads.length;
  for (let i = 0; i < 10; i++) { h.tick(); await h.flush(); }
  assert.equal(reads.length, initialReads);
  assert.ok(h.button('Tôi đã đóng cửa')); assert.equal(h.timerCount, 1);
  h.debounce(); await h.flush(); assert.equal(reads.length, initialReads + 1);
  assert.deepEqual(mutations, []); h.unmount();
});
for (const stale of [deposited, new DeliveryApiError('Invalid old token', 401)]) test(`leaving closing ignores stale ${stale.status} outcome and removes listeners`, async () => {
  const response = deferred();
  const { h, reads, mutations } = await start('closing', [response.promise]);
  h.button('Báo sự cố tại tủ').props.onPress(); await h.flush();
  if (stale instanceof Error) response.reject(stale); else response.resolve(stale);
  await h.flush(); h.dispatch('online'); h.dispatch('visibilitychange'); h.tick(); h.debounce(); await h.flush();
  assert.ok(h.find('Form').length); assert.equal(h.find('StatusScreen').length, 0);
  assert.equal(reads.length, 1); assert.deepEqual(mutations, []);
  assert.equal(h.timerCount, 0); assert.equal(h.intervalCount, 0); h.unmount();
});
test('lost OPEN response followed by Approved never sends OPEN again, including reload', async () => {
  let opens = 0;
  const { h, reads } = await start('waiting', [{ status: 'Approved' }, { status: 'Approved' }, allocated], {
    api: { async reserveCompartment() { opens++; throw new Error('Lost response'); } },
  });
  assert.equal(opens, 1);
  const savedDraft = JSON.parse(h.draft); assert.equal(savedDraft.openRequested, true);
  h.dispatch('online'); h.dispatch('visibilitychange'); await h.flush();
  assert.equal(opens, 1); assert.equal(reads.length, 2);
  assert.equal(h.find('ApiErrorCard')[0].props.message.includes('chưa xác nhận kết quả'), true);
  h.debounce(); await h.flush();
  assert.equal(h.find('StatusScreen')[0].props.title, 'Ngăn dành cho kiện hàng');
  assert.equal(opens, 1); h.unmount();
  const resumed = await start('waiting', [{ status: 'Approved' }, deposited], {
    draft: savedDraft, api: { async reserveCompartment() { opens++; throw new Error('Unexpected duplicate OPEN'); } },
  });
  assert.equal(opens, 1); resumed.h.debounce(); await resumed.h.flush();
  assert.equal(resumed.h.find('StatusScreen')[0].props.title, 'Gửi hàng thành công');
  assert.equal(opens, 1); resumed.h.unmount();
});
test('a fresh session without open-attempt marker may send its initial OPEN exactly once', async () => {
  let opens = 0;
  const { h, reads } = await start('waiting', [{ status: 'Approved' }, allocated], {
    draft: { lockerCode: 'LKR-A', session: { id: 'session-B', guestSessionToken: 'token-B', sessionExpiresAt: '2099-01-01' }, screen: 'waiting' },
    api: { async reserveCompartment() { opens++; return { compartmentCode: 'B02', reservationExpiresAt: '2099-01-01' }; } },
  });
  assert.equal(reads[0][0], 'session-B'); assert.equal(opens, 1);
  assert.equal(h.find('StatusScreen')[0].props.title, 'Ngăn dành cho kiện hàng');
  h.dispatch('online'); await h.flush(); assert.equal(opens, 1); h.unmount();
});

test('reload of a locally expired physical draft reconciles without a second OPEN', async () => {
  const { h, reads, mutations } = await start('waiting', [{ status: 'Approved' }, deposited], {
    draft: { lockerCode: 'LKR-A', session: { id: 'old-physical', guestSessionToken: 'old-token', sessionExpiresAt: '2000-01-01' }, screen: 'closing' },
  });
  assert.equal(reads[0][0], 'old-physical');
  assert.equal(h.find('ApiErrorCard')[0].props.message.includes('chưa xác nhận kết quả'), true);
  h.debounce(); await h.flush();
  assert.equal(h.find('StatusScreen')[0].props.title, 'Gửi hàng thành công');
  assert.deepEqual(mutations, []); h.unmount();
});

test('failed persistence prevents OPEN and does not retry it automatically', async () => {
  const { h, mutations } = await start('waiting', [{ status: 'Approved' }, { status: 'Approved' }], { failOpenMarkerStorage: true });
  assert.equal(h.find('ApiErrorCard')[0].props.message, 'Storage unavailable');
  h.dispatch('online'); await h.flush();
  assert.equal(h.find('ApiErrorCard')[0].props.message.includes('chưa xác nhận kết quả'), true);
  assert.deepEqual(mutations, []); h.unmount();
});

test('explicit completion reset clears prior OPEN marker before sending a different parcel', async () => {
  let opens = 0;
  const { h, reads } = await start('waiting', [deposited, { status: 'Approved' }, allocated], {
    draft: { lockerCode: 'LKR-A', session: { id: 'session-A', guestSessionToken: 'token-A', sessionExpiresAt: '2099-01-01' }, screen: 'closing', openRequested: true },
    api: {
      async initiateDelivery() { return { id: 'session-B', guestSessionToken: 'token-B', sessionExpiresAt: '2099-01-01' }; },
      async submitDelivery() {},
      async reserveCompartment() { opens++; return { compartmentCode: 'B02', reservationExpiresAt: '2099-01-01' }; },
    },
  });
  h.button('Gửi kiện khác').props.onPress(); await h.flush();
  await h.find('input')[0].props.onChange({ target: { files: [{ name: 'waybill.jpg' }], value: '' } });
  await h.flush(); h.debounce(); await h.flush();
  h.calls[0].response.resolve({ fullName: 'Recipient B' }); await h.flush();
  await h.button('Gửi yêu cầu').props.onPress(); await h.flush();
  assert.equal(reads[1][0], 'session-B'); assert.equal(opens, 1);
  assert.equal(h.find('StatusScreen')[0].props.title, 'Ngăn dành cho kiện hàng'); h.unmount();
});
