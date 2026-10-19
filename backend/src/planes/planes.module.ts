import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PedidosModule } from '../pedidos/pedidos.module';
import { PlanesController } from './planes.controller';
import { PlanesAvisoController } from './planes-aviso.controller';

@Module({
  imports: [
    PedidosModule,
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
  controllers: [PlanesController, PlanesAvisoController],
})
export class PlanesModule {}
