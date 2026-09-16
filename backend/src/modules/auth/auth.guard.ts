import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AUTH_COOKIE_NAME,
  AuthService,
  readCookie,
} from './auth.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readCookie(request, AUTH_COOKIE_NAME);

    if (!this.authService.verifySessionToken(token)) {
      throw new UnauthorizedException('Sesión inválida. Inicie sesión.');
    }

    return true;
  }
}