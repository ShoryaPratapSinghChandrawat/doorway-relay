import { createHash } from 'node:crypto';

export interface PlaygroundDevice {
  id: string;
  type?: string;
}

export interface PlaygroundDeviceList {
  devices: PlaygroundDevice[];
  shapeUnrecognized: boolean;
}

export interface PlaygroundDeviceState extends PlaygroundDeviceList {
  selectedDeviceId: string | null;
}

const MAX_DEVICES = 50;
const MAX_DEVICE_ID_LENGTH = 512;
const MAX_DEVICE_TYPE_LENGTH = 80;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function extractPlaygroundDevices(payload: unknown): PlaygroundDeviceList {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { devices: [], shapeUnrecognized: true };
  }
  const data = (payload as Record<string, unknown>).data;
  if (!Array.isArray(data)) return { devices: [], shapeUnrecognized: true };

  const unique = new Map<string, PlaygroundDevice>();
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { devices: [], shapeUnrecognized: true };
    }
    const record = item as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_DEVICE_ID_LENGTH || CONTROL_CHARACTERS.test(id)) {
      return { devices: [], shapeUnrecognized: true };
    }
    if (unique.has(id)) continue;

    const type = record.type;
    const device: PlaygroundDevice = { id };
    if (typeof type === 'string' && type.length > 0 && type.length <= MAX_DEVICE_TYPE_LENGTH && !CONTROL_CHARACTERS.test(type)) {
      device.type = type;
    }
    unique.set(id, device);
  }

  return { devices: [...unique.values()].slice(0, MAX_DEVICES), shapeUnrecognized: false };
}

export class PlaygroundDeviceSelection {
  private identity: string | null = null;
  private identityInitialized = false;
  private devices: PlaygroundDevice[] = [];
  private shapeUnrecognized = true;
  private selectedDeviceId: string | null = null;

  synchronizeIdentity(token: string | null, source: 'ring_live' | 'ring_playground'): boolean {
    const tokenFingerprint = token ? createHash('sha256').update(token).digest('hex') : null;
    const nextIdentity = JSON.stringify([source, tokenFingerprint]);
    if (this.identityInitialized && this.identity === nextIdentity) return false;

    this.identityInitialized = true;
    this.identity = nextIdentity;
    this.clearDeviceState();
    return true;
  }

  record(payload: unknown): PlaygroundDeviceState {
    const extracted = extractPlaygroundDevices(payload);
    this.devices = extracted.devices;
    this.shapeUnrecognized = extracted.shapeUnrecognized;
    if (this.selectedDeviceId && !this.devices.some((device) => device.id === this.selectedDeviceId)) {
      this.selectedDeviceId = null;
    }
    return this.read();
  }

  select(id: string): boolean {
    if (!this.devices.some((device) => device.id === id)) return false;
    this.selectedDeviceId = id;
    return true;
  }

  clearDeviceState(): void {
    this.devices = [];
    this.shapeUnrecognized = true;
    this.selectedDeviceId = null;
  }

  read(): PlaygroundDeviceState {
    return {
      devices: this.devices.map((device) => ({ ...device })),
      shapeUnrecognized: this.shapeUnrecognized,
      selectedDeviceId: this.selectedDeviceId,
    };
  }
}
