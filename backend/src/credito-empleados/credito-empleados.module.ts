import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { CreditoEmpleadosController } from './credito-empleados.controller';
import { CreditoEmpleadosService } from './credito-empleados.service';
import { CreditoEmpleadosCarteraClient } from './credito-empleados.cartera.client';

@Module({
  imports: [
    UsersModule,
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
  controllers: [CreditoEmpleadosController],
  providers: [CreditoEmpleadosService, CreditoEmpleadosCarteraClient],
  exports: [CreditoEmpleadosService],
})
export class CreditoEmpleadosModule {}
