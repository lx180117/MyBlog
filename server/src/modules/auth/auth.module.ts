import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './jwt.strategy';

/**
 * 说明：JwtModule 这里不注册全局密钥。
 * 本项目用**双密钥**（access / refresh 各一把），签发与校验都在调用点显式传
 * secret。若在这里 register 一个默认密钥，很容易出现「某处忘了传 secret，
 * 结果用默认密钥签出来」的错误 —— 那种 bug 不会报错，只会静默降低安全性。
 */
@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, JwtStrategy],
  // 导出 JwtModule：全局的 JwtAuthGuard 注册在 AppModule，
  // 它需要注入 JwtService 来对公开接口做「可选认证」的 token 解析
  exports: [AuthService, PasswordService, JwtModule],
})
export class AuthModule {}
