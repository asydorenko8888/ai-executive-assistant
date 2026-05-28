import type { Request } from 'express';

export const EXECUTIVE_DEVICE_ID_HEADER = 'x-executive-device-id';

export function readExecutiveDeviceId(request: Request) {
  const value = request.header(EXECUTIVE_DEVICE_ID_HEADER)?.trim();

  if (!value || value.length < 8 || value.length > 128) {
    return null;
  }

  return value;
}
