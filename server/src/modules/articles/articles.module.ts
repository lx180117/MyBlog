import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { AdminArticlesController, MeArticlesController } from './articles-manage.controller';

@Module({
  controllers: [ArticlesController, MeArticlesController, AdminArticlesController],
  providers: [ArticlesService],
  // 其他模块（如 stats、作者主页）需要复用文章查询与计数
  exports: [ArticlesService],
})
export class ArticlesModule {}
