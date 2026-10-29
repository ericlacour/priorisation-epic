import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Feature } from '../api/session-state';
import { APP_CONFIG } from '../config/app-config';
import { ScreenSizeService } from '../layout/screen-size.service';
import { SessionChromeService } from '../layout/session-chrome.service';
import { SessionRoomService } from '../session/session-room.service';
import { FakeRoom } from '../testing/fake-room';
import {
  F1,
  F2,
  INCOMPLETE,
  TWO_CRITERIA,
  completeScore,
  feature,
  state,
} from '../testing/fixtures';
import { memoryStorage } from '../testing/helpers';
import { BoardComponent } from './board.component';

describe('BoardComponent', () => {
  function render(
    options: { animate?: boolean; phone?: boolean; state?: ReturnType<typeof state> } = {},
  ) {
    const room = new FakeRoom();
    room.canAnimate.set(options.animate ?? true);
    room.state.set(
      options.state ??
        state({
          me: {
            participantId: 'p1',
            pseudo: 'Éric',
            role: options.animate === false ? 'PARTICIPANT' : 'FACILITATOR',
          },
        }),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionRoomService, useValue: room },
        { provide: ScreenSizeService, useValue: { isPhone: signal(options.phone ?? false) } },
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'https://api.example' } },
        memoryStorage().provider,
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(BoardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, room, element };
  }

  const headers = (element: HTMLElement) =>
    [...element.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
  const rowsOf = (element: HTMLElement) =>
    [...element.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim()),
    );
  const button = (element: HTMLElement, text: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(text),
    );

  // --- Colonnes tirées de methodDefinition -------------------------------------------------------

  it('replaces the application bar with its session bar while it is shown (FR-014c)', () => {
    const { fixture } = render();
    const chrome = TestBed.inject(SessionChromeService);
    expect(chrome.sessionBar()).toBe(true);
    fixture.destroy();
    expect(chrome.sessionBar()).toBe(false);
  });

  it('shows the participant status line, and only that line for a facilitator on a phone', () => {
    expect(
      render({ animate: false }).element.querySelector('app-action-bar')?.textContent,
    ).toContain('Aucun tour de vote en cours.');
    TestBed.resetTestingModule();
    const phone = render({ phone: true }).element.querySelector('app-action-bar');
    expect(phone?.textContent).toContain('Aucun tour de vote en cours.');
    expect(phone?.querySelector('button')).toBeNull();
  });

  it('shows the read-only banner to a facilitator on a phone when the session is closed', () => {
    const { element } = render({
      phone: true,
      state: state({
        status: 'CLOSED',
        me: { participantId: 'p1', pseudo: 'Éric', role: 'FACILITATOR' },
      }),
    });
    const bar = element.querySelector('app-action-bar');
    expect(bar?.textContent).toContain('Session clôturée : lecture seule');
    expect(bar?.querySelector('button')).toBeNull();
  });

  it('shows the rank, id, title, then one column per criterion and computed value of the definition', () => {
    const { element } = render();
    expect(headers(element)).toEqual([
      'Rang',
      'Identifiant',
      'Titre',
      'BV',
      'TC',
      'RR/OE',
      'JS',
      'CoD',
      'WSJF',
      'Actions',
    ]);
  });

  it('shows each feature with its retained values and computed values, in the order received', () => {
    const { element } = render({ animate: false });
    const rows = rowsOf(element);
    expect(rows[0]).toEqual(['1', 'F-1', 'Paiement en un clic', '8', '5', '3', '4', '16', '4,00']);
    expect(rows[1]).toEqual([
      '—',
      'F-2',
      'Export comptable',
      '3',
      '—',
      '—',
      '—',
      '—',
      'non calculé',
    ]);
  });

  it('keeps the order sent by the server, whatever the values', () => {
    const second = feature({
      id: 'f3',
      externalId: 'F-0',
      criteria: { bv: 1, tc: 1, rrOe: 1, js: 10 },
      score: completeScore(
        2,
        { cod: '3', wsjf: '0,30' },
        'CoD = 1 + 1 + 1 = 3 ; WSJF = 3 / 10 = 0,30',
      ),
    });
    const { element } = render({ state: state({ features: [F1, second, F2] }) });
    expect(rowsOf(element).map((row) => row[1])).toEqual(['F-1', 'F-0', 'F-2']);
  });

  it('follows another method definition: columns, inputs and help come from the definition alone (SC-009)', () => {
    const rated = feature({
      id: 'r1',
      externalId: 'R-1',
      criteria: { reach: 9, effort: 3 },
      score: completeScore(1, { ratio: '3,00' }, 'Ratio = 9 / 3'),
    });
    const { fixture, element } = render({
      state: state({ methodDefinition: TWO_CRITERIA, features: [rated] }),
    });

    expect(headers(element)).toEqual([
      'Rang',
      'Identifiant',
      'Titre',
      'Reach',
      'Effort',
      'Ratio',
      'Actions',
    ]);
    expect(rowsOf(element)[0]).toEqual(['1', 'R-1', 'Titre R-1', '9', '3', '3,00', 'Modifier']);
    expect(element.textContent).not.toContain('BV');
    expect(element.textContent).toContain('Comprendre le Reach / Effort');

    button(element, 'Modifier')!.click();
    fixture.detectChanges();
    expect(
      [...element.querySelectorAll('.edit-row input')].map((i) => i.getAttribute('aria-label')),
    ).toEqual(['Titre', 'Reach', 'Effort']);
  });

  it('marks values outside the scale and shows « hors échelle » instead of the computed value', () => {
    const outside = feature({
      id: 'f9',
      externalId: 'F-9',
      criteria: { bv: 13, tc: 1, rrOe: 1, js: 1 },
      score: { ...INCOMPLETE, outOfScale: ['bv'] },
    });
    const { element } = render({ state: state({ features: [outside] }) });

    expect(
      element.querySelector('.review[title="Valeur hors échelle (1 à 10)"]')?.textContent?.trim(),
    ).toBe('13');
    expect(element.querySelector('.badge.warn')?.textContent).toBe('hors échelle');
  });

  it('shows the « à revoir » badge with its reason on hover', () => {
    const marked = feature({
      id: 'f8',
      externalId: 'F-8',
      markedForReview: true,
      reviewReason: 'Descriptif à compléter',
    });
    const { element } = render({ state: state({ features: [marked] }) });

    const badge = element.querySelector('.badge.review')!;
    expect(badge.textContent).toBe('à revoir');
    expect(badge.getAttribute('title')).toBe('À revoir : Descriptif à compléter');
  });

  it('opens the glossary in a panel from the link next to the session name, and shows no legend under the table', () => {
    const { fixture, element } = render();
    expect(element.querySelector('app-method-glossary')).toBeNull();
    expect(element.querySelector('aside')).toBeNull();
    expect(element.textContent).not.toContain('CoD = BV + TC + RR/OE ; WSJF = CoD / JS');

    const link = element.querySelector<HTMLButtonElement>('.session-bar .session-help')!;
    expect(link.textContent?.trim()).toBe('Comprendre le WSJF');
    link.click();
    fixture.detectChanges();
    expect(element.querySelector('app-method-glossary h2')?.textContent).toBe('Comprendre le WSJF');

    element.querySelector<HTMLButtonElement>('app-method-glossary .panel-close')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-method-glossary')).toBeNull();
  });

  it('shows the full title, without truncation', () => {
    const title = 'Un titre très long '.repeat(8).trim();
    const { element } = render({
      state: state({ features: [feature({ id: 'f-long', externalId: 'F-9', title })] }),
    });
    expect(element.querySelector('td.title')?.textContent?.trim()).toBe(title);
  });

  it('defines the acronyms of the headers on keyboard focus', () => {
    const { fixture, element } = render();
    const term = element.querySelector<HTMLButtonElement>('thead app-criterion-term button')!;

    term.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    expect(element.querySelector('[role="tooltip"]')?.textContent).toContain('Business Value');
  });

  // --- Vue participant ---------------------------------------------------------------------------

  it('gives a participant the full board with no animation action (FR-014b)', () => {
    const { element } = render({ animate: false });

    expect(headers(element)).not.toContain('Actions');
    expect(button(element, 'Modifier')).toBeUndefined();
    expect(button(element, '+ Fonctionnalité')).toBeUndefined();
    expect(element.textContent).toContain('Aucun tour de vote en cours');
    expect(button(element, 'Exporter')?.disabled).toBe(false);
    expect(button(element, 'Tours révélés')?.disabled).toBe(true);
    expect(button(element, 'Liens')).toBeUndefined();
    expect(button(element, 'Importer')).toBeUndefined();
    expect(button(element, 'Échelle')).toBeUndefined();
    expect(element.querySelector('.board-info-text')?.textContent).toBe(
      'Vous : Éric · Animée par Éric · Échelle 1 à 10',
    );
  });

  it('shows a closed session read-only, even to its facilitator (FR-004, FR-026)', () => {
    const { element } = render({ state: state({ status: 'CLOSED' }) });

    expect(headers(element)).not.toContain('Actions');
    expect(button(element, 'Modifier')).toBeUndefined();
    expect(button(element, '+ Fonctionnalité')).toBeUndefined();
    expect(button(element, 'Importer')).toBeUndefined();
    expect(button(element, 'Rouvrir la session')?.disabled).toBe(false);
    expect(element.textContent).toContain('Session clôturée : lecture seule');
    expect(element.querySelector('.session-sub .badge')?.textContent).toBe('Clôturée');
    expect(button(element, 'Exporter')?.disabled).toBe(false);
  });

  it('closes the line being edited when the session gets closed', () => {
    const { fixture, room, element } = render();
    button(element, 'Modifier')!.click();
    fixture.detectChanges();
    expect(element.querySelector('tr input')).not.toBeNull();

    room.state.set(state({ status: 'CLOSED' }));
    fixture.detectChanges();
    expect(element.querySelector('tr input')).toBeNull();
  });

  it('shows the participants with their presence on demand (FR-005)', () => {
    const { fixture, element } = render();
    const toggle = button(element, 'Participants (2)')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.plist')).toBeNull();

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const items = [...element.querySelectorAll('.plist li')];
    expect(items[0].textContent?.replace(/\s+/g, ' ')).toContain('Éric (vous)');
    expect(items[0].textContent).toContain('animateur');
    expect(items[0].querySelector('.dot.on')).not.toBeNull();
    expect(items[1].textContent).toContain('hors ligne');
    expect(items[1].querySelector('.dot.off')).not.toBeNull();
  });

  it('puts the formula and the sort rule behind an ⓘ next to the main value header (constitution I)', () => {
    const { fixture, element } = render();
    const headersWithInfo = [...element.querySelectorAll('thead th')].filter((th) =>
      th.querySelector('app-method-info'),
    );
    expect(headersWithInfo.map((th) => th.querySelector('.term')?.textContent?.trim())).toEqual([
      'WSJF',
    ]);
    const info = element.querySelector<HTMLButtonElement>('.info-icon')!;
    expect(info.getAttribute('aria-label')).toContain('CoD = BV + TC + RR/OE ; WSJF = CoD / JS');

    info.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(element.querySelector('.info-tip')?.textContent).toContain('Tri : ');
  });

  it('gives the facilitator the invitation and animation links under « Liens », without showing them', () => {
    const { fixture, element } = render();
    button(element, 'Liens')!.click();
    fixture.detectChanges();
    expect(button(element, 'Copier le lien d’invitation')).toBeDefined();
    expect(element.querySelector('app-animation-link')).not.toBeNull();
    expect(element.textContent).not.toContain('/s/k3Jx9QvT2mLpZ8wR4nYb7A');
  });

  it('offers no animation link on a phone', () => {
    const { fixture, element } = render({ phone: true });
    button(element, 'Liens')!.click();
    fixture.detectChanges();
    expect(button(element, 'Copier le lien d’invitation')).toBeDefined();
    expect(element.querySelector('app-animation-link')).toBeNull();
  });

  it('says the connection is lost and is silent otherwise', () => {
    const { fixture, room, element } = render();
    expect(element.textContent).not.toContain('Reconnexion');
    room.connection.set('lost');
    fixture.detectChanges();
    expect(element.textContent).toContain('Reconnexion…');
  });

  // --- Téléphone ---------------------------------------------------------------------------------

  it('shows read-only cards instead of the table on a phone', () => {
    const { element } = render({ phone: true });

    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelectorAll('.fcard')).toHaveLength(2);
    expect(element.querySelector('.fcard')?.textContent).toContain('4,00');
    expect(element.querySelector('.fcard')?.textContent).toContain('BV 8');
    expect(element.querySelectorAll('.fcard')[1].textContent).toContain('non calculé');
    expect(element.querySelector('.fcard button.fid')).not.toBeNull();
  });

  it('offers the facilitator « Prioriser par classement », when there is something to rank (FR-015a)', () => {
    const { element, fixture } = render();
    let requested = 0;
    fixture.componentInstance.rankingRequested.subscribe(() => requested++);
    button(element, 'Prioriser par classement')!.click();
    expect(requested).toBe(1);

    button(element, 'Modifier')!.click();
    fixture.detectChanges();
    expect(button(element, 'Prioriser par classement')!.disabled).toBe(true);
  });

  it('offers no ranking to a participant, nor on an empty board', () => {
    expect(button(render({ animate: false }).element, 'Prioriser par classement')).toBeUndefined();
    TestBed.resetTestingModule();
    const { element } = render({ state: state({ features: [] }) });
    expect(button(element, 'Prioriser par classement')!.disabled).toBe(true);
  });

  it('shows an empty board message', () => {
    const { element } = render({ state: state({ features: [] }) });
    expect(rowsOf(element)[0][0]).toContain('Aucune fonctionnalité');
    expect(rowsOf(element)[0][0]).toContain('+ Fonctionnalité');
  });

  // --- Ajout, modification, suppression (animateur) ----------------------------------------------

  const fill = (element: HTMLElement, label: string, value: string) => {
    const input = element.querySelector<HTMLInputElement>(
      `.edit-row input[aria-label="${label}"]`,
    )!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('adds a feature with a single addFeature intent, then closes the line once it appears', () => {
    const { fixture, room, element } = render();

    button(element, '+ Fonctionnalité')!.click();
    fixture.detectChanges();
    fill(element, 'Identifiant', 'F-3');
    fill(element, 'Titre', 'Nouvelle');
    fill(element, 'BV', '7');
    button(element, 'Enregistrer')!.click();
    fixture.detectChanges();

    expect(room.addFeature).toHaveBeenCalledTimes(1);
    expect(room.addFeature).toHaveBeenCalledWith({
      externalId: 'F-3',
      title: 'Nouvelle',
      criteria: { bv: 7 },
    });
    expect(element.querySelector('.edit-row')).not.toBeNull();

    room.state.set(
      state({ features: [F1, F2, feature({ id: 'f3', externalId: 'F-3', title: 'Nouvelle' })] }),
    );
    fixture.detectChanges();
    expect(element.querySelector('.edit-row')).toBeNull();
  });

  it('edits a line: one updateFeature with the version and only what changed', () => {
    const { fixture, room, element } = render();

    button(element, 'Modifier')!.click();
    fixture.detectChanges();
    fill(element, 'JS', '10');
    button(element, 'Enregistrer')!.click();

    expect(room.updateFeature).toHaveBeenCalledTimes(1);
    expect(room.updateFeature).toHaveBeenCalledWith({
      featureId: 'f1',
      version: 2,
      criteria: { js: 10 },
    });
  });

  it('does not re-sort the board while a line is being edited, only once it is saved (FR-015)', () => {
    const { fixture, room, element } = render();
    button(element, 'Modifier')!.click();
    fixture.detectChanges();
    fill(element, 'JS', '10');

    // Pendant la saisie, un autre poste fait passer F-2 en tête : l'ordre affiché ne bouge pas.
    const promoted = { ...F2, score: completeScore(1, { cod: '9', wsjf: '9,00' }, 'x') };
    room.state.set(state({ features: [promoted, { ...F1, score: { ...F1.score!, rank: 2 } }] }));
    fixture.detectChanges();
    expect(rowsOf(element).map((row) => row[1])).toEqual(['F-1', 'F-2']);
    expect(element.querySelector('.edit-row')?.textContent).toContain('F-1');

    // Enregistrer envoie la modification ; la ligne reste ouverte jusqu'à sa confirmation.
    button(element, 'Enregistrer')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.edit-row')).not.toBeNull();

    // L'enregistrement est confirmé (nouvelle version de F-1) : la ligne se referme et le tableau se retrie.
    room.state.set(
      state({ features: [promoted, { ...F1, version: 3, score: { ...F1.score!, rank: 2 } }] }),
    );
    fixture.detectChanges();
    expect(element.querySelector('.edit-row')).toBeNull();
    expect(rowsOf(element).map((row) => row[1])).toEqual(['F-2', 'F-1']);
  });

  it('cancels a line without sending anything', () => {
    const { fixture, room, element } = render();
    button(element, 'Modifier')!.click();
    fixture.detectChanges();
    fill(element, 'BV', '1');

    button(element, 'Annuler')!.click();
    fixture.detectChanges();

    expect(room.updateFeature).not.toHaveBeenCalled();
    expect(element.querySelector('.edit-row')).toBeNull();
  });

  it('asks for a confirmation before deleting, then sends deleteFeature with the version', () => {
    const { fixture, room, element } = render();
    button(element, 'Modifier')!.click();
    fixture.detectChanges();

    button(element, 'Supprimer')!.click();
    fixture.detectChanges();
    expect(room.deleteFeature).not.toHaveBeenCalled();
    expect(element.querySelector('.confirm')?.textContent).toContain('Supprimer F-1 ?');

    button(element, 'Confirmer la suppression')!.click();
    expect(room.deleteFeature).toHaveBeenCalledWith({ featureId: 'f1', version: 2 });

    room.state.set(state({ features: [F2] }));
    fixture.detectChanges();
    expect(element.querySelector('.edit-row')).toBeNull();
  });

  it('deletes with the version read when the edit began, not the live one', () => {
    const { fixture, room, element } = render();
    button(element, 'Modifier')!.click();
    fixture.detectChanges();
    room.state.set(state({ features: [{ ...F1, version: 3 }, F2] }));
    fixture.detectChanges();

    button(element, 'Supprimer')!.click();
    fixture.detectChanges();
    button(element, 'Confirmer la suppression')!.click();

    expect(room.deleteFeature).toHaveBeenCalledWith({ featureId: 'f1', version: 2 });
  });

  it('leaves edit mode when the edited feature is deleted elsewhere', () => {
    const { fixture, room, element } = render();
    button(element, 'Modifier')!.click();
    fixture.detectChanges();

    room.state.set(state({ features: [F2] }));
    fixture.detectChanges();

    expect(element.querySelector('.edit-row')).toBeNull();
    expect(button(element, 'Modifier')!.disabled).toBe(false);
    expect(button(element, '+ Fonctionnalité')!.disabled).toBe(false);
  });

  it('keeps the new line open after DUPLICATE_EXTERNAL_ID, even when an unrelated state arrives', () => {
    const { fixture, room, element } = render();
    button(element, '+ Fonctionnalité')!.click();
    fixture.detectChanges();
    fill(element, 'Identifiant', 'F-1');
    fill(element, 'Titre', 'Doublon');
    button(element, 'Enregistrer')!.click();
    room.refusal.set({ code: 'DUPLICATE_EXTERNAL_ID' });
    fixture.detectChanges();

    // Un participant se connecte : nouvel état, où F-1 est l'ancienne fonctionnalité.
    room.state.set(state({ features: [F1, F2] }));
    fixture.detectChanges();

    expect(element.querySelector('.edit-row')).not.toBeNull();
  });

  it('shows the refusal of an intent in French', () => {
    const { fixture, room, element } = render();
    room.refusal.set({ code: 'DUPLICATE_EXTERNAL_ID' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Cet identifiant existe déjà',
    );
  });

  it('sends the version read when the edit began, even if the live state moved on (no silent overwrite)', () => {
    const { fixture, room, element } = render();
    button(element, 'Modifier')!.click();
    fixture.detectChanges();
    fill(element, 'JS', '3');
    room.state.set(
      state({ features: [{ ...F1, version: 3, criteria: { ...F1.criteria, bv: 9 } }, F2] }),
    );
    fixture.detectChanges();

    button(element, 'Enregistrer')!.click();

    expect(room.updateFeature).toHaveBeenCalledWith({
      featureId: 'f1',
      version: 2,
      criteria: { js: 3 },
    });
  });

  it('after STALE_VERSION shows the current values and lets the facilitator keep them or replace them', () => {
    const { fixture, room, element } = render();
    button(element, 'Modifier')!.click();
    fixture.detectChanges();
    fill(element, 'JS', '3');
    button(element, 'Enregistrer')!.click();
    // Un autre poste a modifié F-1 entre-temps : version 3, JS = 5.
    const current: Feature = { ...F1, version: 3, criteria: { ...F1.criteria, js: 5 } };
    room.state.set(state({ features: [current, F2] }));
    room.refusal.set({ code: 'STALE_VERSION', featureId: 'f1' });
    fixture.detectChanges();

    const notice = element.querySelector('.toast')!;
    expect(notice.textContent).toContain('F-1 a été modifiée entre-temps');
    expect(notice.textContent).toContain('JS 5');

    button(element, 'Remplacer par les miennes')!.click();
    expect(room.updateFeature).toHaveBeenLastCalledWith({
      featureId: 'f1',
      version: 3,
      criteria: { js: 3 },
    });

    button(element, 'Garder les valeurs actuelles')!.click();
    fixture.detectChanges();
    expect(room.clearRefusal).toHaveBeenCalled();
    expect(element.querySelector('.edit-row')).toBeNull();
  });

  it('shows a lost-connection refusal instead of failing silently', () => {
    const { fixture, room, element } = render();
    room.refusal.set({ code: 'NOT_CONNECTED' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Connexion perdue');
  });

  // --- Panneau de détail et de méthode ------------------------------------------------------------

  it('opens the detail panel on the id and shows the full description, values and calculation as sent', () => {
    const { fixture, element } = render({ animate: false });

    element.querySelector<HTMLButtonElement>('.fid')!.click();
    fixture.detectChanges();

    const panel = element.querySelector('app-feature-detail-panel')!;
    expect(panel.querySelector('[role="dialog"]')).not.toBeNull();
    expect(panel.querySelector('h2')?.textContent).toBe('Paiement en un clic');
    expect(panel.querySelector('.description')?.textContent).toContain('Second paragraphe.');
    expect(panel.querySelector('.explanation')?.textContent).toBe(
      'CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00',
    );
    expect(
      [...panel.querySelectorAll('.values li')].map((li) =>
        [...li.children].map((child) => child.textContent?.trim()).join(' '),
      ),
    ).toEqual([
      'BV · Business Value 8',
      'TC · Time Criticality 5',
      'RR/OE · Risk Reduction / Opportunity Enablement 3',
      'JS · Job Size 4',
    ]);
  });

  it('closes the detail panel when its feature is deleted elsewhere', () => {
    const { fixture, room, element } = render();
    element.querySelector<HTMLButtonElement>('.fid')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-feature-detail-panel')).not.toBeNull();

    room.state.set(state({ features: [F2] }));
    fixture.detectChanges();

    expect(element.querySelector('app-feature-detail-panel')).toBeNull();
  });

  it('opens the method panel from the glossary', () => {
    const { fixture, element } = render();

    element.querySelector<HTMLButtonElement>('.session-bar .session-help')!.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('app-method-glossary .link-button')!.click();
    fixture.detectChanges();

    expect(element.querySelector('app-method-glossary')).toBeNull();
    expect(element.querySelector('app-method-panel h2')?.textContent).toContain('WSJF');
    element.querySelector<HTMLButtonElement>('app-method-panel .panel-close')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-method-panel')).toBeNull();
  });

  it('changes the review mark from the detail panel with an updateFeature intent', () => {
    const { fixture, room, element } = render();
    element.querySelector<HTMLButtonElement>('.fid')!.click();
    fixture.detectChanges();

    button(element, 'Marquer à revoir')!.click();
    fixture.detectChanges();
    const reason = element.querySelector<HTMLInputElement>('#detail-reason')!;
    reason.value = 'À confirmer';
    reason.dispatchEvent(new Event('input'));
    button(element, 'Marquer')!.click();

    expect(room.updateFeature).toHaveBeenCalledWith({
      featureId: 'f1',
      version: 2,
      markedForReview: true,
      reviewReason: 'À confirmer',
    });
  });

  it('opens the import and scale dialogs for the facilitator', () => {
    const { fixture, element } = render();
    button(element, 'Importer')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-import-dialog')).not.toBeNull();
    (element.querySelector('app-import-dialog .panel-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('app-import-dialog')).toBeNull();

    button(element, 'Échelle')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-settings-dialog')).not.toBeNull();
    button(element, 'Annuler')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-settings-dialog')).toBeNull();
  });

  it('names a Fibonacci scale in the info line and in the out-of-scale hint', () => {
    const outOfScale = feature({
      id: 'f5',
      externalId: 'F-5',
      criteria: { bv: 4 },
      score: { ...INCOMPLETE, outOfScale: ['bv'] },
    });
    const { element } = render({
      state: state({
        scale: { type: 'FIBONACCI', max: 13, allowedValues: [1, 2, 3, 5, 8, 13] },
        features: [outOfScale],
      }),
    });
    expect(element.querySelector('.board-info-text')?.textContent).toContain(
      'Échelle Fibonacci 1, 2, 3, 5, 8, 13',
    );
    expect(element.querySelector('td .review')?.getAttribute('title')).toBe(
      'Valeur hors échelle (Fibonacci 1, 2, 3, 5, 8, 13)',
    );
  });

  it('tells a participant why the live ranking stopped, until they close the message (FR-015b)', () => {
    const { fixture, room, element } = render({ animate: false });
    room.rankingEnd.set('FACILITATOR_LEFT');
    fixture.detectChanges();
    expect(element.textContent).toContain('L’animateur s’est déconnecté');

    button(element, 'Fermer')!.click();
    fixture.detectChanges();
    expect(room.dismissRankingEnd).toHaveBeenCalled();
    expect(element.textContent).not.toContain('L’animateur s’est déconnecté');
  });

  it('does not tell the facilitator, who stopped the ranking', () => {
    const { fixture, room, element } = render();
    room.rankingEnd.set('CANCELLED');
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Le classement a été annulé');
  });
});
