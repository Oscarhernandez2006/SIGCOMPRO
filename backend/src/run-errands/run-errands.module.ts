import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RunErrandsController } from './run-errands.controller';
import { RunErrandsService } from './run-errands.service';

@Module({
  imports: [UsersModule],
  controllers: [RunErrandsController],
  providers: [RunErrandsService],
  exports: [RunErrandsService],
})
export class RunErrandsModule {}
