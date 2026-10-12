import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Api } from './types';

// the demo API keeps its data in localStorage: an in-memory one here
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});

let api: Api;
beforeAll(async () => {
  api = (await import('./mock')).createMockApi();
});

describe('teacher accounts (demo API)', () => {
  it('a teacher sets their own availability, not the consultation hour, and the administration is told', async () => {
    const me = (await api.login('daniel.rusu', 'demo')).user;
    expect(me).toMatchObject({ role: 'teacher', teacherId: 't1' });
    const before = (await api.getDataset()).teachers.find((t) => t.id === 't1')!;
    const saved = await api.updateAvailability('t1', {
      unavailable: ['0:0'],
      preferred: [],
      consultation: '2:3',
      unavailableOn: ['2026-10-22:2'],
    });
    expect(saved.unavailable).toEqual(['0:0']);
    expect(saved.unavailableOn).toEqual(['2026-10-22:2']);
    expect(saved.consultation).toBe(before.consultation);
    await expect(api.updateAvailability('t2', { unavailable: [], preferred: [] })).rejects.toMatchObject({ status: 403 });

    await api.login('elena.popescu', 'demo');
    const notes = await api.listNotifications();
    expect(notes.some((n) => n.kind === 'availability' && n.params?.teacherId === 't1')).toBe(true);
  });

  it('an administrator creates a teacher login, sets a new password, and deletes it', async () => {
    await api.login('elena.popescu', 'demo');
    const u = await api.createUser({ username: 'Ana.Teacher', name: 'Ana', role: 'teacher', teacherId: 't2', password: 'first-pass' });
    expect(u.username).toBe('ana.teacher');
    await expect(
      api.createUser({ username: 'other', name: 'Ana', role: 'teacher', teacherId: 't2', password: 'first-pass' }),
    ).rejects.toMatchObject({
      status: 422,
    });
    await api.updateUser(u.id, { password: 'second-pass' });
    await expect(api.login('ana.teacher', 'first-pass')).rejects.toMatchObject({ status: 401 });
    await api.login('ana.teacher', 'second-pass');
    await api.login('elena.popescu', 'demo');
    await api.deleteUser(u.id);
    await expect(api.login('ana.teacher', 'second-pass')).rejects.toMatchObject({ status: 401 });
  });
});
