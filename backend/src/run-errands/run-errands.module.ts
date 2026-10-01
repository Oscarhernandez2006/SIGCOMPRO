import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { RunErrandsController } from './run-errands.controller';
import { RunErrandsService } from './run-errands.service';

@Module({
  imports: [
    UsersModule,
    // JwtAuthGuard necesita JwtService -- sin este import el modulo no
    // resuelve sus dependencias y Nest ni siquiera arranca (tumba TODO el
    // backend, no solo Run Errands).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '1d'),
        },
      }),
    }),
  ],
  controllers: [RunErrandsController],
  providers: [RunErrandsService],
  exports: [RunErrandsService],
})
export class RunErrandsModule {}
