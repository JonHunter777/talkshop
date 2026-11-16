import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  const buildContext = (
    controller: new () => object,
    handler: () => void,
    role?: Role,
  ): ExecutionContext => {
    const request = { user: role ? { userId: '507f1f77bcf86cd799439011', role } : undefined };
    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request as AuthenticatedRequest }),
    } as unknown as ExecutionContext;
  };

  describe('route without @Roles', () => {
    it.each<Role>(['customer', 'admin'])('allows the %s role', (role) => {
      const context = buildContext(OpenController, handlerOf(OpenController, 'anyRole'), role);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('route with @Roles("admin")', () => {
    const handler = handlerOf(AdminMethodController, 'adminOnly');

    it('allows an admin', () => {
      const context = buildContext(AdminMethodController, handler, 'admin');

      expect(guard.canActivate(context)).toBe(true);
    });

    it('throws ForbiddenException("Forbidden resource") for a customer', () => {
      const context = buildContext(AdminMethodController, handler, 'customer');

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Forbidden resource'),
      );
    });

    it('throws ForbiddenException when request.user is missing', () => {
      const context = buildContext(AdminMethodController, handler);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('class-level and method-level metadata', () => {
    it('uses the class-level roles when the method has none', () => {
      const handler = handlerOf(AdminOnlyController, 'inherited');

      expect(() =>
        guard.canActivate(buildContext(AdminOnlyController, handler, 'customer')),
      ).toThrow(ForbiddenException);
      expect(guard.canActivate(buildContext(AdminOnlyController, handler, 'admin'))).toBe(true);
    });

    it('lets the method-level roles override the class-level roles', () => {
      const handler = handlerOf(AdminOnlyController, 'overridden');

      // Class says admin, method says customer: the method wins
      expect(guard.canActivate(buildContext(AdminOnlyController, handler, 'customer'))).toBe(true);
      expect(() => guard.canActivate(buildContext(AdminOnlyController, handler, 'admin'))).toThrow(
        ForbiddenException,
      );
    });
  });
});
