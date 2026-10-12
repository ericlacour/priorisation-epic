import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SessionStateService } from '../session/session-state.service';
import { ROUND_ID, round } from '../testing/fixtures';
import { SessionStub, sessionStub } from '../testing/session-stub';
import { RoundBannerComponent } from './round-banner.component';

describe('RoundBannerComponent', () => {
  let stub: SessionStub;

  beforeEach(() => {
    stub = sessionStub();
    TestBed.configureTestingModule({
      providers: [{ provide: SessionStateService, useValue: stub }],
    });
  });

  function mount(canReveal: boolean) {
    const fixture = TestBed.createComponent(RoundBannerComponent);
    fixture.componentRef.setInput('round', round({ number: 2 }));
    fixture.componentRef.setInput('canReveal', canReveal);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, button: root.querySelector('button') };
  }

  it('says which round is open for everyone, with the votes kept hidden', () => {
    const ui = mount(false);
    expect(ui.root.textContent).toContain('Tour 2 en cours sur 1 fonctionnalité');
    expect(ui.root.textContent).toContain('cachés jusqu’à la révélation'.replace('’', "'"));
    expect(ui.button).toBeNull();
  });

  it('lets the facilitator reveal the round', async () => {
    const ui = mount(true);
    expect(ui.button?.textContent?.trim()).toBe('Révéler le tour 2');
    ui.button!.click();
    await ui.fixture.whenStable();
    expect(stub.revealRound).toHaveBeenCalledWith(ROUND_ID);
  });

  it('shows the refusal of the server', async () => {
    stub.revealRound.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    const ui = mount(true);
    ui.button!.click();
    await ui.fixture.whenStable();
    ui.fixture.detectChanges();
    expect(ui.root.querySelector('[role="alert"]')).not.toBeNull();
  });
});
