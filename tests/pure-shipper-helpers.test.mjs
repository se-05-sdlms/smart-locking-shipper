import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/app/pure-shipper-helpers.ts', import.meta.url), 'utf8');
const compiledModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: compiledModule, exports: compiledModule.exports });

const {
  isValidRecipientPhone,
  formatRecipientPhone,
  maskRecipientPhone,
  selectOcrCandidate,
  canRequestLockerOpen,
  evaluateDeadlineTransition,
  classifyHttpStatus,
  validateWaybillFile,
  MAX_WAYBILL_IMAGE_BYTES,
} = compiledModule.exports;

describe('Pure Shipper Helpers - Waybill image validation', () => {
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
});

describe('Pure Shipper Helpers - Phone Validation & Masking', () => {
  test('validates valid 10-digit phone numbers with prefixes 03, 05, 07, 08, 09', () => {
    const validPhones = [
      '0321234567', // Viettel 03
      '0398765432', // Viettel 03
      '0561234567', // Vietnamobile 05
      '0581234567', // Vietnamobile 05
      '0701234567', // Mobifone 07
      '0791234567', // Mobifone 07
      '0811234567', // Vinaphone 08
      '0881234567', // Vinaphone 08
      '0901234001', // Mobifone 09
      '0987654321', // Viettel 09
    ];

    for (const phone of validPhones) {
      assert.equal(isValidRecipientPhone(phone), true, `Expected ${phone} to be valid`);
    }
  });

  test('accepts valid phone with whitespace, hyphens, and +84 prefix', () => {
    assert.equal(isValidRecipientPhone('090 123 4001'), true);
    assert.equal(isValidRecipientPhone('090-123-4001'), true);
    assert.equal(isValidRecipientPhone('+84901234001'), true);
    assert.equal(isValidRecipientPhone('+84 901 234 001'), true);
    assert.equal(isValidRecipientPhone('+84381234567'), true);
  });

  test('rejects invalid phones: alphabetic characters, symbols, or empty/whitespace', () => {
    const invalidInputs = [
      '',
      '   ',
      null,
      undefined,
      '09012abcde',
      '090123456a',
      'abcdefghij',
      '090-abcd-efg',
      'phone_number',
    ];

    for (const input of invalidInputs) {
      assert.equal(isValidRecipientPhone(input), false, `Expected "${input}" to be rejected`);
    }
  });

  test('rejects invalid length: less than 10 digits or more than 10 digits', () => {
    const wrongLength = [
      '09012345',      // 8 digits
      '090123456',     // 9 digits
      '09012345678',   // 11 digits
      '090123456789',  // 12 digits
      '0',
      '09',
    ];

    for (const phone of wrongLength) {
      assert.equal(isValidRecipientPhone(phone), false, `Expected length error for ${phone}`);
    }
  });

  test('rejects non-mobile prefixes: landline 02, old 01, 04, 06, or missing leading 0', () => {
    const wrongPrefix = [
      '0243823456', // Hanoi landline (024)
      '0283823456', // HCMC landline (028)
      '0123456789', // Old 11-digit prefix 01
      '0412345678', // Unused 04
      '0612345678', // Unused 06
      '1900123456', // Hotline 1900
      '9012345678', // Missing leading 0
    ];

    for (const phone of wrongPrefix) {
      assert.equal(isValidRecipientPhone(phone), false, `Expected invalid prefix for ${phone}`);
    }
  });

  test('masks recipient phone to "090****001" format to protect recipient privacy', () => {
    assert.equal(maskRecipientPhone('0901234001'), '090****001');
    assert.equal(maskRecipientPhone('0987654321'), '098****321');
    assert.equal(maskRecipientPhone('0321234567'), '032****567');
    assert.equal(maskRecipientPhone('+84901234001'), '090****001');
    assert.equal(maskRecipientPhone('090 123 4001'), '090****001');
  });

  test('masking returns empty string for invalid or unparseable phone input', () => {
    assert.equal(maskRecipientPhone(''), '');
    assert.equal(maskRecipientPhone(null), '');
    assert.equal(maskRecipientPhone(undefined), '');
    assert.equal(maskRecipientPhone('09012'), '');
    assert.equal(maskRecipientPhone('0243823456'), ''); // landline
    assert.equal(maskRecipientPhone('invalid_phone'), '');
  });

  test('formats phone number into readable groups "0901 234 567"', () => {
    assert.equal(formatRecipientPhone('0901234567'), '0901 234 567');
    assert.equal(formatRecipientPhone('+84901234567'), '0901 234 567');
  });
});

