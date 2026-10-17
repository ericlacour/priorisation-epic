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
  prepareSessions,
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

  it('drops the accents written apart from their letter (NFD, text pasted from macOS)', () => {
    expect(normalize('E\u0301pics')).toBe('epics');
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

  it('matches names and queries whose accents are written apart from their letter (NFD)', () => {
    expect(matchName('PI 28 – E\u0301pics', 'epic')).toEqual({
      before: 'PI 28 – ',
      match: 'E\u0301pic',
      after: 's',
    });
    expect(matchName('PI 28 – Épics', 'e\u0301pic')).toEqual({
      before: 'PI 28 – ',
      match: 'Épic',
      after: 's',
    });
    // L'accent qui suit le passage trouvé reste avec sa lettre.
    expect(matchName('Cafe\u0301 noir', 'cafe')).toEqual({
      before: '',
      match: 'Cafe\u0301',
      after: ' noir',
    });
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
      filterSessions(prepareSessions(sessions), filter).map((row) => row.session.name);

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

  it('returns the name cut around the match, and the whole name without a name filter', () => {
    const rows = filterSessions(prepareSessions(sessions), {
      name: 'epic',
      facilitator: null,
      statuses: all,
    });
    expect(rows[0].name).toEqual({ before: 'PI 28 – ', match: 'Épic', after: 's' });
    const unfiltered = filterSessions(prepareSessions(sessions), {
      name: ' ',
      facilitator: null,
      statuses: all,
    });
    expect(unfiltered[2].name).toEqual({ before: 'Roadmap', match: '', after: '' });
  });
});
