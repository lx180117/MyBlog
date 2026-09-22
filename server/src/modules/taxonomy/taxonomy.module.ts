import { Module } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';
import {
  AdminCategoriesController,
  AdminTagsController,
  CategoriesController,
  TagsController,
} from './taxonomy.controller';

@Module({
  controllers: [
    CategoriesController,
    TagsController,
    AdminCategoriesController,
    AdminTagsController,
  ],
  providers: [TaxonomyService],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