describe('Pure Shipper Helpers - Candidate Selection & Fallback Logic', () => {
  test('flags masked notice when OCR result indicates waybill phone is masked', () => {
    const outcome = selectOcrCandidate({
      status: 'Succeeded',
      isMasked: true,
      phones: ['090****001'],
    });

    assert.equal(outcome.action, 'masked_notice');
    assert.equal(outcome.notice, 'masked');
    assert.equal(outcome.selectedPhone, undefined);
  });

  test('preserves shipper manual input if phone has already been touched', () => {
    const outcome = selectOcrCandidate(
      {
        status: 'Succeeded',
        phones: ['0901234567'],
      },
      { phoneTouched: true },
    );

    assert.equal(outcome.action, 'keep_manual');
    assert.equal(outcome.selectedPhone, undefined);
  });

  test('falls back to manual entry when OCR status is Failed or result is empty', () => {
    const failedOutcome = selectOcrCandidate({
      status: 'Failed',
      phones: [],
    });
    assert.equal(failedOutcome.action, 'require_manual_entry');
    assert.equal(failedOutcome.notice, 'failed');

    const emptyOutcome = selectOcrCandidate(null);
    assert.equal(emptyOutcome.action, 'require_manual_entry');
    assert.equal(emptyOutcome.notice, 'failed');
  });

  test('falls back to manual entry when OCR returns candidates with invalid phone numbers', () => {
    const outcome = selectOcrCandidate({
      status: 'Succeeded',
      phones: ['0243823456', '12345', 'not-a-number'],
    });

    assert.equal(outcome.action, 'require_manual_entry');
    assert.equal(outcome.notice, 'failed');
    assert.deepEqual(Array.from(outcome.validCandidates), []);
  });

  test('auto-selects first valid phone when candidates meet confidence threshold', () => {
    const outcome = selectOcrCandidate({
      status: 'Succeeded',
      phones: ['0901234567', '0987654321'],
    });

    assert.equal(outcome.action, 'auto_select');
    assert.equal(outcome.selectedPhone, '0901234567');
    assert.equal(outcome.formattedPhone, '0901 234 567');
    assert.equal(outcome.notice, 'success');
    assert.deepEqual(Array.from(outcome.validCandidates), ['0901234567', '0987654321']);
  });

  test('auto-selects when candidate item confidence is high (>= 0.8 / 80%)', () => {
    const highConf = selectOcrCandidate({
      status: 'Succeeded',
      candidates: [
        { phone: '0901234567', confidence: 0.95 },
      ],
    });
    assert.equal(highConf.action, 'auto_select');
    assert.equal(highConf.selectedPhone, '0901234567');
    assert.deepEqual(Array.from(highConf.validCandidates), ['0901234567']);

    const highConfPercentage = selectOcrCandidate({
      status: 'Succeeded',
      candidates: [
        { phone: '0987654321', confidence: 92 },
      ],
    });
    assert.equal(highConfPercentage.action, 'auto_select');
    assert.equal(highConfPercentage.selectedPhone, '0987654321');
    assert.deepEqual(Array.from(highConfPercentage.validCandidates), ['0987654321']);
  });

  test('falls back to manual entry when confidence is below threshold (< 0.8)', () => {
    const lowConf = selectOcrCandidate({
      status: 'Succeeded',
      candidates: [
        { phone: '0901234567', confidence: 0.65 },
      ],
    }, { minConfidenceThreshold: 0.8 });

    assert.equal(lowConf.action, 'require_manual_entry');
    assert.equal(lowConf.notice, 'failed');
    assert.equal(lowConf.selectedPhone, undefined);
    assert.deepEqual(Array.from(lowConf.validCandidates), ['0901234567']);
  });
});

