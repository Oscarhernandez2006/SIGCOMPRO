import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ChatService } from './chat.service';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { CrearGrupoDto } from './dto/crear-grupo.dto';
import { ActualizarGrupoDto } from './dto/actualizar-grupo.dto';
import { EnviarMensajeGrupoDto } from './dto/enviar-mensaje-grupo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';

type ReqAuth = Request & { user?: JwtPayload };

/** Mensajería interna: cualquier usuario autenticado puede chatear con cualquier otro. */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('contactos')
  contactos(@Req() req: ReqAuth) {
    return this.chat.contactos(req.user!.sub);
  }

  @Get('no-leidos')
  async noLeidos(@Req() req: ReqAuth) {
    const total = await this.chat.noLeidosTotal(req.user!.sub);
    return { total };
  }

  @Get('mensajes/:otroId')
  historial(
    @Param('otroId') otroId: string,
    @Query('desde') desde: string | undefined,
    @Req() req: ReqAuth,
  ) {
    return this.chat.historial(req.user!.sub, otroId, desde);
  }

  @Post('mensajes')
  enviar(@Body() dto: EnviarMensajeDto, @Req() req: ReqAuth) {
    const adjunto =
      dto.adjuntoData && dto.adjuntoMime && dto.adjuntoTipo
        ? {
            data: dto.adjuntoData,
            mime: dto.adjuntoMime,
            nombre: dto.adjuntoNombre ?? 'archivo',
            tipo: dto.adjuntoTipo,
          }
        : null;
    return this.chat.enviar(
      req.user!.sub,
      dto.destinatarioId,
      dto.contenido,
      dto.respondeAId,
      adjunto,
    );
  }

  // ---- Grupos ----

  @Get('grupos')
  grupos(@Req() req: ReqAuth) {
    return this.chat.gruposDe(req.user!.sub);
  }

  @Post('grupos')
  crearGrupo(@Body() dto: CrearGrupoDto, @Req() req: ReqAuth) {
    return this.chat.crearGrupo(req.user!.sub, dto.nombre, dto.imagen, dto.miembros);
  }

  @Get('grupos/:grupoId')
  grupoDetalle(@Param('grupoId') grupoId: string, @Req() req: ReqAuth) {
    return this.chat.grupoDetalle(req.user!.sub, grupoId);
  }

  @Put('grupos/:grupoId')
  actualizarGrupo(
    @Param('grupoId') grupoId: string,
    @Body() dto: ActualizarGrupoDto,
    @Req() req: ReqAuth,
  ) {
    return this.chat.actualizarGrupo(req.user!.sub, grupoId, dto);
  }

  @Get('grupos/:grupoId/mensajes')
  historialGrupo(
    @Param('grupoId') grupoId: string,
    @Query('desde') desde: string | undefined,
    @Req() req: ReqAuth,
  ) {
    return this.chat.historialGrupo(req.user!.sub, grupoId, desde);
  }

  @Post('grupos/:grupoId/mensajes')
  enviarGrupo(
    @Param('grupoId') grupoId: string,
    @Body() dto: EnviarMensajeGrupoDto,
    @Req() req: ReqAuth,
  ) {
    const adjunto =
      dto.adjuntoData && dto.adjuntoMime && dto.adjuntoTipo
        ? {
            data: dto.adjuntoData,
            mime: dto.adjuntoMime,
            nombre: dto.adjuntoNombre ?? 'archivo',
            tipo: dto.adjuntoTipo,
          }
        : null;
    return this.chat.enviarGrupo(req.user!.sub, grupoId, dto.contenido, dto.respondeAId, adjunto);
  }
}
