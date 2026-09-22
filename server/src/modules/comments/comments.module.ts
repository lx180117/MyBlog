import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import {
  AdminCommentsController,
  ArticleCommentsController,
  MeCommentsController,
} from './comments.controller';

@Module({
  controllers: [ArticleCommentsController, AdminCommentsController, MeCommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
