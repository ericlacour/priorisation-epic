import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { ScreenSizeService } from './layout/screen-size.service';

describe('App', () => {
  function render(isPhone: boolean): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ScreenSizeService, useValue: { isPhone: signal(isPhone) } },
      ],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('affiche le bandeau de lecture seule sur téléphone', () => {
    expect(render(true).textContent).toContain('Pour voter ou modifier, utilisez un ordinateur');
  });

  it('n affiche pas le bandeau sur ordinateur', () => {
    expect(render(false).textContent).not.toContain('utilisez un ordinateur');
  });
});
