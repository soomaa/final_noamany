import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** Normalizes errors while preserving intentional, structured HttpException details. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'حدث خطأ غير متوقع';
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        details = Object.fromEntries(
          Object.entries(body as Record<string, unknown>)
            .filter(([key]) => !['statusCode', 'message', 'error'].includes(key)),
        );
      }
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'القيمة مُسجّلة مسبقًا';
        this.logger.warn(`P2002 DEBUG target=${JSON.stringify(exception.meta)}`);
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'العنصر غير موجود';
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = 'خطأ في قاعدة البيانات';
        // Keep the client response intentionally generic, but retain Prisma's safe
        // diagnostic metadata in the server log so deployment/schema drift can be
        // identified without logging request bodies or customer data.
        this.logger.warn(
          `${exception.code} meta=${JSON.stringify(exception.meta ?? {})}`,
        );
      }
    }

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ statusCode: status, message, ...details });
  }
}
