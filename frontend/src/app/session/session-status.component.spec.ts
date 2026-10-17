import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SessionStatus } from '../api/session-state';
import { FakeRoom } from '../testing/fake-room';
import { state } from '../testing/fixtures';
import { SessionRoomService } from './session-room.service';
import { SessionStatusComponent } from './session-status.component';

describe('SessionStatusComponent', () => {
  function render(status: SessionStatus | null) {
    const room = new FakeRoom();
    room.state.set(status === null ? null : state({ status }));
    TestBed.configureTestingModule({
      providers: [{ provide: SessionRoomService, useValue: room }],
    });
    const fixture = TestBed.createComponent(SessionStatusComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = () =>
      [...element.querySelectorAll<HTMLButtonElement>('button:not([data-testid])')]
        .filter((b) => !b.classList.contains('panel-close'))
        .map((b) => b.textContent?.trim());
    const button = (text: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === text,
      )!;
    return { fixture, room, element, buttons, button };
  }

  it('offers one button at a time, according to the status (FR-014c)', () => {
    expect(render('PREPARATION').buttons()).toEqual(['Démarrer la session']);
    TestBed.resetTestingModule();
    expect(render('IN_PROGRESS').buttons()).toEqual(['Clôturer la session']);
    TestBed.resetTestingModule();
    const closed = render('CLOSED');
    expect(closed.buttons()).toEqual(['Rouvrir la session']);
    expect(closed.element.textContent).toContain('Session clôturée : lecture seule');
  });

  it('starts and reopens straight away', () => {
    const preparation = render('PREPARATION');
    preparation.button('Démarrer la session').click();
    expect(preparation.room.changeStatus).toHaveBeenCalledWith('START');

    TestBed.resetTestingModule();
    const closed = render('CLOSED');
    closed.button('Rouvrir la session').click();
    expect(closed.room.changeStatus).toHaveBeenCalledWith('REOPEN');
  });

  it('asks for a confirmation before closing (FR-004)', () => {
    const { fixture, room, element, button } = render('IN_PROGRESS');
    button('Clôturer la session').click();
    fixture.detectChanges();

    const dialog = element.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('h2')?.textContent).toBe('Clôturer la session ?');
    expect(dialog.textContent).toContain(
      'Elle passera en lecture seule pour tous. Vous pourrez la rouvrir.',
    );
    expect(room.changeStatus).not.toHaveBeenCalled();

    [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Clôturer la session')!
      .click();
    fixture.detectChanges();
    expect(room.changeStatus).toHaveBeenCalledWith('CLOSE');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('« Annuler » closes the confirmation without sending anything', () => {
    const { fixture, room, element, button } = render('IN_PROGRESS');
    button('Clôturer la session').click();
    fixture.detectChanges();
    button('Annuler').click();
    fixture.detectChanges();

    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(room.changeStatus).not.toHaveBeenCalled();
  });

  it('offers no lifecycle button while the status is unknown', () => {
    expect(render(null).buttons()).toEqual([]);
  });

  it('keeps the confirmation open, with its button disabled, while the connection is lost', () => {
    const { fixture, room, element, button } = render('IN_PROGRESS');
    button('Clôturer la session').click();
    fixture.detectChanges();
    room.connection.set('lost');
    fixture.detectChanges();

    const dialog = element.querySelector('[role="dialog"]')!;
    const confirm = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === 'Clôturer la session',
    )!;
    expect(confirm.disabled).toBe(true);
    expect(dialog.querySelector('[role="status"]')).not.toBeNull();
  });

  it('keeps the confirmation open when the close could not be sent', () => {
    const { fixture, room, element, button } = render('IN_PROGRESS');
    room.changeStatus.mockReturnValue(false);
    button('Clôturer la session').click();
    fixture.detectChanges();
    [...element.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((b) => b.textContent?.trim() === 'Clôturer la session')!
      .click();
    fixture.detectChanges();

    expect(room.changeStatus).toHaveBeenCalledWith('CLOSE');
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('waits for the connection before allowing a change', () => {
    const { fixture, room, button } = render('PREPARATION');
    room.connection.set('lost');
    fixture.detectChanges();
    expect(button('Démarrer la session').disabled).toBe(true);
  });
});
