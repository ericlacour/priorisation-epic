import { describe, expect, it } from 'vitest';

import { SessionSummary } from '../api/contract';
import { SessionStatus } from '../api/session-state';
import {
  ALL_STATUSES,
  facilitators,
  filterSessions,
  findFacilitator,
  matchName,
  normalize,
} from './session-filter';

const session = (
  name: string,
  facilitatorPseudo: string,
  status: SessionStatus = 'IN_PROGRESS',
): SessionSummary => ({
  sessionId: name,
  name,
  facilitatorPseudo,
  createdAt: '2026-10-14T12:00:00Z',
  status,
  method: 'WSJF',
  methodVersion: 2,
});

describe('normalize', () => {
  it('ignores case and accents, one character for one character', () => {
    expect(normalize('PI 28 – Épics Ça')).toBe('pi 28 – epics ca');
    expect([...normalize('Éè😀ß')]).toHaveLength(4);
  });
});

describe('matchName', () => {
  it('finds the query anywhere in the name, ignoring case and accents, and keeps the original text', () => {
    expect(matchName('PI 28 – Épics', 'epic')).toEqual({
      before: 'PI 28 – ',
      match: 'Épic',
      after: 's',
    });
    expect(matchName('Roadmap', ' ROAD ')).toEqual({ before: '', match: 'Road', after: 'map' });
  });

  it('keeps positions right after characters outside the basic plane', () => {
    expect(matchName('😀 Épics', 'epi')).toEqual({ before: '😀 ', match: 'Épi', after: 'cs' });
  });

  it('keeps every name for an empty query, and none that does not contain the query', () => {
    expect(matchName('Roadmap', '  ')).toEqual({ before: 'Roadmap', match: '', after: '' });
    expect(matchName('Roadmap', 'epic')).toBeNull();
  });
});

describe('facilitators', () => {
  it('lists each facilitator once, in alphabetical order', () => {
    expect(
      facilitators([session('A', 'éric'), session('B', 'Camille'), session('C', 'Eric')]),
    ).toEqual(['Camille', 'éric']);
  });
});

describe('findFacilitator', () => {
  it('returns the existing pseudo that matches, ignoring case, accents and spaces around', () => {
    expect(findFacilitator(['Camille', 'Éric'], ' eric ')).toBe('Éric');
    expect(findFacilitator(['Camille'], 'Cam')).toBeNull();
    expect(findFacilitator(['Camille'], '')).toBeNull();
  });
});

describe('filterSessions', () => {
  const sessions = [
    session('PI 28 – Épics', 'Camille', 'IN_PROGRESS'),
    session('PI 27 – Epics', 'Camille', 'CLOSED'),
    session('Roadmap', 'Éric', 'PREPARATION'),
  ];
  const all = new Set(ALL_STATUSES);

  it('combines the name, facilitator and status filters, in the order received', () => {
    const names = (filter: Parameters<typeof filterSessions>[1]) =>
      filterSessions(sessions, filter).map((s) => s.name);

    expect(names({ name: '', facilitator: null, statuses: all })).toEqual([
      'PI 28 – Épics',
      'PI 27 – Epics',
      'Roadmap',
    ]);
    expect(names({ name: 'epic', facilitator: null, statuses: all })).toEqual([
      'PI 28 – Épics',
      'PI 27 – Epics',
    ]);
    expect(names({ name: '', facilitator: 'éric', statuses: all })).toEqual(['Roadmap']);
    expect(
      names({ name: 'epic', facilitator: 'Camille', statuses: new Set(['IN_PROGRESS']) }),
    ).toEqual(['PI 28 – Épics']);
    expect(names({ name: '', facilitator: null, statuses: new Set() })).toEqual([]);
  });
});
