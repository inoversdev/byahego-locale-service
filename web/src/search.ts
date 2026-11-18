import type { CountrySummary } from './api';
import { h, plural } from './dom';

interface SearchOptions {
  input: HTMLInputElement;
  list: HTMLUListElement;
  items: () => CountrySummary[];
  onPick: (item: CountrySummary) => void;
}

const MAX_RESULTS = 8;

const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Accessible combobox: the keyboard alternative to clicking the globe. */
export const createSearch = ({ input, list, items, onPick }: SearchOptions): void => {
  let results: CountrySummary[] = [];
  let active = -1;

  const optionId = (index: number): string => `country-option-${index}`;

  const close = (): void => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const setActive = (index: number): void => {
    active = index;

    list.querySelectorAll('li[role="option"]').forEach((node, position) => {
      node.setAttribute('aria-selected', String(position === index));
    });

    if (index >= 0) {
      input.setAttribute('aria-activedescendant', optionId(index));
      document.getElementById(optionId(index))?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const pick = (item: CountrySummary): void => {
    input.value = '';
    close();
    input.blur();
    onPick(item);
  };

  const render = (): void => {
    const term = normalize(input.value);

    if (!term) {
      close();
      return;
    }

    results = items()
      .filter((item) => normalize(item.name).includes(term) || item.code.toLowerCase() === term)
      .sort((a, b) => {
        const aStarts = normalize(a.name).startsWith(term) ? 0 : 1;
        const bStarts = normalize(b.name).startsWith(term) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, MAX_RESULTS);

    list.replaceChildren(
      ...(results.length === 0
        ? [h('li', { class: 'empty', text: 'No matching country', attrs: { role: 'option', 'aria-disabled': 'true' } })]
        : results.map((item, index) => {
            const option = h(
              'li',
              { attrs: { id: optionId(index), role: 'option', 'aria-selected': 'false' } },
              h('span', {}, h('span', { class: 'opt-name', text: item.name }), h('span', { class: 'opt-code', text: item.code })),
              h('span', { class: 'opt-count', text: `${item.language_count + item.dialect_count > 0 ? `${plural(item.language_count, 'lang')} · ${plural(item.dialect_count, 'dialect')}` : 'no data'}` })
            );

            // mousedown (not click) so the input keeps focus until we handle it.
            option.addEventListener('mousedown', (event) => {
              event.preventDefault();
              pick(item);
            });

            return option;
          }))
    );

    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(results.length > 0 ? 0 : -1);
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', close);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (list.hidden) render();
      else setActive(Math.min(results.length - 1, active + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(0, active - 1));
    } else if (event.key === 'Enter') {
      const item = results[active];

      if (item && !list.hidden) {
        event.preventDefault();
        pick(item);
      }
    } else if (event.key === 'Escape' && (!list.hidden || input.value)) {
      // Handle Esc here so it does not also close the details panel.
      event.stopPropagation();
      input.value = '';
      close();
    }
  });
};
