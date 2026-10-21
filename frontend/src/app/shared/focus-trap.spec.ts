import { afterEach, describe, expect, it } from 'vitest';

import { keepTabInside } from './focus-trap';

describe('keepTabInside', () => {
  afterEach(() => document.body.replaceChildren());

  function render(html: string): HTMLElement {
    document.body.innerHTML = `<button id="outside">Dehors</button><section tabindex="-1">${html}</section>`;
    return document.querySelector('section') as HTMLElement;
  }

  function tab(container: HTMLElement, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });
    keepTabInside(event, container);
    return event;
  }

  const byId = (id: string) => document.getElementById(id) as HTMLElement;

  it('brings Tab back to the first control after the last one', () => {
    const container = render('<button id="a">A</button><input id="b" /><button id="c">C</button>');
    byId('c').focus();
    const event = tab(container);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('a'));
  });

  it('brings Shift+Tab to the last control from the first one, or from the container itself', () => {
    const container = render('<button id="a">A</button><button id="c">C</button>');
    byId('a').focus();
    expect(tab(container, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('c'));

    container.focus();
    tab(container, true);
    expect(document.activeElement).toBe(byId('c'));
  });

  it('lets the browser move the focus between two controls inside', () => {
    const container = render('<button id="a">A</button><button id="c">C</button>');
    byId('a').focus();
    expect(tab(container).defaultPrevented).toBe(false);
    byId('c').focus();
    expect(tab(container, true).defaultPrevented).toBe(false);
  });

  it('skips disabled, hidden and unfocusable controls', () => {
    const container = render(
      '<button id="a">A</button><button id="b">B</button><button disabled>X</button>' +
        '<div hidden><button>Y</button></div><span tabindex="-1">Z</span>',
    );
    byId('b').focus();
    tab(container);
    expect(document.activeElement).toBe(byId('a'));
  });

  it('keeps the focus on the container when nothing inside can take it', () => {
    const container = render('<p>Texte</p>');
    container.focus();
    expect(tab(container).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container);
  });

  it('ignores other keys and a Tab already handled by a nested dialog', () => {
    const container = render('<button id="a">A</button>');
    byId('a').focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    keepTabInside(enter, container);
    expect(enter.defaultPrevented).toBe(false);

    const handled = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    handled.preventDefault();
    keepTabInside(handled, container);
    expect(document.activeElement).toBe(byId('a'));
  });
});
