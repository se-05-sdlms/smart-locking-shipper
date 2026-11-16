import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harness, DeliveryApiError } from './helpers/flow-harness.mjs';

const pending = { status: 'PendingApproval', approvalExpiresAt: null };
async function waiting(outcomes, reservationFailure) {
  const reads = [], mutations = [];
  const forbidden = name => async () => { mutations.push(name); throw new Error(`Unexpected ${name}`); };
  const h = harness(true, {
    visible: true, search: '?locker=LKR-A&preview=waiting',
    api: {
      async getDeliveryStatus(...args) {
        reads.push(args); const outcome = outcomes.shift() ?? pending;
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      initiateDelivery: forbidden('initiate'), submitDelivery: forbidden('submit'),
      async reserveCompartment() { mutations.push('reserve'); throw reservationFailure ?? new Error('Unexpected reserve'); },
    },
  });
  h.debounce(); await h.flush(); return { h, reads, mutations };
}
for (const [status, code] of [[401, undefined], [401, 'auth/invalid_guest_session'], [401, 'auth/missing_guest_session'], [404, 'delivery/not_found'], [410, 'delivery/session_expired']]) {
  test(`terminal ${status}/${code} stops polling and resume; reference survives without guest credentials`, async () => {
    const { h, reads, mutations } = await waiting([new DeliveryApiError('raw backend detail', status, code)]);
    assert.equal(reads.length, 1);
    const screen = h.find('StatusScreen')[0];
    assert.equal(screen.props.title, 'Không thể tiếp tục theo dõi yêu cầu');
    assert.equal(screen.props.description.includes('Chưa thể xác nhận kết quả giao hàng'), true);
    assert.equal(JSON.stringify(screen.props.details).includes('session-A'), true);
    assert.equal(h.find('LockerSupport')[0].props.reference, 'session-A');
    assert.equal(h.draft, undefined);
    assert.equal(h.timerCount, 0);
    for (let i = 0; i < 3; i++) { h.dispatch('visibilitychange'); h.dispatch('online'); h.debounce(); await h.flush(); }
    assert.equal(reads.length, 1); assert.deepEqual(mutations, []);
    h.button('Báo sự cố tại tủ').props.onPress(); await h.flush();
    h.find('RadioGroup')[0].props.onChange('Other');
    h.find('TextField')[0].props.onChange('Không thể theo dõi yêu cầu giao hàng.'); await h.flush();
    h.find('Form')[0].props.onSubmit({ preventDefault() {} });
    const [body, token] = h.incidents[0].request;
    assert.equal(token, undefined); assert.equal(body.deliveryRequestId, undefined); assert.equal(body.returnRequestId, undefined);
    assert.equal(h.find('LockerSupport')[0].props.reference, 'session-A');
    assert.deepEqual(mutations, []); h.unmount();
  });
}
for (const error of [new Error('network offline'), new DeliveryApiError('Busy', 500), new DeliveryApiError('Rate limited', 429), new DeliveryApiError('Unknown route', 404, 'other/not_found')]) {
  test(`transient ${error.status ?? 'network'} keeps retry and recovers without a second create/open`, async () => {
    const { h, reads, mutations } = await waiting([error, pending]);
    assert.equal(reads.length, 1); assert.equal(h.find('StatusScreen').length, 0);
    assert.equal(h.timerCount, 1); assert.ok(h.draft);
    h.debounce(); await h.flush();
    assert.equal(reads.length, 2); assert.equal(h.find('StatusScreen').length, 0);
    assert.equal(h.find('ApiErrorCard').length, 0);
    assert.equal(h.timerCount, 1); assert.deepEqual(mutations, []);
    h.unmount(); assert.equal(h.timerCount, 0);
  });
}
test('reserve credential failure is terminal and does not issue another reserve on resume', async () => {
  const { h, reads, mutations } = await waiting([{ status: 'Approved' }], new DeliveryApiError('Invalid token', 401));
  assert.equal(h.find('StatusScreen')[0].props.title, 'Không thể tiếp tục theo dõi yêu cầu');
  h.dispatch('online'); h.debounce(); await h.flush();
  assert.equal(reads.length, 1); assert.deepEqual(mutations, ['reserve']); h.unmount();
});
