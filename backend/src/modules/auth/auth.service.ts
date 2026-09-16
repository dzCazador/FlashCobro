import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SECRET = 'flashcobro-dev-secret-cambiar';

export const AUTH_COOKIE_NAME = 'flashcobro_session';

type CookieOptions = {
  httpOnly: boolean;
  sameSite: 'strict';
  secure: boolean;
  path: string;
  maxAge: number;
};

@Injectable()
export class AuthService {
  private readonly secret = process.env.AUTH_SECRET ?? DEFAULT_SECRET;

  validateCredentials(username: string, password: string): boolean {
    const expectedUser = process.env.AUTH_USER ?? 'admin';
    const expectedPass = process.env.AUTH_PASSWORD ?? 'admin123';
    return username === expectedUser && password === expectedPass;
  }

  createSessionToken(): string {
    const ts = Date.now();
    return `${ts}.${this.sign(ts)}`;
  }

  verifySessionToken(token: string | undefined): boolean {
    if (!token) {
      return false;
    }

    const separatorIndex = token.indexOf('.');
    if (separatorIndex <= 0) {
      return false;
    }

    const ts = Number(token.slice(0, separatorIndex));
    const provided = token.slice(separatorIndex + 1);

    if (!Number.isFinite(ts)) {
      return false;
    }

    if (ts > Date.now() + 60_000 || Date.now() - ts > SESSION_TTL_MS) {
      return false;
    }

    const expected = this.sign(ts);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(provided, 'hex');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_MS,
    };
  }

  private sign(ts: number): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(`flashcobro:${ts}`)
      .digest('hex');
  }
}

export function readCookie(
  req: { headers: { cookie?: string } },
  name: string,
): string | undefined {
  const header = req.headers.cookie;
  if (typeof header !== 'string' || !header) {
    return undefined;
  }

  for (const pair of header.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex > 0 && pair.slice(0, separatorIndex).trim() === name) {
      return decodeURIComponent(pair.slice(separatorIndex + 1).trim());
    }
  }

  return undefined;
}