describe('Pure Shipper Helpers - Allocation and Deadline Decisions', () => {
  test('never sends OPEN twice after openRequested is true, even on lost response or retry', () => {
    // Initial state: Approved, not yet requested -> allowed
    assert.equal(canRequestLockerOpen({ status: 'Approved', openRequested: false }), true);

    // After response is lost / in-flight / reload: openRequested is true -> DISALLOWED
    assert.equal(canRequestLockerOpen({ status: 'Approved', openRequested: true }), false);
    assert.equal(canRequestLockerOpen({ status: 'Approved', openRequested: true, compartmentAllocated: false }), false);

    // Once compartment is allocated -> DISALLOWED
    assert.equal(canRequestLockerOpen({ status: 'Allocated', openRequested: false, compartmentAllocated: true }), false);

    // Non-approved statuses -> DISALLOWED
    assert.equal(canRequestLockerOpen({ status: 'Started', openRequested: false }), false);
    assert.equal(canRequestLockerOpen({ status: 'PendingApproval', openRequested: false }), false);
    assert.equal(canRequestLockerOpen({ status: 'Deposited', openRequested: false }), false);
    assert.equal(canRequestLockerOpen({ status: 'Failed', openRequested: false }), false);
  });

  test('client deadline expiration never locally infers terminal state, must poll authoritative server', () => {
    const decisionExpiredFlag = evaluateDeadlineTransition({
      clientDeadlineExpired: true,
      currentStatus: 'Allocated',
    });
    assert.equal(decisionExpiredFlag.shouldInferTerminal, false);
    assert.equal(decisionExpiredFlag.action, 'poll_authoritative');

    const pastTimestamp = Date.now() - 60000;
    const decisionPastDate = evaluateDeadlineTransition({
      clientDeadlineExpired: false,
      currentStatus: 'Allocated',
      reservationExpiresAt: new Date(pastTimestamp).toISOString(),
      now: Date.now(),
    });
    assert.equal(decisionPastDate.shouldInferTerminal, false);
    assert.equal(decisionPastDate.action, 'poll_authoritative');

    const futureTimestamp = Date.now() + 60000;
    const decisionFutureDate = evaluateDeadlineTransition({
      clientDeadlineExpired: false,
      currentStatus: 'Allocated',
      reservationExpiresAt: new Date(futureTimestamp).toISOString(),
      now: Date.now(),
    });
    assert.equal(decisionFutureDate.shouldInferTerminal, false);
    assert.equal(decisionFutureDate.action, 'keep_waiting');
  });

  test('classifies HTTP statuses: terminal (401, 404, 410) vs retryable (500, 429, network)', () => {
    // Terminal statuses: stop poll, do not retry
    const terminal401 = classifyHttpStatus(401);
    assert.equal(terminal401.isTerminal, true);
    assert.equal(terminal401.isRetryable, false);
    assert.equal(terminal401.action, 'stop_poll');

    const terminal410 = classifyHttpStatus(410, 'delivery/session_expired');
    assert.equal(terminal410.isTerminal, true);
    assert.equal(terminal410.isRetryable, false);
    assert.equal(terminal410.action, 'stop_poll');

    const terminal404 = classifyHttpStatus(404, 'delivery/not_found');
    assert.equal(terminal404.isTerminal, true);
    assert.equal(terminal404.isRetryable, false);
    assert.equal(terminal404.action, 'stop_poll');

    // Retryable statuses: backoff and retry
    const retryableNetwork = classifyHttpStatus(undefined); // network failure
    assert.equal(retryableNetwork.isTerminal, false);
    assert.equal(retryableNetwork.isRetryable, true);
    assert.equal(retryableNetwork.action, 'backoff_and_retry');

    const retryable500 = classifyHttpStatus(500);
    assert.equal(retryable500.isTerminal, false);
    assert.equal(retryable500.isRetryable, true);
    assert.equal(retryable500.action, 'backoff_and_retry');

    const retryable503 = classifyHttpStatus(503);
    assert.equal(retryable503.isTerminal, false);
    assert.equal(retryable503.isRetryable, true);
    assert.equal(retryable503.action, 'backoff_and_retry');

    const retryable429 = classifyHttpStatus(429);
    assert.equal(retryable429.isTerminal, false);
    assert.equal(retryable429.isRetryable, true);
    assert.equal(retryable429.action, 'backoff_and_retry');

    const transient404 = classifyHttpStatus(404, 'other/transient_route_error');
    assert.equal(transient404.isTerminal, false);
    assert.equal(transient404.isRetryable, true);
    assert.equal(transient404.action, 'backoff_and_retry');
  });
});
