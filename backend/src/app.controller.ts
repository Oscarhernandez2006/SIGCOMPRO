import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return {
      service: 'Carnes Santacruz API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
