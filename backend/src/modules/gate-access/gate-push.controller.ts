import { Body, Controller, Get, Header, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { GatePushService } from './gate-push.service';

type PushQuery = Record<string, string | undefined>;

/**
 * Where a controller in ZKBio's "HTTP" communication mode calls home. The paths are fixed
 * by the device firmware, so this sits outside the /api prefix (see main.ts). Replies are
 * plain text; some firmwares append `.aspx` to every path.
 */
@Public()
@Controller('iclock')
export class GatePushController {
  constructor(private readonly push: GatePushService) {}

  /**
   * Apache proxies from loopback, so the peer address is always 127.0.0.1 there; only
   * then is X-Forwarded-For trusted. A direct connection keeps its real address.
   */
  private sourceIp(req: Request): string {
    const peer = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if ((peer === '127.0.0.1' || peer === '::1') && first) return first.replace(/^::ffff:/, '');
    return peer;
  }

  private text(body: unknown): string {
    return typeof body === 'string' ? body : '';
  }

  @Get(['cdata', 'cdata.aspx'])
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async getData(@Query() query: PushQuery, @Req() req: Request) {
    const ip = this.sourceIp(req);
    const controller = await this.push.authenticate(query.SN, ip);
    if (this.push.isHandshake(query)) return this.push.handshake(controller, ip, query.pushver);
    return this.push.getRequest(controller, ip);
  }

  @Post(['cdata', 'cdata.aspx'])
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async postData(@Query() query: PushQuery, @Body() body: unknown, @Req() req: Request) {
    const ip = this.sourceIp(req);
    const controller = await this.push.authenticate(query.SN, ip);
    const table = (query.table ?? '').toLowerCase();
    if (table === 'rtlog') return this.push.realtimeLog(controller, ip, this.text(body));
    return this.push.otherData(controller, ip, table || undefined, this.text(body));
  }

  @Post(['registry', 'registry.aspx'])
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async registry(@Query() query: PushQuery, @Body() body: unknown, @Req() req: Request) {
    const ip = this.sourceIp(req);
    const controller = await this.push.authenticate(query.SN, ip);
    return this.push.registry(controller, ip, this.text(body));
  }

  /**
   * Configuration download that follows registration.
   * INBIO firmware (push 3.0.1) sends it as a GET; answering only POST left the controller
   * re-registering every ten seconds without ever polling for commands or posting scans.
   */
  @Get(['push', 'push.aspx'])
  @Post(['push', 'push.aspx'])
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async pushConfig(@Query() query: PushQuery, @Req() req: Request) {
    const ip = this.sourceIp(req);
    const controller = await this.push.authenticate(query.SN, ip);
    return this.push.config(controller, ip);
  }

  @Get(['getrequest', 'getrequest.aspx'])
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async getRequest(@Query() query: PushQuery, @Req() req: Request) {
    const ip = this.sourceIp(req);
    const controller = await this.push.authenticate(query.SN, ip);
    return this.push.getRequest(controller, ip);
  }

  @Post(['devicecmd', 'devicecmd.aspx'])
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async deviceCmd(@Query() query: PushQuery, @Body() body: unknown, @Req() req: Request) {
    const ip = this.sourceIp(req);
    const controller = await this.push.authenticate(query.SN, ip);
    return this.push.commandResults(controller, ip, this.text(body));
  }

  @Get(['ping', 'ping.aspx'])
  @Header('Content-Type', 'text/plain; charset=utf-8')
  ping() {
    return 'OK';
  }

  @Get(['rtdata', 'rtdata.aspx'])
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async realtimeData(@Query() query: PushQuery, @Req() req: Request) {
    const ip = this.sourceIp(req);
    const controller = await this.push.authenticate(query.SN, ip);
    return query.type === 'time' ? this.push.deviceTime(controller, ip) : 'OK';
  }
}
