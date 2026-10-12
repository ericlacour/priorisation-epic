import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { ErrorMessage, ServerMessage, SessionState } from '../api/contract';
import { ScreenSizeService } from '../layout/screen-size.service';
import { BrowserStorage, LOCAL_STORAGE } from '../storage/browser-storage';
import {
  PARTICIPANT,
  FACILITATOR,
  REACH_EFFORT,
  SESSION_ID,
  computedScore,
  feature,
  maskedFeature,
  participantState,
  sessionState,
} from '../testing/fixtures';
import { SessionEnd, SessionSocketService } from './session-socket.service';
import { SessionScreenComponent } from './session-screen.component';
import { SessionStateService } from './session-state.service';

class FakeSocket {
  readonly messages = new Subject<ServerMessage>();
  readonly connection = signal<'connecting' | 'open' | 'lost'>('open');
  readonly end = signal<SessionEnd | null>(null);
  connectedTo: string | null = null;
  connect(id: string): void {
    this.connectedTo = id;
  }
  send(): boolean {
    return true;
  }
}

describe('SessionScreenComponent', () => {
  let socket: FakeSocket;
  let phone: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    socket = new FakeSocket();
    phone = signal(false);
    const backing = {
      getItem: (k: string) => (k === `pe.animation.${SESSION_ID}` ? 'secret-token' : null),
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    TestBed.configureTestingModule({
      providers: [
        BrowserStorage,
        { provide: LOCAL_STORAGE, useValue: () => backing },
        { provide: ScreenSizeService, useValue: { isPhone: phone } },
      ],
    });
    // La connexion de l'écran est remplacée ; l'état de session, lui, est le vrai service.
    TestBed.overrideComponent(SessionScreenComponent, {
      set: {
        providers: [{ provide: SessionSocketService, useValue: socket }, SessionStateService],
      },
    });
  });

  function mount() {
    const fixture = TestBed.createComponent(SessionScreenComponent);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    const ended: SessionEnd[] = [];
    fixture.componentInstance.sessionEnded.subscribe((end) => ended.push(end));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      ended,
      show(state: SessionState) {
        socket.messages.next(state);
        fixture.detectChanges();
      },
      text: () => root.textContent?.replace(/\s+/g, ' ') ?? '',
      click(selector: string) {
        (root.querySelector(selector) as HTMLElement).click();
        fixture.detectChanges();
      },
    };
  }

  it('connects to the session and shows « Chargement » until the first state', () => {
    const ui = mount();
    expect(socket.connectedTo).toBe(SESSION_ID);
    expect(ui.root.querySelector('[role="status"]')?.textContent).toContain(
      'Chargement de la session…',
    );
    expect(ui.root.querySelector('app-board')).toBeNull();
  });

  it('says it is reconnecting when the connection drops before any state', () => {
    const ui = mount();
    socket.connection.set('lost');
    ui.fixture.detectChanges();
    expect(ui.root.querySelector('[role="status"]')?.textContent).toContain('Reconnexion…');
  });

  describe('facilitator view', () => {
    it('shows the session bar with name, role, scale and status', () => {
      const ui = mount();
      ui.show(sessionState({ status: 'IN_PROGRESS' }));
      expect(ui.root.querySelector('h1')?.textContent).toBe('PI 27 – Epics plateforme');
      expect(ui.root.querySelector('.session-sub')?.textContent).toBe(
        'Animateur : eric (vous) · Échelle 1 à 10',
      );
      const badge = ui.root.querySelector('.session-bar .badge')!;
      expect(badge.textContent?.trim()).toBe('En cours');
      expect(badge.classList.contains('live')).toBe(true);
    });

    it.each([
      ['PREPARATION', 'En préparation', 'prep'],
      ['CLOSED', 'Clôturée', 'closed'],
    ] as const)('shows the %s status', (status, label, css) => {
      const ui = mount();
      ui.show(sessionState({ status }));
      const badge = ui.root.querySelector('.session-bar .badge')!;
      expect(badge.textContent?.trim()).toBe(label);
      expect(badge.classList.contains(css)).toBe(true);
    });

    it('lets the facilitator edit: add button, animation link, no « bientôt » buttons', () => {
      const ui = mount();
      ui.show(sessionState());
      expect(ui.text()).toContain('+ Fonctionnalité');
      expect(ui.root.querySelector('app-animation-link')).not.toBeNull();
      expect(ui.root.querySelector('.notice.info')).toBeNull();
      expect(ui.root.querySelector('.actions [disabled]')).toBeNull();
    });

    it('shows a Fibonacci scale in the bar', () => {
      const ui = mount();
      ui.show(
        sessionState({ scale: { type: 'FIBONACCI', max: 13, allowedValues: [1, 2, 3, 5, 8, 13] } }),
      );
      expect(ui.root.querySelector('.session-sub')?.textContent).toContain(
        "Échelle de Fibonacci jusqu'à 13",
      );
    });

    it('is read-only on a phone: nothing to edit, no animation link', () => {
      phone.set(true);
      const ui = mount();
      ui.show(sessionState());
      expect(ui.text()).not.toContain('+ Fonctionnalité');
      expect(ui.root.querySelector('app-animation-link')).toBeNull();
      expect(ui.root.querySelector('table')).toBeNull();
    });
  });

  describe('participant view (FR-014b)', () => {
    it('says no round is open, and offers only the disabled read actions', () => {
      const ui = mount();
      ui.show(participantState());
      expect(ui.root.querySelector('.session-sub')?.textContent).toBe(
        'Vous : alice · Animée par eric · Échelle 1 à 10',
      );
      expect(ui.root.querySelector('.notice.info')?.textContent).toContain(
        'Aucun tour de vote en cours',
      );
      const actions = Array.from(
        ui.root.querySelectorAll('.actions button'),
      ) as HTMLButtonElement[];
      expect(actions.map((b) => [b.textContent?.trim(), b.disabled, b.title])).toEqual([
        ['Exporter', true, 'Bientôt disponible'],
        ['Tours révélés', true, 'Bientôt disponible'],
      ]);
    });

    it('shows the whole board and none of the facilitator actions', () => {
      const ui = mount();
      ui.show(participantState({ features: [feature()] }));
      expect(ui.root.querySelectorAll('tbody tr')).toHaveLength(1);
      expect(ui.text()).not.toContain('+ Fonctionnalité');
      expect(ui.text()).not.toContain('Modifier');
      expect(ui.root.querySelector('app-animation-link')).toBeNull();
    });

    it('does not say « no round » once a feature is in a round', () => {
      const ui = mount();
      ui.show(participantState({ features: [maskedFeature(), feature()] }));
      expect(ui.root.querySelector('.notice.info')).toBeNull();
      expect(ui.text()).toContain('vote en cours');
    });
  });

  describe('read-only consultation view', () => {
    it('shows who animates without a « me »', () => {
      const ui = mount();
      ui.show(sessionState({ me: null }));
      expect(ui.root.querySelector('.session-sub')?.textContent).toBe(
        'Animée par eric · Échelle 1 à 10',
      );
    });
  });

  describe('side panel', () => {
    it('lists participants with presence, « vous » and the business role', () => {
      const ui = mount();
      ui.show(
        participantState({
          participants: [
            FACILITATOR,
            PARTICIPANT,
            {
              ...PARTICIPANT,
              participantId: 'p3',
              pseudo: 'bob',
              online: false,
              businessRole: 'Tech Lead',
            },
          ],
        }),
      );
      expect(ui.root.querySelector('.side h2')?.textContent).toBe('Participants (3)');
      const rows = Array.from(ui.root.querySelectorAll('.plist li')).map((li) =>
        li.textContent?.replace(/\s+/g, ' ').trim(),
      );
      expect(rows).toEqual([
        'eric animateur en ligne',
        'alice (vous) en ligne',
        'bob Tech Lead hors ligne',
      ]);
      expect(ui.root.querySelectorAll('.plist .dot.on')).toHaveLength(2);
      expect(ui.root.querySelectorAll('.plist .dot.off')).toHaveLength(1);
    });

    it('shows the invitation link of the session', () => {
      const ui = mount();
      ui.show(sessionState());
      expect(ui.root.querySelector('app-link-box code')?.textContent).toBe(
        `${window.location.origin}/s/${SESSION_ID}`,
      );
    });

    it('shows the help box for the method of the session', () => {
      const ui = mount();
      ui.show(sessionState());
      expect(ui.root.querySelector('app-method-glossary h3')?.textContent).toBe(
        'Comprendre le WSJF',
      );
    });

    it('is built from the method: another method shows its own help and columns (SC-009)', () => {
      const ui = mount();
      ui.show(
        sessionState({
          methodDefinition: REACH_EFFORT,
          features: [
            feature({
              criteria: { reach: 9, effort: 3 },
              score: computedScore({ ratio: '3,00' }, 1),
            }),
          ],
        }),
      );
      expect(ui.root.querySelector('app-method-glossary h3')?.textContent).toBe(
        'Comprendre le Portée sur effort',
      );
      expect(ui.root.querySelector('thead')?.textContent).toContain('Portée');
      expect(ui.text()).not.toContain('WSJF');
    });
  });

  describe('panels', () => {
    it('opens the detail of a feature from the board, and closes it', () => {
      const ui = mount();
      ui.show(sessionState());
      expect(ui.root.querySelector('app-feature-detail-panel')).toBeNull();
      ui.click('tbody .fid');
      expect(ui.root.querySelector('app-feature-detail-panel h2')?.textContent).toBe(
        'Paiement en un clic',
      );
      ui.click('app-feature-detail-panel .drawer-close');
      expect(ui.root.querySelector('app-feature-detail-panel')).toBeNull();
    });

    it('lets the facilitator edit the title and description in the detail', () => {
      const ui = mount();
      ui.show(sessionState());
      ui.click('tbody .fid');
      expect(ui.text()).toContain('Modifier le titre et le descriptif');
      expect(ui.root.querySelector('app-feature-detail-panel .review-box')).not.toBeNull();
    });

    it('lets a participant only read the detail of a feature', () => {
      const ui = mount();
      ui.show(participantState());
      ui.click('tbody .fid');
      expect(ui.root.querySelector('app-feature-detail-panel h2')?.textContent).toBe(
        'Paiement en un clic',
      );
      expect(ui.text()).not.toContain('Modifier le titre et le descriptif');
      expect(ui.root.querySelector('app-feature-detail-panel .review-box')).toBeNull();
    });

    it('opens the method from the help box, then closes it', () => {
      const ui = mount();
      ui.show(sessionState());
      ui.click('app-method-glossary .link-button');
      expect(ui.root.querySelector('app-method-panel h2')?.textContent).toContain('WSJF');
      expect(ui.root.querySelector('app-method-panel')?.textContent).toContain('entiers de 1 à 10');
      ui.click('app-method-panel .drawer-close');
      expect(ui.root.querySelector('app-method-panel')).toBeNull();
    });

    it('goes from the detail of a feature to the method', () => {
      const ui = mount();
      ui.show(sessionState());
      ui.click('tbody .fid');
      ui.click('app-feature-detail-panel .link-button');
      expect(ui.root.querySelector('app-feature-detail-panel')).toBeNull();
      expect(ui.root.querySelector('app-method-panel')).not.toBeNull();
    });

    it('closes the detail when the feature disappears from the state', () => {
      const ui = mount();
      ui.show(sessionState());
      ui.click('tbody .fid');
      ui.show(sessionState({ version: 2, features: [] }));
      expect(ui.root.querySelector('app-feature-detail-panel')).toBeNull();
    });

    it('keeps the detail up to date when the feature changes', () => {
      const ui = mount();
      ui.show(sessionState());
      ui.click('tbody .fid');
      ui.show(
        sessionState({
          version: 2,
          features: [feature({ version: 1, title: 'Titre modifié ailleurs' })],
        }),
      );
      expect(ui.root.querySelector('app-feature-detail-panel h2')?.textContent).toBe(
        'Titre modifié ailleurs',
      );
    });
  });

  describe('connection', () => {
    it('warns while the connection is lost, and keeps the board', () => {
      const ui = mount();
      ui.show(sessionState());
      socket.connection.set('lost');
      ui.fixture.detectChanges();
      expect(ui.root.querySelector('.notice.danger[role="status"]')?.textContent).toContain(
        'Reconnexion…',
      );
      expect(ui.root.querySelector('app-board')).not.toBeNull();
    });

    it('shows an error that no intention was waiting for', () => {
      const ui = mount();
      ui.show(sessionState());
      const error: ErrorMessage = { type: 'error', code: 'FORBIDDEN' };
      socket.messages.next(error);
      ui.fixture.detectChanges();
      expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain(
        "réservée à l'animateur",
      );
    });

    it.each<SessionEnd>(['notFound', 'unknownToken'])(
      'tells the page when the session ends: %s',
      (end) => {
        const ui = mount();
        socket.end.set(end);
        ui.fixture.detectChanges();
        expect(ui.ended).toEqual([end]);
      },
    );
  });
});
