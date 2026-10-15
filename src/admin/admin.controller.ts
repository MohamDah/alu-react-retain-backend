import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import { Role } from '../generated/prisma/client.js';
import { AdminService } from './admin.service.js';

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('insights')
  insights() {
    return this.admin.insights();
  }
}
