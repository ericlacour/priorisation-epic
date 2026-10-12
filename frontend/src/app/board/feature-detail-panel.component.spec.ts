import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Feature, SessionState } from '../api/contract';
import { SessionStateService } from '../session/session-state.service';
import {
  REACH_EFFORT,
  computedScore,
  feature as makeFeature,
  incompleteFeature,
  maskedFeature,
  participantState,
  sessionState,
} from '../testing/fixtures';
import { SessionStub, sessionStub } from '../testing/session-stub';
import { FeatureDetailPanelComponent } from './feature-detail-panel.component';

interface Options {
  feature?: Feature;
  state?: SessionState;
  canEdit?: boolean;
  stub?: SessionStub;
}

function mount(options: Options = {}) {
  const stub = options.stub ?? sessionStub();
  TestBed.configureTestingModule({
    providers: [{ provide: SessionStateService, useValue: stub }],
  });
  const fixture = TestBed.createComponent(FeatureDetailPanelComponent);
  fixture.componentRef.setInput('feature', options.feature ?? makeFeature());
  fixture.componentRef.setInput('state', options.state ?? sessionState());
  fixture.componentRef.setInput('canEdit', options.canEdit ?? false);
  const events = { closed: 0, method: 0 };
  fixture.componentInstance.closed.subscribe(() => events.closed++);
  fixture.componentInstance.methodRequested.subscribe(() => events.method++);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as
      HTMLButtonElement | undefined;
  return {
    fixture,
    root,
    stub,
    events,
    button,
    text: () => root.textContent?.replace(/\s+/g, ' ') ?? '',
    field: (id: string) => root.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement,
    async type(id: string, value: string) {
      const el = this.field(id);
      el.value = value;
      el.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    async click(text: string) {
      button(text)!.click();
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe('FeatureDetailPanelComponent', () => {
  describe('reading (everyone)', () => {
    it('shows identifier, rank, title and the full description', () => {
      const ui = mount();
      expect(ui.root.querySelector('.drawer-head .muted')?.textContent).toBe('F-1 · rang 1');
      expect(ui.root.querySelector('h2')?.textContent).toBe('Paiement en un clic');
      expect(ui.root.querySelector('.description')?.textContent).toBe('Payer en un seul clic.');
    });

    it('says so when there is no description, and omits the rank when there is none', () => {
      const ui = mount({ feature: incompleteFeature({ description: null }) });
      expect(ui.text()).toContain('Aucun descriptif.');
      expect(ui.root.querySelector('.drawer-head .muted')?.textContent).toBe('F-3');
    });

    it('shows the values with the full names of the criteria, from the method definition', () => {
      const ui = mount();
      const grid = ui.root.querySelector('.crit-grid')!;
      expect(grid.textContent).toContain('BV · Business Value');
      expect(grid.textContent).toContain('RR/OE · Risk Reduction / Opportunity Enablement');
      expect(Array.from(grid.querySelectorAll('b')).map((b) => b.textContent)).toEqual([
        '8',
        '5',
        '3',
        '4',
      ]);
    });

    it('shows the calculation exactly as the server explains it', () => {
      const ui = mount();
      expect(ui.root.querySelector('.formula')?.textContent).toBe(
        'CoD = 8 + 5 + 3 = 16 ; WSJF = 16 / 4 = 4,00',
      );
    });

    it('explains why there is no calculation, and shows « non saisi » for a missing value', () => {
      const ui = mount({ feature: incompleteFeature() });
      expect(ui.text()).toContain('Calcul impossible tant que toutes les valeurs');
      expect(ui.text()).toContain('non saisi');
      expect(ui.root.querySelector('.formula')).toBeNull();
    });

    it('draws each criterion contribution relative to the largest value', () => {
      const ui = mount();
      const widths = Array.from(ui.root.querySelectorAll<HTMLElement>('.contrib .bar')).map(
        (b) => b.style.width,
      );
      expect(widths).toEqual(['100%', '62.5%', '37.5%', '50%']);
    });

    it('draws empty bars when no value is entered', () => {
      const f = makeFeature({
        criteria: { bv: null, tc: null, rrOe: null, js: null },
        score: null,
      });
      const widths = Array.from(
        mount({ feature: f }).root.querySelectorAll<HTMLElement>('.contrib .bar'),
      ).map((b) => b.style.width);
      expect(widths).toEqual(['0%', '0%', '0%', '0%']);
    });

    it('links to the method of the session', () => {
      const ui = mount();
      expect(ui.button('Méthode WSJF (v1)')).toBeDefined();
      ui.button('Méthode WSJF (v1)')!.click();
      expect(ui.events.method).toBe(1);
    });

    it('shows the fields of any method (SC-009)', () => {
      const f = makeFeature({
        criteria: { reach: 9, effort: 3 },
        score: computedScore({ ratio: '3,00' }, 1, { explanation: 'Ratio = 9 / 3 = 3,00' }),
      });
      const ui = mount({ feature: f, state: sessionState({ methodDefinition: REACH_EFFORT }) });
      expect(ui.root.querySelector('.crit-grid')?.textContent).toContain('Portée · Reach');
      expect(ui.root.querySelector('.formula')?.textContent).toBe('Ratio = 9 / 3 = 3,00');
      expect(ui.text()).toContain('Méthode Portée sur effort (v1)');
      expect(ui.text()).not.toContain('Business Value');
    });

    it('closes with the cross', () => {
      const ui = mount();
      (ui.root.querySelector('.drawer-close') as HTMLButtonElement).click();
      expect(ui.events.closed).toBe(1);
    });

    it('shows a participant no edit action and no review mark', () => {
      const ui = mount({ state: participantState() });
      expect(ui.button('Modifier le titre et le descriptif')).toBeUndefined();
      expect(ui.root.querySelector('.review-box')).toBeNull();
      expect(ui.root.querySelector('.drawer-foot button')).toBeNull();
    });
  });

  describe('during a round (FR-019a)', () => {
    it('lets a participant read the description but hides values and calculation', () => {
      const ui = mount({
        feature: maskedFeature({ description: 'Description lisible' }),
        state: participantState(),
      });
      expect(ui.root.querySelector('.description')?.textContent).toBe('Description lisible');
      expect(ui.text()).toContain('Ce tour de vote est en cours');
      expect(ui.root.querySelector('.crit-grid')).toBeNull();
      expect(ui.root.querySelector('.formula')).toBeNull();
      expect(ui.root.querySelector('.contrib')).toBeNull();
    });
  });

  describe('review mark (facilitator, FR-006a)', () => {
    it('shows « aucune » and marks with an optional reason, sending one intention', async () => {
      const f = makeFeature({ version: 2 });
      const ui = mount({ feature: f, canEdit: true });
      expect(ui.root.querySelector('.review-box .badge')?.textContent?.trim()).toBe('aucune');
      const reason = ui.root.querySelector('.review-box input') as HTMLInputElement;
      reason.value = '  descriptif à compléter ';
      reason.dispatchEvent(new Event('input'));
      await ui.click('Marquer à revoir');
      expect(ui.stub.updateFeature).toHaveBeenCalledOnce();
      expect(ui.stub.updateFeature).toHaveBeenCalledWith(f.id, 2, {
        markedForReview: true,
        reviewReason: 'descriptif à compléter',
      });
    });

    it('marks without a reason', async () => {
      const f = makeFeature({ version: 2 });
      const ui = mount({ feature: f, canEdit: true });
      await ui.click('Marquer à revoir');
      expect(ui.stub.updateFeature).toHaveBeenCalledWith(f.id, 2, { markedForReview: true });
    });

    it('shows the reason of a marked feature and removes the mark', async () => {
      const f = makeFeature({ version: 3, markedForReview: true, reviewReason: 'à préciser' });
      const ui = mount({ feature: f, canEdit: true });
      expect(ui.root.querySelector('.review-box .badge')?.textContent?.trim()).toBe('à préciser');
      expect(ui.root.querySelector('.review-box input')).toBeNull();
      await ui.click('Retirer la marque');
      expect(ui.stub.updateFeature).toHaveBeenCalledWith(f.id, 3, { markedForReview: false });
    });

    it('names the mark when it has no reason', () => {
      const f = makeFeature({ markedForReview: true, reviewReason: null });
      expect(
        mount({ feature: f, canEdit: true })
          .root.querySelector('.review-box .badge')
          ?.textContent?.trim(),
      ).toBe('Marque « à revoir »');
    });

    it('shows a server error in French', async () => {
      const stub = sessionStub();
      stub.updateFeature.mockResolvedValueOnce({ ok: false, code: 'SESSION_CLOSED' });
      const ui = mount({ canEdit: true, stub });
      await ui.click('Marquer à revoir');
      expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain(
        'La session est clôturée',
      );
    });

    it('shows the current version on STALE_VERSION', async () => {
      const current = makeFeature({
        version: 6,
        title: 'Titre ailleurs',
        description: 'Texte ailleurs',
      });
      const stub = sessionStub([current]);
      stub.updateFeature.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
      const ui = mount({ feature: makeFeature({ version: 5 }), canEdit: true, stub });
      await ui.click('Marquer à revoir');
      expect(ui.text()).toContain('Titre : Titre ailleurs');
      expect(ui.text()).toContain('Descriptif : Texte ailleurs');
    });
  });

  describe('editing the title and the description', () => {
    const base = makeFeature({ version: 4 });

    async function edit(options: Partial<Options> = {}) {
      const ui = mount({ feature: base, canEdit: true, ...options });
      await ui.click('Modifier le titre et le descriptif');
      return ui;
    }

    it('switches to edit mode with the current content, and « Annuler » sends nothing', async () => {
      const ui = await edit();
      expect(ui.field('feature-detail-title').value).toBe('Paiement en un clic');
      expect(ui.field('feature-detail-description').value).toBe('Payer en un seul clic.');
      expect(ui.root.querySelector('.review-box')).toBeNull();
      await ui.type('feature-detail-title', 'Autre');
      await ui.click('Annuler');
      expect(ui.stub.updateFeature).not.toHaveBeenCalled();
      expect(ui.root.querySelector('h2')?.textContent).toBe('Paiement en un clic');
    });

    it('sends nothing and leaves edit mode when nothing changed', async () => {
      const ui = await edit();
      await ui.click('Enregistrer');
      expect(ui.stub.updateFeature).not.toHaveBeenCalled();
      expect(ui.root.querySelector('h2')).not.toBeNull();
    });

    it('refuses an empty title', async () => {
      const ui = await edit();
      await ui.type('feature-detail-title', '   ');
      await ui.click('Enregistrer');
      expect(ui.field('feature-detail-title').getAttribute('aria-invalid')).toBe('true');
      expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain('Saisissez un titre');
      expect(ui.stub.updateFeature).not.toHaveBeenCalled();
    });

    it('sends one updateFeature with the version read, only what changed, and confirms', async () => {
      const ui = await edit();
      await ui.type('feature-detail-title', ' Nouveau titre ');
      await ui.click('Enregistrer');
      expect(ui.stub.updateFeature).toHaveBeenCalledOnce();
      expect(ui.stub.updateFeature).toHaveBeenCalledWith(base.id, 4, { title: 'Nouveau titre' });
      expect(ui.root.querySelector('[role="status"]')?.textContent).toContain(
        'Modification enregistrée et visible par tous les participants.',
      );
      expect(ui.root.querySelector('h2')).not.toBeNull();
    });

    it('turns an emptied description into null', async () => {
      const ui = await edit();
      await ui.type('feature-detail-description', '  ');
      await ui.click('Enregistrer');
      expect(ui.stub.updateFeature).toHaveBeenCalledWith(base.id, 4, { description: null });
    });

    it('shows the current version on STALE_VERSION, and lets you keep it', async () => {
      const current = makeFeature({ version: 6, title: 'Titre ailleurs', description: null });
      const stub = sessionStub([current]);
      stub.updateFeature.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
      const ui = await edit({ stub });
      await ui.type('feature-detail-title', 'Mon titre');
      await ui.click('Enregistrer');
      expect(ui.text()).toContain('Version actuelle');
      expect(ui.text()).toContain('Titre : Titre ailleurs');
      await ui.click('Garder la version actuelle');
      expect(stub.updateFeature).toHaveBeenCalledOnce();
      expect(ui.root.querySelector('h2')).not.toBeNull();
    });

    it('overwrites with the current version when you insist', async () => {
      const current = makeFeature({
        version: 6,
        title: 'Titre ailleurs',
        description: 'Payer en un seul clic.',
      });
      const stub = sessionStub([current]);
      stub.updateFeature.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
      const ui = await edit({ stub });
      await ui.type('feature-detail-title', 'Mon titre');
      await ui.click('Enregistrer');
      await ui.click('Remplacer par ma saisie');
      expect(stub.updateFeature).toHaveBeenLastCalledWith(base.id, 6, { title: 'Mon titre' });
      expect(ui.root.querySelector('[role="status"]')).not.toBeNull();
    });

    it('does not send an overwrite that changes nothing', async () => {
      const current = makeFeature({ version: 6, title: 'Mon titre' });
      const stub = sessionStub([current]);
      stub.updateFeature.mockResolvedValueOnce({ ok: false, code: 'STALE_VERSION' });
      const ui = await edit({ stub });
      await ui.type('feature-detail-title', 'Mon titre');
      await ui.click('Enregistrer');
      await ui.click('Remplacer par ma saisie');
      expect(stub.updateFeature).toHaveBeenCalledOnce();
    });

    it('shows another server error and stays in edit mode', async () => {
      const stub = sessionStub();
      stub.updateFeature.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
      const ui = await edit({ stub });
      await ui.type('feature-detail-title', 'Autre');
      await ui.click('Enregistrer');
      expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain(
        "réservée à l'animateur",
      );
      expect(ui.field('feature-detail-title')).not.toBeNull();
    });

    it('disables the buttons while saving', async () => {
      let release!: () => void;
      const stub = sessionStub();
      stub.updateFeature.mockImplementationOnce(
        () => new Promise((resolve) => (release = () => resolve({ ok: true }))),
      );
      const ui = await edit({ stub });
      await ui.type('feature-detail-title', 'Autre');
      ui.button('Enregistrer')!.click();
      ui.fixture.detectChanges();
      expect(ui.button('Enregistrement…')!.disabled).toBe(true);
      expect(ui.button('Annuler')!.disabled).toBe(true);
      release();
      await ui.fixture.whenStable();
      expect(stub.updateFeature).toHaveBeenCalledOnce();
    });
  });
});
