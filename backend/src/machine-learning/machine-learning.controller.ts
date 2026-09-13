import {
  BadRequestException,
  Controller,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { MachineLearningService } from './machine-learning.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/** Herramienta de administrador: solo roles con acceso total. */
@Controller('machine-learning')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador app', 'desarrollador', 'administrador', 'gerente', 'gerencia')
export class MachineLearningController {
  constructor(private readonly ml: MachineLearningService) {}

  /** Recibe el Excel, normaliza las direcciones y devuelve el mismo Excel corregido. */
  @Post('normalizar-direcciones')
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: 30 * 1024 * 1024 } }),
  )
  normalizar(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Res() res: Response,
  ) {
    if (!archivo) {
      throw new BadRequestException(
        'Adjunta el archivo Excel en el campo "archivo".',
      );
    }
    const { filename, buffer, filas } = this.ml.procesarDirecciones(
      archivo.buffer,
      archivo.originalname,
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'X-Filas-Procesadas': String(filas),
      'Access-Control-Expose-Headers': 'Content-Disposition, X-Filas-Procesadas',
    });
    res.end(buffer);
  }
}
