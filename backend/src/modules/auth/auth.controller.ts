import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  AuthService,
  readCookie,
} from './auth.service.js';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() body: { username?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ): { ok: boolean } {
    const username = body?.username ?? '';
    const password = body?.password ?? '';

    if (!this.authService.validateCredentials(username, password)) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    res.cookie(
      AUTH_COOKIE_NAME,
      this.authService.createSessionToken(),
      this.authService.cookieOptions(),
    );

    return { ok: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response): { ok: boolean } {
    res.clearCookie(AUTH_COOKIE_NAME, this.authService.cookieOptions());
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request): { authenticated: boolean } {
    const token = readCookie(req, AUTH_COOKIE_NAME);
    return { authenticated: this.authService.verifySessionToken(token) };
  }
}