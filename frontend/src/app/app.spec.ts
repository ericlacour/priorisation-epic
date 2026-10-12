import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { ScreenSizeService } from './layout/screen-size.service';
import { ServerWakeService, WakeState } from './wake/server-wake.service';

describe('App', () => {
  function render(isPhone: boolean, state: WakeState = 'ready') {
    const wake = { state: signal(state), start: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ScreenSizeService, useValue: { isPhone: signal(isPhone) } },
        { provide: ServerWakeService, useValue: wake },
      ],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return { wake, element: fixture.nativeElement as HTMLElement };
  }

  it('affiche le bandeau de lecture seule sur téléphone', () => {
    expect(render(true).element.textContent).toContain(
      'Pour voter ou modifier, utilisez un ordinateur',
    );
  });

  it('n affiche pas le bandeau sur ordinateur', () => {
    expect(render(false).element.textContent).not.toContain('utilisez un ordinateur');
  });

  it('démarre l attente du service et affiche toujours la barre du haut', () => {
    const { wake, element } = render(false, 'waking');
    expect(wake.start).toHaveBeenCalledOnce();
    expect(element.querySelector('.brand-name')?.textContent).toBe('Priorisation Fonctionnalités');
    expect(element.querySelector('app-wake-screen')).not.toBeNull();
  });

  it('relance l attente depuis l écran « Le service ne répond pas. »', () => {
    const { wake, element } = render(false, 'unavailable');
    element.querySelector<HTMLButtonElement>('app-wake-screen button')!.click();
    expect(wake.start).toHaveBeenCalledTimes(2);
  });
});
