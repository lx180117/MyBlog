import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AdminSettingsController, PublicSettingsController } from './settings.controller';

/**
 * 声明为 @Global：评论、注册、列表分页等模块都要读配置。
 * 让每个模块都 imports: [SettingsModule] 只是噪音，而这个模块没有任何副作用。
 */
@Global()
@Module({
  controllers: [PublicSettingsController, AdminSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
