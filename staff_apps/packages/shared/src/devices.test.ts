import { describe, expect, it } from 'vitest';
import { groupDevices, isActiveDevice, isPendingDevice } from './devices';
import type { StaffDevice, User } from './types';

const user = { id: 1, first_name: 'Nodira' } as unknown as User;
const dev = (over: Partial<StaffDevice>): StaffDevice => ({
  id: 1,
  user,
  device_id: 'd',
  device_label: '',
  is_active: true,
  is_approved: true,
  last_login_at: null,
  created_at: '2026-11-01T10:00:00Z',
  ...over,
});

describe('devices', () => {
  it('holatni ajratadi', () => {
    expect(isPendingDevice(dev({ is_approved: false }))).toBe(true);
    expect(isActiveDevice(dev({}))).toBe(true);
    // chetlatilgan qurilma ikkalasi ham emas
    expect(isPendingDevice(dev({ is_active: false, is_approved: false }))).toBe(false);
    expect(isActiveDevice(dev({ is_active: false }))).toBe(false);
  });

  it('guruhlaydi va tartiblaydi, chetlatilganlarni tashlaydi', () => {
    const g = groupDevices([
      dev({ id: 1, is_approved: false, created_at: '2026-11-18T10:00:00Z' }),
      dev({ id: 2, is_approved: false, created_at: '2026-11-20T10:00:00Z' }),
      dev({ id: 3, last_login_at: '2026-11-19T08:00:00Z' }),
      dev({ id: 4, last_login_at: '2026-11-20T08:00:00Z' }),
      dev({ id: 5, is_active: false }),
    ]);
    expect(g.pending.map((d) => d.id)).toEqual([2, 1]);
    expect(g.active.map((d) => d.id)).toEqual([4, 3]);
  });
});
