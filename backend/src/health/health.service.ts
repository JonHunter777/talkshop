import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  // readyState 1 = connected; the ping proves the server really answers.
  async isDbUp(): Promise<boolean> {
    if (this.connection.readyState !== ConnectionStates.connected || !this.connection.db) {
      return false;
    }
    try {
      await this.connection.db.admin().ping();
      return true;
    } catch {
      // Any ping failure simply means "down"; details must not leak to clients.
      return false;
    }
  }
}
