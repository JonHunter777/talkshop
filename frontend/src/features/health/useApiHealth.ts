import { useEffect, useState } from 'react';

export type ApiHealthStatus = 'loading' | 'ok' | 'unavailable';

/** Checks GET {VITE_API_URL}/health once on mount. Any failure maps to 'unavailable'. */
export function useApiHealth(): ApiHealthStatus {
  const baseUrl = import.meta.env.VITE_API_URL;
  // Missing config: start in the unavailable state instead of crashing.
  const [status, setStatus] = useState<ApiHealthStatus>(baseUrl ? 'loading' : 'unavailable');

  useEffect(() => {
    if (!baseUrl) return;

    // Abort the request if the component unmounts (also covers StrictMode double mount).
    const controller = new AbortController();

    async function check(url: string) {
      try {
        const response = await fetch(`${url}/health`, { signal: controller.signal });
        const body: unknown = await response.json();
        const isOk =
          response.status === 200 &&
          typeof body === 'object' &&
          body !== null &&
          'status' in body &&
          body.status === 'ok';
        setStatus(isOk ? 'ok' : 'unavailable');
      } catch {
        // Aborted requests must not update state after unmount.
        if (!controller.signal.aborted) setStatus('unavailable');
      }
    }

    void check(baseUrl);

    return () => controller.abort();
  }, [baseUrl]);

  return status;
}
