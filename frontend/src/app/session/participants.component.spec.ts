import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Participant } from '../api/contract';
import {
  BOB,
  FACILITATOR,
  FACILITATOR_ID,
  PARTICIPANT,
  PARTICIPANT_ID,
  round,
} from '../testing/fixtures';
import { SessionStub, sessionStub } from '../testing/session-stub';
import { ParticipantsComponent } from './participants.component';
import { SessionStateService } from './session-state.service';

describe('ParticipantsComponent', () => {
  let stub: SessionStub;

  beforeEach(() => {
    stub = sessionStub();
    TestBed.configureTestingModule({
      providers: [{ provide: SessionStateService, useValue: stub }],
    });
  });

  function mount(
    options: { canTransfer?: boolean; withRound?: boolean; people?: Participant[] } = {},
  ) {
    const fixture = TestBed.createComponent(ParticipantsComponent);
    fixture.componentRef.setInput(
      'participants',
      options.people ?? [FACILITATOR, PARTICIPANT, { ...BOB, online: false }],
    );
    fixture.componentRef.setInput('meId', FACILITATOR_ID);
    fixture.componentRef.setInput('canTransfer', options.canTransfer ?? false);
    if (options.withRound) {
      fixture.componentRef.setInput(
        'round',
        round({
          featureIds: ['a', 'b', 'c'],
          progress: [
            { participantId: FACILITATOR_ID, completedCount: 3 },
            { participantId: PARTICIPANT_ID, completedCount: 2 },
          ],
        }),
      );
    }
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const buttons = () => Array.from(root.querySelectorAll<HTMLButtonElement>('li button'));
    return { fixture, root, buttons, text: () => root.textContent?.replace(/\s+/g, ' ') ?? '' };
  }

  it('lists the participants with their presence and role', () => {
    const ui = mount();
    expect(ui.text()).toContain('Participants (3)');
    expect(ui.text()).toContain('eric (vous)');
    expect(ui.text()).toContain('animateur');
    expect(ui.root.querySelectorAll('.dot.on')).toHaveLength(2);
    expect(ui.root.querySelectorAll('.dot.off')).toHaveLength(1);
    expect(ui.buttons()).toHaveLength(0);
  });

  it('shows the progress of every participant during a round', () => {
    const ui = mount({ withRound: true });
    const progress = Array.from(ui.root.querySelectorAll('.progress')).map((e) =>
      e.textContent?.trim(),
    );
    expect(progress).toEqual(['3 / 3', '2 / 3', '0 / 3']);
  });

  it('shows no progress without a round', () => {
    expect(mount().root.querySelector('.progress')).toBeNull();
  });

  it('offers the transfer to the facilitator only, disabled for an offline participant', () => {
    const ui = mount({ canTransfer: true });
    const [alice, bob] = ui.buttons();
    expect(alice.getAttribute('aria-label')).toBe("Transmettre le rôle d'animateur à alice");
    expect(alice.disabled).toBe(false);
    expect(bob.disabled).toBe(true);
    expect(bob.parentElement?.getAttribute('title')).toBe("Ce participant n'est pas connecté");
    expect(alice.parentElement?.getAttribute('title')).toBeNull();
  });

  it('asks for a confirmation before transferring, and can be cancelled', async () => {
    const ui = mount({ canTransfer: true });
    ui.buttons()[0].click();
    ui.fixture.detectChanges();
    expect(ui.text()).toContain('Vous deviendrez simple participant');
    expect(stub.transferFacilitator).not.toHaveBeenCalled();
    (ui.root.querySelector('[role="alertdialog"] .btn-secondary') as HTMLButtonElement).click();
    ui.fixture.detectChanges();
    expect(ui.root.querySelector('[role="alertdialog"]')).toBeNull();
    expect(stub.transferFacilitator).not.toHaveBeenCalled();
  });

  it('transfers the role to the chosen participant once confirmed', async () => {
    const ui = mount({ canTransfer: true });
    ui.buttons()[0].click();
    ui.fixture.detectChanges();
    (ui.root.querySelector('[role="alertdialog"] .btn-primary') as HTMLButtonElement).click();
    await ui.fixture.whenStable();
    expect(stub.transferFacilitator).toHaveBeenCalledWith(PARTICIPANT_ID);
  });

  it('shows why a transfer was refused', async () => {
    stub.transferFacilitator.mockResolvedValueOnce({ ok: false, code: 'PARTICIPANT_OFFLINE' });
    const ui = mount({ canTransfer: true });
    ui.buttons()[0].click();
    ui.fixture.detectChanges();
    (ui.root.querySelector('[role="alertdialog"] .btn-primary') as HTMLButtonElement).click();
    await ui.fixture.whenStable();
    ui.fixture.detectChanges();
    expect(ui.root.querySelector('.err')?.textContent).toContain("n'est pas connecté");
  });
});
