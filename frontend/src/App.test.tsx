import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const API_URL = 'http://api.test';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('App: API status', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', API_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders the logo', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}));

    render(<App />);

    expect(screen.getByRole('heading', { name: 'talkshop' })).toBeInTheDocument();
  });

  it('shows "API: проверка…" while the request is pending', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}));

    render(<App />);

    expect(screen.getByText('API: проверка…')).toBeInTheDocument();
  });

  it('shows "API: ok" and calls {VITE_API_URL}/health when the API answers 200 with status ok', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ status: 'ok', db: 'up' }, 200));

    render(<App />);

    expect(await screen.findByText('API: ok')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/health`, expect.anything());
  });

  it('shows "API: недоступен" when the network request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    render(<App />);

    expect(await screen.findByText('API: недоступен')).toBeInTheDocument();
  });

  it('shows "API: недоступен" when the API answers with a non-200 status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'error', db: 'down' }, 503),
    );

    render(<App />);

    expect(await screen.findByText('API: недоступен')).toBeInTheDocument();
  });

  it('shows "API: недоступен" immediately and does not call fetch when VITE_API_URL is not set', () => {
    vi.stubEnv('VITE_API_URL', undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<App />);

    expect(screen.getByText('API: недоступен')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows "API: недоступен" immediately and does not call fetch when VITE_API_URL is an empty string', () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<App />);

    expect(screen.getByText('API: недоступен')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
