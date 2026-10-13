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

describe('the demo refuses what the server refuses', () => {
  it('keeps each faculty administrator to their own faculty', async () => {
    await api.login('ion.sirbu', 'demo'); // FET
    const ds = await api.getDataset();
    const fcimGroup = ds.groups.find((g) => g.faculty?.includes('Calculatoare'))!;
    await expect(api.update('groups', { ...fcimGroup, size: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(
      api.saveTimetable({
        id: 'x1',
        name: 'x',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
        algorithm: '',
        groupIds: [fcimGroup.id],
        lessons: [],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      api.saveExamPlan({
        faculty: '',
        round: 'session',
        status: 'draft',
        updatedAt: '',
        events: [
          {
            id: 'e',
            kind: 'exam',
            round: 'session',
            subjectId: 's1',
            groupId: fcimGroup.id,
            teacherId: 't1',
            roomId: 'r1',
            date: '2026-12-15',
            start: '10:00',
            end: '11:30',
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(api.updateProfile({ name: 'Ion', faculty: fcimGroup.faculty })).rejects.toMatchObject({ status: 403 });
    await expect(api.saveSettings({ ...ds.settings, semester: 'Primăvara 2026/2027' })).rejects.toMatchObject({ status: 403 });
  });

  it('checks accounts and schedule changes like the server', async () => {
    await api.login('elena.popescu', 'demo');
    await expect(api.createUser({ username: 'boss', name: 'Boss', role: 'admin', password: 'long-enough-1' })).rejects.toMatchObject({
      status: 422,
    });
    const ion = (await api.listUsers()).find((u) => u.username === 'ion.sirbu')!;
    await expect(api.deleteUser(ion.id)).rejects.toMatchObject({ status: 403 });
    const ds = await api.getDataset();
    const a = ds.assignments.find((x) => x.teacherId === 't1')!;
    // no published timetable in a fresh demo store: refused with the server's reason
    if (!(await api.getPublished()))
      await expect(
        api.createChange({ date: '2026-10-19', assignmentId: a.id, slot: 0, kind: 'room', fromRoomId: 'r1', roomId: 'r2' }),
      ).rejects.toMatchObject({
        status: 422,
      });
  });
});
