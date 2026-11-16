import { INestApplication } from '@nestjs/common';
import { dropTestDb, dropTestDbConnection } from './helpers/test-db';

const GOOD_NAME = 'e2e_0123456789ab';

function fakeConnection(name: string, host: string) {
  return { name, host, dropDatabase: jest.fn().mockResolvedValue(undefined) };
}

describe('dropTestDb safety guard', () => {
  it('throws and does not drop a non-e2e database even on localhost', async () => {
    const connection = fakeConnection('talkshop-dev', '127.0.0.1');
    await expect(dropTestDbConnection(connection)).rejects.toThrow('Refusing to drop');
    expect(connection.dropDatabase).not.toHaveBeenCalled();
  });

  it.each(['127.0.0.1', 'localhost'])('drops an e2e database on host %s', async (host) => {
    const connection = fakeConnection(GOOD_NAME, host);
    await dropTestDbConnection(connection);
    expect(connection.dropDatabase).toHaveBeenCalledTimes(1);
  });

  it('throws and does not drop an e2e database on a foreign host', async () => {
    const connection = fakeConnection(GOOD_NAME, 'cluster0.abcde.mongodb.net');
    await expect(dropTestDbConnection(connection)).rejects.toThrow('Refusing to drop');
    expect(connection.dropDatabase).not.toHaveBeenCalled();
  });

  it.each(['e2e_xyz', 'e2e_0123456789AB', 'e2e_0123456789abc'])(
    'throws for the wrongly shaped name %s',
    async (name) => {
      const connection = fakeConnection(name, '127.0.0.1');
      await expect(dropTestDbConnection(connection)).rejects.toThrow('Refusing to drop');
      expect(connection.dropDatabase).not.toHaveBeenCalled();
    },
  );

  it('takes the host from the client options when connection.host is empty', async () => {
    const connection = {
      ...fakeConnection(GOOD_NAME, ''),
      getClient: () => ({ options: { hosts: [{ host: '127.0.0.1' }] } }),
    };
    await dropTestDbConnection(connection);
    expect(connection.dropDatabase).toHaveBeenCalledTimes(1);
  });

  it('does not put the connection string into the error message', async () => {
    const connection = {
      ...fakeConnection(GOOD_NAME, 'cluster0.abcde.mongodb.net'),
      // Extra field that a real connection could carry: must never reach the message.
      // Fake URI without login and password (project rule for test URIs).
      uri: 'mongodb+srv://cluster0.example.invalid/talkshop-dev',
    };
    const error = await dropTestDbConnection(connection).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('mongodb+srv://');
    expect((error as Error).message).not.toContain('/talkshop-dev');
    expect(connection.dropDatabase).not.toHaveBeenCalled();
  });

  it('dropTestDb applies the same guard to the connection taken from the app', async () => {
    const connection = fakeConnection('talkshop-dev', '127.0.0.1');
    const app = { get: jest.fn().mockReturnValue(connection) } as unknown as INestApplication;
    await expect(dropTestDb(app)).rejects.toThrow('Refusing to drop');
    expect(connection.dropDatabase).not.toHaveBeenCalled();
  });
});
