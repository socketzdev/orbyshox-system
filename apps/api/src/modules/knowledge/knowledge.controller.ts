import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
// import { RolesGuard } from '../../common/guards/roles.guard';
// import { Roles } from '../../common/decorators/roles.decorator';

@Controller('knowledge')
// @UseGuards(RolesGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  async listArticles(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('isPublished') isPublished?: string,
    @Query('published') published?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const raw = isPublished ?? published;
    const isPublishedBool = raw !== undefined ? raw === 'true' : undefined;
    return this.knowledgeService.listArticles({ search, category, isPublished: isPublishedBool, page, limit });
  }

  @Get('categories')
  async listCategories() {
    return this.knowledgeService.listCategories();
  }

  @Get(':id')
  async getArticle(@Param('id') id: string) {
    return this.knowledgeService.getArticle(id);
  }

  @Post()
  // @Roles('SUPER_ADMIN', 'SUPPORT_MANAGER')
  async createArticle(@Body() data: any) {
    return this.knowledgeService.createArticle(data);
  }

  @Patch(':id')
  // @Roles('SUPER_ADMIN', 'SUPPORT_MANAGER')
  async updateArticle(@Param('id') id: string, @Body() data: any) {
    return this.knowledgeService.updateArticle(id, data);
  }

  @Delete(':id')
  // @Roles('SUPER_ADMIN', 'SUPPORT_MANAGER')
  async deleteArticle(@Param('id') id: string) {
    return this.knowledgeService.deleteArticle(id);
  }
}
