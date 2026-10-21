import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AlmuerzosService } from './almuerzos.service';
import { AlmuerzosController } from './almuerzos.controller';
import { AlmuerzosExternoController } from './almuerzos-externo.controller';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { UsersModule } from '../users/users.module';
import { SharedSecretGuard } from '../provisioning/guards/shared-secret.guard';

@Module({
  imports: [
    ConfiguracionModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '1d') },
      }),
    }),
  ],
  controllers: [AlmuerzosController, AlmuerzosExternoController],
  providers: [AlmuerzosService, SharedSecretGuard],
})
export class AlmuerzosModule {}
