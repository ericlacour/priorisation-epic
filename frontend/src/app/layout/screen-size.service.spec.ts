import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';

import { ScreenSizeService } from './screen-size.service';

class FakeQuery {
  private listener: ((e: MediaQueryListEvent) => void) | null = null;
  constructor(public matches: boolean) {}
  addEventListener(_: string, l: (e: MediaQueryListEvent) => void): void {
    this.listener = l;
  }
  removeEventListener(): void {
    this.listener = null;
  }
  emit(matches: boolean): void {
    this.matches = matches;
    this.listener?.({ matches } as MediaQueryListEvent);
  }
  get listening(): boolean {
    return this.listener !== null;
  }
}

function create(query: FakeQuery | null): ScreenSizeService {
  const doc = { defaultView: query ? { matchMedia: () => query } : null };
  TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: doc }] });
  return TestBed.inject(ScreenSizeService);
}

describe('ScreenSizeService', () => {
  it('vaut faux quand la largeur n est pas celle d un téléphone', () => {
    expect(create(new FakeQuery(false)).isPhone()).toBe(false);
  });

  it('vaut vrai sous 600 px et suit les changements de taille', () => {
    const query = new FakeQuery(true);
    const service = create(query);
    expect(service.isPhone()).toBe(true);
    query.emit(false);
    expect(service.isPhone()).toBe(false);
  });

  it('vaut faux sans fenêtre', () => {
    expect(create(null).isPhone()).toBe(false);
  });

  it('se désabonne à la destruction', () => {
    const query = new FakeQuery(false);
    create(query);
    expect(query.listening).toBe(true);
    TestBed.resetTestingModule();
    expect(query.listening).toBe(false);
  });
});
