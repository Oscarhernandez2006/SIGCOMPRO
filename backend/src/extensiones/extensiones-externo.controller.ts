import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ExtensionesService } from './extensiones.service';
import { ExtensionesApiKeyGuard } from './extensiones-api-key.guard';

/**
 * API externa (server-to-server) del reporte de extensiones.
 * GET /api/externo/extensiones?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&puntoId=
 * Cabecera: X-API-Key: <EXTENSIONES_API_KEY>
 */
@Controller('externo/extensiones')
@UseGuards(ExtensionesApiKeyGuard)
export class ExtensionesExternoController {
  constructor(private readonly ext: ExtensionesService) {}

  @Get()
  reporte(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('puntoId') puntoId?: string,
  ) {
    return this.ext.reporteExterno({ desde, hasta, puntoId });
  }
}
