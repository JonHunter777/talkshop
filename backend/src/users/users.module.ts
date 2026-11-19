import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';

// Global, like JwtModule: RolesGuard (used by @Auth('admin') in many modules) needs
// UsersService to check the current role in the database, and it is created in the module
// of each controller, so the service must be visible everywhere.
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersService],
  // Only the service is exported: other modules never touch the model directly
  exports: [UsersService],
})
export class UsersModule {}
