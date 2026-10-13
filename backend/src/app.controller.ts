import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      app: 'Noamany HR API',
      release: 'noamany-update-20261001-r1',
      ts: new Date().toISOString(),
    };
  }
}
