import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { ClientesModule } from './clientes/clientes.module';
import { UbicacionesModule } from './ubicaciones/ubicaciones.module';
import { PuntosVentaModule } from './puntos-venta/puntos-venta.module';
import { ProductosModule } from './productos/productos.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { CongeladosModule } from './congelados/congelados.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { MotivosModule } from './motivos/motivos.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    ClientesModule,
    UbicacionesModule,
    PuntosVentaModule,
    ProductosModule,
    PedidosModule,
    CongeladosModule,
    ConfiguracionModule,
    MotivosModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
