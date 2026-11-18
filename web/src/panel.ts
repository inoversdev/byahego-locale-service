import type { CountryDetail, LanguageItem } from './api';
import { h, plural } from './dom';

export interface PanelHandlers {
  onClose: () => void;
  onRetry: () => void;
  onFocusDialect: (item: LanguageItem) => void;
}

const STATUS_LABELS: Record<string, string> = {
  official: 'Official',
  de_facto_official: 'De facto official',
  official_regional: 'Regional official'
};

const percentFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

const closeIcon = (): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6 6 18');
  svg.append(path);

  return svg;
};

export class Panel {
  private activeDialect: HTMLButtonElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly handlers: PanelHandlers
  ) {}

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Width/height the panel covers, so the globe can centre in the rest. */
  get footprint(): { right: number; bottom: number } {
    if (!this.isOpen) return { right: 0, bottom: 0 };

    const rect = this.root.getBoundingClientRect();
    const isSheet = rect.width > window.innerWidth * 0.8;

    return isSheet
      ? { right: 0, bottom: Math.round(rect.height + 8) }
      : { right: Math.round(rect.width + 16), bottom: 0 };
  }

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  showLoading(name: string): void {
    const body = h('div', { class: 'panel-body' });

    body.setAttribute('aria-busy', 'true');
    body.append(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));

    this.mount(this.header(name, null, []), body);
  }

  showError(name: string, message: string, retryable: boolean): void {
    const state = h('div', { class: 'error-state', attrs: { role: 'alert' } }, h('p', { text: message }));

    if (retryable) {
      const retry = h('button', { class: 'btn', text: 'Retry', attrs: { type: 'button' } });
      retry.addEventListener('click', () => this.handlers.onRetry());
      state.append(retry);
    }

    this.mount(this.header(name, null, []), h('div', { class: 'panel-body' }, state));
  }

  showCountry(detail: CountryDetail): void {
    const languages = detail.languages.filter((item) => item.type === 'language');
    const dialects = detail.languages.filter((item) => item.type === 'dialect');

    const chips = [
      detail.code,
      detail.alpha3_code,
      detail.numeric_code ? `#${detail.numeric_code}` : null
    ].filter((value): value is string => Boolean(value));

    const body = h('div', { class: 'panel-body' });

    body.append(
      h(
        'div',
        { class: 'stats' },
        h('div', { class: 'stat' }, h('b', { text: languages.length.toLocaleString() }), h('span', { text: languages.length === 1 ? 'language' : 'languages' })),
        h('div', { class: 'stat' }, h('b', { text: dialects.length.toLocaleString() }), h('span', { text: dialects.length === 1 ? 'dialect' : 'dialects' }))
      )
    );

    if (detail.languages.length === 0) {
      body.append(
        h(
          'div',
          { class: 'empty-state' },
          h('p', { text: 'No language data is stored for this country yet.' })
        )
      );
    }

    if (languages.length > 0) {
      body.append(
        h('h3', { class: 'section-title', text: `Languages (${languages.length.toLocaleString()})` }),
        h('ul', { class: 'list' }, ...languages.map((item) => this.languageRow(item)))
      );
    }

    if (dialects.length > 0) {
      body.append(
        h('h3', { class: 'section-title', text: `Dialects (${dialects.length.toLocaleString()})` }),
        h('ul', { class: 'list' }, ...dialects.map((item) => this.dialectRow(item)))
      );
    }

    this.mount(this.header(detail.name, detail.native_name, chips), body);
  }

  focusHeading(): void {
    this.root.querySelector<HTMLElement>('#panel-title')?.focus();
  }

  summaryText(detail: CountryDetail): string {
    const languages = detail.languages.filter((item) => item.type === 'language').length;
    const dialects = detail.languages.length - languages;

    return `${detail.name}: ${plural(languages, 'language')}, ${plural(dialects, 'dialect')}.`;
  }

  // ------------------------------------------------------------- internals

  private mount(header: HTMLElement, body: HTMLElement): void {
    this.activeDialect = null;
    this.root.replaceChildren(header, body);
    this.root.hidden = false;
  }

  private header(name: string, nativeName: string | null, chips: string[]): HTMLElement {
    const title = h('h2', { text: name, attrs: { id: 'panel-title', tabindex: '-1' } });
    const close = h('button', {
      class: 'icon-btn',
      attrs: { type: 'button', 'aria-label': 'Close country details' }
    });

    close.append(closeIcon());
    close.addEventListener('click', () => this.handlers.onClose());

    const text = h('div', {}, title);

    if (nativeName && nativeName !== name) text.append(h('p', { class: 'native', text: nativeName }));
    if (chips.length > 0) text.append(h('div', { class: 'chips' }, ...chips.map((chip) => h('span', { class: 'chip', text: chip }))));

    return h('div', { class: 'panel-head' }, text, close);
  }

  private languageRow(item: LanguageItem): HTMLElement {
    const status = item.official_status ? STATUS_LABELS[item.official_status] ?? item.official_status : null;
    const codes = [item.code, item.iso639_3].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

    const row = h(
      'li',
      { class: 'item' },
      h(
        'div',
        { class: 'item-top' },
        h('span', { class: 'item-name', text: item.name }),
        status ? h('span', { class: item.official_status === 'official' ? 'badge' : 'badge soft', text: status }) : null
      )
    );

    const sub = [item.native_name && item.native_name !== item.name ? item.native_name : null, codes.join(' · ') || null].filter(Boolean).join('  ·  ');

    if (sub) row.append(h('p', { class: 'item-sub', text: sub }));

    if (item.population_percent !== null) {
      const percent = Math.min(100, Math.max(0, item.population_percent));
      const fill = h('span');

      fill.style.width = `${percent}%`;
      row.append(
        h(
          'div',
          { class: 'pop' },
          h('div', { class: 'bar', attrs: { role: 'img', 'aria-label': `${percentFormat.format(percent)} percent of the population` } }, fill),
          h('span', { text: `${percentFormat.format(percent)}%` })
        )
      );
    }

    return row;
  }

  private dialectRow(item: LanguageItem): HTMLElement {
    const hasCoordinates = item.latitude !== null && item.longitude !== null;
    const meta = [item.iso639_3, item.id].filter(Boolean).join(' · ');
    const where = hasCoordinates
      ? `${item.latitude?.toFixed(4)}°, ${item.longitude?.toFixed(4)}°`
      : 'No coordinates stored';

    const content = [
      h('div', { class: 'item-top' }, h('span', { class: 'item-name', text: item.name })),
      h('p', { class: 'item-sub', text: meta }),
      h('p', { class: 'item-sub', text: hasCoordinates ? `Shown on the globe · ${where}` : where })
    ];

    if (!hasCoordinates) return h('li', { class: 'item' }, ...content);

    const button = h('button', { class: 'item', attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': `${item.name}, show on globe` } }, ...content);

    button.addEventListener('click', () => {
      if (this.activeDialect && this.activeDialect !== button) this.activeDialect.setAttribute('aria-pressed', 'false');

      this.activeDialect = button;
      button.setAttribute('aria-pressed', 'true');
      this.handlers.onFocusDialect(item);
    });

    return h('li', {}, button);
  }
}
