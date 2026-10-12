import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserStorage, GLOSSARY_KEY, LOCAL_STORAGE } from '../storage/browser-storage';
import { REACH_EFFORT, WSJF } from '../testing/fixtures';
import { MethodGlossaryComponent } from './method-glossary.component';

describe('MethodGlossaryComponent', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    const backing = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    TestBed.configureTestingModule({
      providers: [BrowserStorage, { provide: LOCAL_STORAGE, useValue: () => backing }],
    });
  });

  function mount(definition = WSJF) {
    const fixture = TestBed.createComponent(MethodGlossaryComponent);
    fixture.componentRef.setInput('definition', definition);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const toggle = (root: HTMLElement) => root.querySelector('.glossary-toggle') as HTMLButtonElement;

  it('is open by default and lists criteria then computed values of the method', () => {
    const { root } = mount();
    expect(root.querySelector('h3')?.textContent).toBe('Comprendre le WSJF');
    expect(toggle(root).getAttribute('aria-expanded')).toBe('true');
    const terms = Array.from(root.querySelectorAll('dt')).map((dt) => dt.textContent);
    expect(terms).toEqual([
      'BV · Business Value',
      'TC · Time Criticality',
      'RR/OE · Risk Reduction / Opportunity Enablement',
      'JS · Job Size',
      'CoD · Cost of Delay',
      'WSJF · Weighted Shortest Job First',
    ]);
    expect(root.querySelectorAll('dd')[0].textContent).toContain('Valeur apportée');
  });

  it('collapses and expands, and remembers the choice in the browser', () => {
    const { fixture, root } = mount();
    toggle(root).click();
    fixture.detectChanges();
    expect(root.querySelector('dl')).toBeNull();
    expect(toggle(root).getAttribute('aria-expanded')).toBe('false');
    expect(toggle(root).textContent).toContain('Déplier');
    expect(store.get(GLOSSARY_KEY)).toBe('closed');

    toggle(root).click();
    fixture.detectChanges();
    expect(root.querySelector('dl')).not.toBeNull();
    expect(toggle(root).textContent).toContain('Replier');
    expect(store.get(GLOSSARY_KEY)).toBe('open');
  });

  it('starts collapsed when the browser remembers it', () => {
    store.set(GLOSSARY_KEY, 'closed');
    const { root } = mount();
    expect(root.querySelector('dl')).toBeNull();
    expect(toggle(root).getAttribute('aria-expanded')).toBe('false');
  });

  it('asks for the full method', () => {
    const { fixture, root } = mount();
    const requested = vi.fn();
    fixture.componentInstance.methodRequested.subscribe(requested);
    (root.querySelector('.link-button') as HTMLButtonElement).click();
    expect(requested).toHaveBeenCalledOnce();
  });

  it('is built from the definition: another method shows its own fields (SC-009)', () => {
    const { root } = mount(REACH_EFFORT);
    expect(root.querySelector('h3')?.textContent).toBe('Comprendre le Portée sur effort');
    expect(Array.from(root.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual([
      'Portée · Reach',
      'Effort · Effort',
      'Ratio · Reach / Effort',
    ]);
    expect(root.textContent).not.toContain('WSJF');
  });
});
