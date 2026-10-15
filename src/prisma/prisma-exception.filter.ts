import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const errors: Record<string, { status: number; message: string }> = {
      P2002: {
        status: HttpStatus.CONFLICT,
        message: 'A record with these unique fields already exists',
      },
      P2003: {
        status: HttpStatus.CONFLICT,
        message: 'A related record is missing or still in use',
      },
      P2025: { status: HttpStatus.NOT_FOUND, message: 'Record not found' },
      P2034: {
        status: HttpStatus.CONFLICT,
        message: 'Concurrent change detected; retry the request',
      },
    };
    const error = errors[exception.code] ?? {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Database operation failed',
    };
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(error.status)
      .json({ statusCode: error.status, message: error.message });
  }
}
