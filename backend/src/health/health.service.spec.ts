import { Connection } from 'mongoose';
import { HealthService } from './health.service';

function makeService(conn: unknown): HealthService {
  return new HealthService(conn as Connection);
}

describe('HealthService', () => {
  it('is up when connected and ping succeeds', async () => {
    const ping = jest.fn().mockResolvedValue({ ok: 1 });
    const service = makeService({
      readyState: 1,
      db: { admin: () => ({ ping }) },
    });
    await expect(service.isDbUp()).resolves.toBe(true);
    expect(ping).toHaveBeenCalled();
  });

  it('is down when not connected', async () => {
    const service = makeService({ readyState: 0, db: undefined });
    await expect(service.isDbUp()).resolves.toBe(false);
  });

  it('is down when ping throws', async () => {
    const ping = jest.fn().mockRejectedValue(new Error('boom'));
    const service = makeService({
      readyState: 1,
      db: { admin: () => ({ ping }) },
    });
    await expect(service.isDbUp()).resolves.toBe(false);
  });
});
