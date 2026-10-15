import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { CredentialsDto } from './auth.dto.js';
import type { AuthenticatedUser } from './auth.decorators.js';
import { hashPassword, verifyPassword } from './password.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signup(dto: CredentialsDto) {
    const user = await this.prisma.user.create({
      data: { email: dto.email, password: await hashPassword(dto.password) },
      select: { id: true, email: true, role: true },
    });
    return this.issueToken(user);
  }

  async signin(dto: CredentialsDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await verifyPassword(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken({ id: user.id, email: user.email, role: user.role });
  }

  private async issueToken(user: AuthenticatedUser) {
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      tokenType: 'Bearer',
      expiresIn: 3600,
      user,
    };
  }
}
