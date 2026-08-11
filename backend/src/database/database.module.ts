import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const pool = new Pool({
          host: config.get<string>('DB_HOST'),
          port: Number(config.get<string>('DB_PORT', '5432')),
          user: config.get<string>('DB_USER'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
          ssl:
            config.get<string>('DB_SSL') === 'true'
              ? { rejectUnauthorized: false }
              : false,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 15000,
          // Ninguna consulta debe colgar una conexión indefinidamente: si una
          // tarda más de 30s se aborta (server-side) y la conexión vuelve al
          // pool (evita que consultas lentas agoten el pool y todo dé 500).
          statement_timeout: 30000,
          keepAlive: true,
        });
        // Sin este manejador, un error en un cliente OCIOSO del pool (p. ej.
        // ECONNRESET si la BD o la red cortan la conexión) emite un evento
        // 'error' sin listeners y TUMBA el proceso. Aquí solo se registra: el
        // pool descarta ese cliente y crea uno nuevo en la próxima consulta.
        const logger = new Logger('PgPool');
        pool.on('error', (err) => {
          logger.error(`Error en cliente ocioso del pool: ${err.message}`);
        });
        return pool;
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}

