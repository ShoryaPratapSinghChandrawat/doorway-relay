import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createRingSignature } from '../ring/signature.js';

const eventType = process.argv[2] ?? 'button_press';
if (eventType !== 'button_press' && eventType !== 'motion_detected') {
  throw new Error('Choose an event type: button_press or motion_detected.');
}
const key = process.env.RING_SIMULATOR_HMAC_KEY?.trim();
if (!key) throw new Error('Set RING_SIMULATOR_HMAC_KEY in the ignored .env file.');
const port = Number(process.env.PORT ?? 3001);
const sentAt = new Date();
const timestamp = sentAt.getTime();
const deviceId = `sim-device-${randomUUID()}`;
const motionSubType = eventType === 'motion_detected' ? 'human' : undefined;

// Ring-shaped local fixture only; this payload and HMAC key are not Ring-certified or Ring-issued.
const payload = {
  meta: {
    version: '1.1',
    time: sentAt.toISOString(),
    request_id: randomUUID(),
    account_id: 'ava1.ring.account.simulator-only',
  },
  data: {
    id: `${deviceId}_${motionSubType ?? 'button_press'}_${timestamp}`,
    type: eventType,
    ...(motionSubType ? { subType: motionSubType } : {}),
    attributes: {
      source: deviceId,
      source_type: 'devices',
      timestamp,
    },
    relationships: { devices: { links: { self: `/v1/devices/${deviceId}` } } },
  },
};
const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
const signature = createRingSignature(rawBody, key);
const response = await fetch(`http://127.0.0.1:${port}/api/ring/webhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-signature': signature },
  body: rawBody,
});
const result = await response.text();
console.log(`Ring-shaped local simulator (not certified) returned HTTP ${response.status}.`);
console.log(result);
if (!response.ok) process.exitCode = 1;
