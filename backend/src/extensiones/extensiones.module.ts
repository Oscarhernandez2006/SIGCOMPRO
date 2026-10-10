import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExtensionesService } from './extensiones.service';
import { ExtensionesController } from './extensiones.controller';
import { ExtensionesExternoController } from './extensiones-externo.controller';
import { ExtensionesApiKeyGuard } from './extensiones-api-key.guard';

@Module({
  imports: [
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
  controllers: [ExtensionesController, ExtensionesExternoController],
  providers: [ExtensionesService, ExtensionesApiKeyGuard],
  exports: [ExtensionesService],
})
export class ExtensionesModule {}
