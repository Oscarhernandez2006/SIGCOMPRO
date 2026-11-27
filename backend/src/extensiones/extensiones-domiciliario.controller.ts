import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ExtensionesService } from './extensiones.service';
import { SharedSecretGuard } from '../provisioning/guards/shared-secret.guard';

/**
 * API server-to-server para Mi Variable Liquidación (cabecera X-SSO-Secret).
 * GET /api/externo/extensiones/domiciliario?documento=
 * Extensiones recientes del domiciliario en todos sus estados.
 */
@Controller('externo/extensiones/domiciliario')
@UseGuards(SharedSecretGuard)
export class ExtensionesDomiciliarioController {
  constructor(private readonly ext: ExtensionesService) {}

  @Get()
  listar(@Query('documento') documento?: string) {
    return this.ext.listarDomiciliario(documento ?? '');
  }
}
