import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { SessionStatus } from '../api/session-state';
import { APP_CONFIG } from '../config/app-config';
import { ScreenSizeService } from '../layout/screen-size.service';
import { FakeRoom } from '../testing/fake-room';
import { state } from '../testing/fixtures';
import { memoryStorage } from '../testing/helpers';
import { SessionBarComponent } from './session-bar.component';
import { SessionRoomService } from './session-room.service';

describe('SessionBarComponent', () => {
  function render(options: { animate?: boolean; status?: SessionStatus; phone?: boolean } = {}) {
    const room = new FakeRoom();
    room.canAnimate.set(options.animate ?? true);
    room.state.set(state({ status: options.status ?? 'PREPARATION' }));
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionRoomService, useValue: room },
        { provide: ScreenSizeService, useValue: { isPhone: signal(options.phone ?? false) } },
        memoryStorage().provider,
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'https://api.example' } },
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(SessionBarComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = () =>
      [...element.querySelectorAll<HTMLButtonElement>('.session-tools button')].map((b) => ({
        text: b.textContent?.replace(/[▾▴]/g, '').trim(),
        disabled: b.disabled,
      }));
    return { fixture, element, buttons };
  }

  it('shows the session name as the page heading, its status and the info line (FR-014c)', () => {
    const { element } = render();
    const heading = element.querySelector('h1')!;
    expect(heading.textContent).toBe('Atelier Q4');
    expect(heading.getAttribute('title')).toBe('Atelier Q4');
    expect(element.querySelector('.badge')?.textContent).toBe('En préparation');
    expect(element.querySelector('.board-info-text')?.textContent).toContain('Échelle 1 à 10');
  });

  it.each([
    ['PREPARATION', 'En préparation', 'prep'],
    ['IN_PROGRESS', 'En cours', 'live'],
    ['CLOSED', 'Clôturée', 'closed'],
  ] as const)('shows the %s status', (status, label, css) => {
    const { element } = render({ status });
    const badge = element.querySelector('.badge')!;
    expect(badge.textContent).toBe(label);
    expect(badge.classList).toContain(css);
  });

  it('links the PF mark to the home page', () => {
    const { element } = render();
    const home = element.querySelector<HTMLAnchorElement>('a.brand-mark')!;
    expect(home.getAttribute('href')).toBe('/');
    expect(home.getAttribute('aria-label')).toBe("Retour à l'accueil");
  });

  it('opens the glossary from « Comprendre le WSJF »', () => {
    const { fixture, element } = render();
    let asked = 0;
    fixture.componentInstance.glossaryRequested.subscribe(() => asked++);
    const link = element.querySelector<HTMLButtonElement>('.session-help')!;
    expect(link.textContent?.trim()).toBe('Comprendre le WSJF');
    link.click();
    expect(asked).toBe(1);
  });

  it('gives the facilitator the tools, with « Tours révélés » reserved and « Exporter » active', () => {
    const { buttons } = render({ animate: true });
    expect(buttons()).toEqual([
      { text: 'Participants (2)', disabled: false },
      { text: 'Tours révélés', disabled: true },
      { text: 'Exporter', disabled: false },
      { text: 'Liens', disabled: false },
      { text: '✦ Assistant IA', disabled: false },
      { text: 'Thème', disabled: false },
    ]);
  });

  it('gives a participant the same tools, without the links, « Exporter » included', () => {
    const { buttons } = render({ animate: false });
    expect(buttons()).toEqual([
      { text: 'Participants (2)', disabled: false },
      { text: 'Tours révélés', disabled: true },
      { text: 'Exporter', disabled: false },
      { text: '✦ Assistant IA', disabled: false },
      { text: 'Thème', disabled: false },
    ]);
  });
});
