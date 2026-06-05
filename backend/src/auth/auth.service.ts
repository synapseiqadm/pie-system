import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(email: string, password: string): Promise<{ access_token: string }> {
    const expectedEmail = process.env.APP_LOGIN_EMAIL;
    const expectedPassword = process.env.APP_LOGIN_PASSWORD;

    if (!expectedEmail || !expectedPassword) {
      throw new UnauthorizedException('Credenciais não configuradas no servidor');
    }

    if (email !== expectedEmail || password !== expectedPassword) {
      throw new UnauthorizedException('Email ou senha incorretos');
    }

    const payload = { sub: 'admin', email };
    return { access_token: this.jwtService.sign(payload) };
  }
}
