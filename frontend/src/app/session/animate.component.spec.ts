import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { SESSION_ID } from '../testing/fixtures';
import { memoryStorage } from '../testing/helpers';
import { AnimateComponent } from './animate.component';

describe('AnimateComponent', () => {
  function render(fragment: string | null) {
    const storage = memoryStorage();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([], withComponentInputBinding()),
        storage.provider,
        { provide: ActivatedRoute, useValue: { snapshot: { fragment } } },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AnimateComponent);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    fixture.detectChanges();
    return { storage, navigate, element: fixture.nativeElement as HTMLElement };
  }

  it('stores the animation token from the fragment and opens the session, replacing the address', () => {
    const { storage, navigate, element } = render('secret-token');

    expect(storage.data.get(`pe.animation.${SESSION_ID}`)).toBe('secret-token');
    expect(navigate).toHaveBeenCalledWith(['/s', SESSION_ID], { replaceUrl: true });
    expect(element.querySelector('h1')?.textContent).toBe('Animation de la session');
  });

  it('opens the session without storing anything when the link has no token', () => {
    const { storage, navigate } = render(null);

    expect(storage.data.size).toBe(0);
    expect(navigate).toHaveBeenCalledWith(['/s', SESSION_ID], { replaceUrl: true });
  });
});
