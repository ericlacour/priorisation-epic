import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { WakeScreenComponent } from './wake-screen.component';

describe('WakeScreenComponent', () => {
  function render(unavailable: boolean) {
    const fixture = TestBed.createComponent(WakeScreenComponent);
    fixture.componentRef.setInput('unavailable', unavailable);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the wake labels as a status region', () => {
    const element: HTMLElement = render(false).nativeElement;
    expect(element.querySelector('h1')?.textContent).toBe('Réveil du service…');
    expect(element.querySelector('.lead')?.textContent).toBe("Ça peut prendre jusqu'à 2 minutes.");
    expect(element.querySelector('[role="status"]')).not.toBeNull();
    expect(element.querySelector('button')).toBeNull();
  });

  it('shows the unavailable message and emits retry on « Réessayer »', () => {
    const fixture = render(true);
    const element: HTMLElement = fixture.nativeElement;
    let retried = 0;
    fixture.componentInstance.retry.subscribe(() => retried++);

    expect(element.querySelector('h1')?.textContent).toBe('Le service ne répond pas.');
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    const button = element.querySelector('button');
    expect(button?.textContent?.trim()).toBe('Réessayer');
    button?.click();
    expect(retried).toBe(1);
  });
});
