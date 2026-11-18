export interface CountrySummary {
  code: string;
  name: string;
  language_count: number;
  dialect_count: number;
}

export interface LanguageItem {
  type: 'language' | 'dialect';
  id: string;
  name: string;
  native_name: string | null;
  code: string | null;
  iso639_1: string | null;
  iso639_3: string | null;
  official_status: string | null;
  population_percent: number | null;
  family_id: string | null;
  parent_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface CountryDetail {
  code: string;
  alpha3_code: string | null;
  numeric_code: string | null;
  name: string;
  native_name: string | null;
  languages: LanguageItem[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

const API_BASE = '/api/v1/countries';

const UNREACHABLE =
  "Can't reach the locale service. Make sure the API is running (npm run dev) and try again.";

const request = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(UNREACHABLE, 0);
  }

  let body: Envelope<T> | null = null;

  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    // Non-JSON body: handled below.
  }

  // 502/503/504 come from the dev proxy or a gateway when the API is not running.
  if ([502, 503, 504].includes(response.status)) {
    throw new ApiError(UNREACHABLE, response.status);
  }

  if (!response.ok || !body?.success) {
    throw new ApiError(body?.message ?? `Request failed (${response.status}).`, response.status);
  }

  return body.data;
};

export const fetchSummary = (signal?: AbortSignal): Promise<CountrySummary[]> =>
  request<CountrySummary[]>('/summary', signal);

export const fetchCountry = (code: string, signal?: AbortSignal): Promise<CountryDetail> =>
  request<CountryDetail>(`/${encodeURIComponent(code)}`, signal);
