import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SessionStatus } from '../api/contract';
import { SessionStub, sessionStub } from '../testing/session-stub';
import { SessionStatusComponent } from './session-status.component';
import { SessionStateService } from './session-state.service';

describe('SessionStatusComponent', () => {
  let stub: SessionStub;

  beforeEach(() => {
    stub = sessionStub();
    TestBed.configureTestingModule({
      providers: [{ provide: SessionStateService, useValue: stub }],
    });
  });

  function mount(status: SessionStatus) {
    const fixture = TestBed.createComponent(SessionStatusComponent);
    fixture.componentRef.setInput('status', status);
    let opened = 0;
    fixture.componentInstance.openRound.subscribe(() => opened++);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = (name: string) =>
      Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === name) as
        HTMLButtonElement | undefined;
    return { fixture, root, button, opened: () => opened };
  }

  it('offers to start a session in preparation and explains why a round cannot open yet', () => {
    const ui = mount('PREPARATION');
    expect(ui.button('Démarrer la session')).toBeDefined();
    const open = ui.button('Ouvrir un tour')!;
    expect(open.disabled).toBe(true);
    expect(ui.root.querySelector('#start-first')?.textContent).toContain(
      'Démarrez la session pour ouvrir un tour de vote',
    );
    expect(open.getAttribute('aria-describedby')).toBe('start-first');
  });

  it('starts the session with one intent', async () => {
    const ui = mount('PREPARATION');
    ui.button('Démarrer la session')!.click();
    await ui.fixture.whenStable();
    expect(stub.startSession).toHaveBeenCalledTimes(1);
  });

  it('shows the server refusal when the session cannot start', async () => {
    stub.startSession.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    const ui = mount('PREPARATION');
    ui.button('Démarrer la session')!.click();
    await ui.fixture.whenStable();
    ui.fixture.detectChanges();
    expect(ui.root.querySelector('[role="alert"]')?.textContent).toContain(
      'réservée à l’animateur'.replace('’', "'"),
    );
  });

  it('enables « Ouvrir un tour » once the session is in progress, without the start button', () => {
    const ui = mount('IN_PROGRESS');
    expect(ui.button('Démarrer la session')).toBeUndefined();
    const open = ui.button('Ouvrir un tour')!;
    expect(open.disabled).toBe(false);
    expect(ui.root.querySelector('#start-first')).toBeNull();
    open.click();
    expect(ui.opened()).toBe(1);
  });
});
