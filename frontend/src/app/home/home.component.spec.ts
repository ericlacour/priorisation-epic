import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  it('shows the application name as the page title', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toBe(
      'Priorisation Fonctionnalités',
    );
  });
});
