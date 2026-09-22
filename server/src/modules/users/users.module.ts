import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { AdminUsersController, AuthorsController } from './users.controller';
import { AuthModule } from '../auth/auth.module';
import { ArticlesModule } from '../articles/articles.module';

@Module({
  imports: [AuthModule, ArticlesModule],
  controllers: [AuthorsController, AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
