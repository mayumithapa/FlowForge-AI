import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  workspaceId?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; fullName: string | null };
  workspace: { id: string; name: string; slug: string } | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtl = parseInt(process.env.JWT_ACCESS_TTL || '900', 10);
  private readonly refreshTtl = parseInt(process.env.JWT_REFRESH_TTL || '2592000', 10);

  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  // --------------------------------------------------------------------------
  // Register
  // --------------------------------------------------------------------------
  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const slug = this.makeSlug(dto.workspaceName || dto.fullName || email.split('@')[0]);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, fullName: dto.fullName ?? null },
      });
      const workspace = await tx.workspace.create({
        data: {
          name: dto.workspaceName || `${user.fullName || user.email}'s Workspace`,
          slug: `${slug}-${randomBytes(3).toString('hex')}`,
          ownerId: user.id,
          members: { create: { userId: user.id, role: 'OWNER' } },
        },
      });
      return { user, workspace };
    });

    return this.issueTokens(result.user.id, result.user.email, result.workspace.id, {
      user: { id: result.user.id, email: result.user.email, fullName: result.user.fullName },
      workspace: { id: result.workspace.id, name: result.workspace.name, slug: result.workspace.slug },
    });
  }

  // --------------------------------------------------------------------------
  // Login
  // --------------------------------------------------------------------------
  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { include: { workspace: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const workspace = user.memberships[0]?.workspace ?? null;
    return this.issueTokens(user.id, user.email, workspace?.id, {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
    });
  }

  // --------------------------------------------------------------------------
  // Refresh
  // --------------------------------------------------------------------------
  async refresh(refreshToken: string): Promise<AuthResult> {
    const hash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: { include: { memberships: { include: { workspace: true }, orderBy: { createdAt: 'asc' } } } } },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Rotate: revoke the old token, mint a new pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const user = stored.user;
    const workspace = user.memberships[0]?.workspace ?? null;
    return this.issueTokens(user.id, user.email, workspace?.id, {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
    });
  }

  // --------------------------------------------------------------------------
  // Logout
  // --------------------------------------------------------------------------
  async logout(refreshToken: string): Promise<void> {
    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken
      .updateMany({ where: { tokenHash: hash, revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------
  private async issueTokens(
    userId: string,
    email: string,
    workspaceId: string | undefined,
    extra: Omit<AuthResult, 'accessToken' | 'refreshToken' | 'expiresIn'>,
  ): Promise<AuthResult> {
    const payload: JwtPayload = { sub: userId, email, workspaceId };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: this.accessTtl,
    });
    const refreshToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.accessTtl, ...extra };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private makeSlug(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'workspace';
  }
}
