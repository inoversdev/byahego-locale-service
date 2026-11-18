import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import { ApiError, fetchCountry, fetchSummary, type CountrySummary } from './api';
import { h, plural } from './dom';
import { loadShapes } from './geo';
import { Globe } from './globe';
import { Panel } from './panel';
import { createSearch } from './search';
import { rampColor } from './theme';

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);

  if (!element) throw new Error(`Missing #${id} in index.html`);

  return element as T;
};

const status = required('status');
const live = required('live');
const tooltip = required('tooltip');
const rotateButton = required<HTMLButtonElement>('rotate');
const rotateLabel = required('rotate-label');
const globeHost = required('globe');

const showStatus = (message: string, kind: 'loading' | 'error', onRetry?: () => void): void => {
  const card = h('div', { class: `card${kind === 'error' ? ' error' : ''}` });

  if (kind === 'loading') card.append(h('span', { class: 'spinner', attrs: { 'aria-hidden': 'true' } }));

  card.append(h('span', { text: message }));

  if (onRetry) {
    const retry = h('button', { class: 'btn', text: 'Retry', attrs: { type: 'button' } });
    retry.style.margin = '0';
    retry.addEventListener('click', onRetry);
    card.append(retry);
  }

  status.replaceChildren(card);
};

const clearStatus = (): void => status.replaceChildren();

// Legend ramp comes from the same function as the map colours.
required('ramp').style.background = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(rampColor).join(', ')})`;

const bootstrap = async (): Promise<void> => {
  showStatus('Loading the globe…', 'loading');

  let summary: CountrySummary[] = [];
  let summaryError: string | null = null;

  const [shapes] = await Promise.all([
    loadShapes(),
    fetchSummary()
      .then((data) => {
        summary = data;
      })
      .catch((error: unknown) => {
        summaryError = error instanceof Error ? error.message : 'Could not load country data.';
      })
  ]);

  const byCode = new Map(summary.map((item) => [item.code, item]));
  const totals = summary.map((item) => item.language_count + item.dialect_count);
  const max = Math.max(1, ...totals);
  const tint = new Map<string, number>();

  for (const item of summary) {
    const total = item.language_count + item.dialect_count;

    // Log scale: a few data-rich countries must not wash out everything else.
    if (total > 0) tint.set(item.code, Math.log1p(total) / Math.log1p(max));
  }

  required('legend-max').textContent = `${max.toLocaleString()}+`;

  const globe = new Globe({ container: globeHost, shapes, tint });
  let selectedCode: string | null = null;
  let request = 0;
  let abort: AbortController | null = null;

  const updateInsets = (): void => {
    const { right, bottom } = panel.footprint;
    globe.setInsets(right, bottom);
  };

  const load = async (code: string, name: string): Promise<void> => {
    const ticket = (request += 1);

    abort?.abort();
    abort = new AbortController();
    panel.showLoading(name);
    updateInsets();
    globe.setMarkers([]);

    try {
      const detail = await fetchCountry(code, abort.signal);

      if (ticket !== request) return;

      panel.showCountry(detail);
      panel.focusHeading();
      live.textContent = panel.summaryText(detail);
      updateInsets();

      globe.setMarkers(
        detail.languages
          .filter((item) => item.type === 'dialect' && item.latitude !== null && item.longitude !== null)
          .map((item) => ({ id: item.id, lat: item.latitude as number, lon: item.longitude as number }))
      );
    } catch (error) {
      if (ticket !== request || (error instanceof DOMException && error.name === 'AbortError')) return;

      const notFound = error instanceof ApiError && error.status === 404;

      panel.showError(
        name,
        notFound ? 'This country is not stored in the database.' : error instanceof Error ? error.message : 'Something went wrong.',
        !notFound
      );
      live.textContent = `Could not load ${name}.`;
    }
  };

  const select = (code: string, name: string, fly = true): void => {
    selectedCode = code;
    globe.select(code, fly);
    history.replaceState(null, '', `#${code}`);
    void load(code, name);
  };

  const close = (): void => {
    selectedCode = null;
    request += 1;
    abort?.abort();
    panel.hide();
    globe.select(null);
    globe.setMarkers([]);
    updateInsets();
    history.replaceState(null, '', location.pathname + location.search);
  };

  const panel = new Panel(required('panel'), {
    onClose: close,
    onRetry: () => {
      if (selectedCode) {
        const name = byCode.get(selectedCode)?.name ?? selectedCode;
        void load(selectedCode, name);
      }
    },
    onFocusDialect: (item) => globe.focusMarker(item.id)
  });

  globe.onSelect = (shape) => {
    if (shape.code) select(shape.code, shape.name);
  };

  globe.onHover = ({ shape, clientX, clientY }) => {
    if (!shape?.code) {
      tooltip.hidden = true;
      return;
    }

    const info = byCode.get(shape.code);
    const detail = info
      ? `${plural(info.language_count, 'language')} · ${plural(info.dialect_count, 'dialect')}`
      : 'No data stored';

    tooltip.replaceChildren(h('strong', { text: info?.name ?? shape.name }), h('span', { text: detail }));
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(clientX + 16, window.innerWidth - 250)}px`;
    tooltip.style.top = `${Math.min(clientY + 16, window.innerHeight - 70)}px`;
  };

  createSearch({
    input: required<HTMLInputElement>('country-search'),
    list: required<HTMLUListElement>('country-options'),
    items: () => summary,
    onPick: (item) => select(item.code, item.name)
  });

  // Rotation toggle (also updated when the user grabs the globe).
  const syncRotate = (): void => {
    rotateButton.setAttribute('aria-pressed', String(!globe.autoRotate));
    rotateLabel.textContent = globe.autoRotate ? 'Pause rotation' : 'Resume rotation';
  };

  globeHost.addEventListener('rotatechange', syncRotate);
  rotateButton.addEventListener('click', () => globe.setAutoRotate(!globe.autoRotate));
  syncRotate();

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.isOpen) close();
  });

  window.addEventListener('resize', updateInsets);

  // Deep link: /#PH opens the Philippines (also when only the hash changes).
  const openFromHash = (): void => {
    const code = decodeURIComponent(location.hash.slice(1)).toUpperCase();

    if (/^[A-Z]{2}$/.test(code) && code !== selectedCode) {
      select(code, byCode.get(code)?.name ?? code);
    }
  };

  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  if (summaryError) {
    showStatus(`Country data unavailable: ${summaryError}`, 'error', () => location.reload());
  } else {
    clearStatus();
  }
};

bootstrap().catch((error: unknown) => {
  showStatus(error instanceof Error ? error.message : 'Could not start the globe.', 'error', () => location.reload());
});
