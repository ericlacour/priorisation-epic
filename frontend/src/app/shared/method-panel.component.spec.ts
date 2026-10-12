import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { Scale } from '../api/contract';
import { REACH_EFFORT, WSJF } from '../testing/fixtures';
import { MethodPanelComponent } from './method-panel.component';

function mount(definition = WSJF, scale: Scale | null = null) {
  const fixture = TestBed.createComponent(MethodPanelComponent);
  fixture.componentRef.setInput('definition', definition);
  fixture.componentRef.setInput('scale', scale);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('MethodPanelComponent', () => {
  it('shows the method read-only: name, version, formula, tie-break rule', () => {
    const { root } = mount(WSJF, { type: 'CONTINUOUS', max: 10 });
    expect(root.querySelector('h2')?.textContent).toContain('WSJF');
    expect(root.querySelector('.badge')?.textContent).toBe('version 1');
    expect(root.querySelector('.formula')?.textContent).toBe(WSJF.formula);
    expect(root.textContent).toContain(WSJF.tieBreakRule);
    expect(root.textContent).toContain('ne peut plus être modifiée');
    // lecture seule : aucune action de modification
    expect(root.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(
      Array.from(root.querySelectorAll('button')).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Fermer']);
  });

  it('lists every criterion with its definition and import column', () => {
    const { root } = mount();
    const terms = Array.from(root.querySelectorAll('dl')[0].querySelectorAll('dt')).map(
      (dt) => dt.textContent,
    );
    expect(terms).toEqual([
      'BV · Business Value',
      'TC · Time Criticality',
      'RR/OE · Risk Reduction / Opportunity Enablement',
      'JS · Job Size',
    ]);
    expect(root.querySelectorAll('dl')[0].textContent).toContain(
      "Colonne d'import et d'export : RR/OE.",
    );
  });

  it('lists computed values with their display', () => {
    const { root } = mount();
    const computed = root.querySelectorAll('dl')[1];
    expect(computed.textContent).toContain('CoD · Cost of Delay');
    expect(computed.textContent).toContain('Affichage : entier.');
    expect(computed.textContent).toContain('Affichage : 2 décimales.');
  });

  it('describes the scale of the session, or the default one at creation', () => {
    expect(
      mount(WSJF, { type: 'FIBONACCI', max: 8, allowedValues: [1, 2, 3, 5, 8] }).root.textContent,
    ).toContain('suite de Fibonacci (1, 2, 3, 5, 8)');
    expect(mount(WSJF, null).root.textContent).toContain('entiers de 1 à 10 par défaut');
  });

  it('shows the fields of any method: nothing is specific to WSJF (SC-009)', () => {
    const { root } = mount(REACH_EFFORT);
    expect(root.querySelector('h2')?.textContent).toContain('Portée sur effort');
    expect(root.textContent).toContain('Portée · Reach');
    expect(root.textContent).toContain('Ratio · Reach / Effort');
    expect(root.textContent).not.toContain('WSJF');
    expect(root.textContent).not.toContain('Business Value');
  });

  it('closes with the cross', () => {
    const { fixture, root } = mount();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (root.querySelector('.drawer-close') as HTMLButtonElement).click();
    expect(closed).toHaveBeenCalledOnce();
  });
});
