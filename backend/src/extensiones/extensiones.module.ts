import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExtensionesService } from './extensiones.service';
import { ExtensionesController } from './extensiones.controller';
import { ExtensionesExternoController } from './extensiones-externo.controller';
import { ExtensionesApiKeyGuard } from './extensiones-api-key.guard';
import { ExtensionesDomiciliarioController } from './extensiones-domiciliario.controller';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { SharedSecretGuard } from '../provisioning/guards/shared-secret.guard';

@Module({
  imports: [
    ConfiguracionModule,
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
  controllers: [ExtensionesController, ExtensionesExternoController, ExtensionesDomiciliarioController],
  providers: [ExtensionesService, ExtensionesApiKeyGuard, SharedSecretGuard],
  exports: [ExtensionesService],
})
export class ExtensionesModule {}
