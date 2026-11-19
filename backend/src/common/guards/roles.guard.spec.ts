import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UsersService } from '../../users/users.service';
import type { Role } from '../constants/roles';
import { Roles } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { RolesGuard } from './roles.guard';

// Dummy controllers: the decorators put real metadata on them, the Reflector reads it
class OpenController {
  anyRole(): void {}
}

class AdminOnlyController {
  inherited(): void {}

  @Roles('customer')
  overridden(): void {}
}
Roles('admin')(AdminOnlyController);

class AdminMethodController {
  @Roles('admin')
  adminOnly(): void {}
}

// Reads a method by name (avoids the unbound-method lint rule on `Class.prototype.method`)
const handlerOf = (controller: new () => object, name: string): (() => void) =>
  Reflect.get(controller.prototype as object, name) as () => void;

const USER_ID = '507f1f77bcf86cd799439011';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let findRoleById: jest.Mock<Promise<Role | null>, [string]>;

  beforeEach(() => {
    findRoleById = jest.fn<Promise<Role | null>, [string]>();
    const usersService = { findRoleById } as unknown as UsersService;
    guard = new RolesGuard(new Reflector(), usersService);
  });

  // `tokenRole` is the role claimed in the JWT; the role in the database is set per test
  const buildContext = (
    controller: new () => object,
    handler: () => void,
    tokenRole?: Role,
  ): { context: ExecutionContext; request: { user?: { userId: string; role: Role } } } => {
    const request = { user: tokenRole ? { userId: USER_ID, role: tokenRole } : undefined };
    const context = {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request as AuthenticatedRequest }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  describe('route without @Roles', () => {
    it.each<Role>(['customer', 'admin'])(
      'allows the %s role and does NOT read the database',
      async (role) => {
        const { context } = buildContext(
          OpenController,
          handlerOf(OpenController, 'anyRole'),
          role,
        );

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(findRoleById).not.toHaveBeenCalled();
      },
    );
  });

  describe('route with @Roles("admin")', () => {
    const handler = handlerOf(AdminMethodController, 'adminOnly');

    it('allows a token admin who is still an admin in the database', async () => {
      findRoleById.mockResolvedValue('admin');
      const { context } = buildContext(AdminMethodController, handler, 'admin');

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(findRoleById).toHaveBeenCalledWith(USER_ID);
    });

    it('throws ForbiddenException for a token admin who was demoted in the database', async () => {
      findRoleById.mockResolvedValue('customer');
      const { context } = buildContext(AdminMethodController, handler, 'admin');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new ForbiddenException('Forbidden resource'),
      );
    });

    it('throws UnauthorizedException when the user no longer exists (deleted)', async () => {
      findRoleById.mockResolvedValue(null);
      const { context } = buildContext(AdminMethodController, handler, 'admin');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Unauthorized'),
      );
    });

    it('throws ForbiddenException for a token customer WITHOUT reading the database', async () => {
      const { context } = buildContext(AdminMethodController, handler, 'customer');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new ForbiddenException('Forbidden resource'),
      );
      expect(findRoleById).not.toHaveBeenCalled();
    });

    it('does not let a customer in even if the database says admin (the token must claim it)', async () => {
      findRoleById.mockResolvedValue('admin');
      const { context } = buildContext(AdminMethodController, handler, 'customer');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when request.user is missing', async () => {
      const { context } = buildContext(AdminMethodController, handler);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
      expect(findRoleById).not.toHaveBeenCalled();
    });

    it('fails closed: a database error is not swallowed and nobody is let in', async () => {
      findRoleById.mockRejectedValue(new Error('db is down'));
      const { context } = buildContext(AdminMethodController, handler, 'admin');

      await expect(guard.canActivate(context)).rejects.toThrow('db is down');
    });

    it('puts the role from the database into request.user', async () => {
      findRoleById.mockResolvedValue('admin');
      const { context, request } = buildContext(AdminMethodController, handler, 'admin');

      await guard.canActivate(context);

      expect(request.user).toEqual({ userId: USER_ID, role: 'admin' });
    });
  });

  describe('class-level and method-level metadata', () => {
    it('uses the class-level roles when the method has none', async () => {
      const handler = handlerOf(AdminOnlyController, 'inherited');
      findRoleById.mockResolvedValue('admin');

      await expect(
        guard.canActivate(buildContext(AdminOnlyController, handler, 'customer').context),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        guard.canActivate(buildContext(AdminOnlyController, handler, 'admin').context),
      ).resolves.toBe(true);
    });

    it('lets the method-level roles override the class-level roles', async () => {
      const handler = handlerOf(AdminOnlyController, 'overridden');
      findRoleById.mockResolvedValue('customer');

      // Class says admin, method says customer: the method wins
      await expect(
        guard.canActivate(buildContext(AdminOnlyController, handler, 'customer').context),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(buildContext(AdminOnlyController, handler, 'admin').context),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
