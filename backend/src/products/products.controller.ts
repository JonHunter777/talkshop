import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../common/decorators/auth.decorator';
import type { Paginated } from '../common/dto/paginated-response';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginatedProductsDto, ProductResponseDto } from './dto/product-response.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import type { ProductView } from './products.types';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products with filters, text search, sorting and pagination' })
  @ApiOkResponse({ type: PaginatedProductsDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  findAll(@Query() query: ProductQueryDto): Promise<Paginated<ProductView>> {
    return this.productsService.findAll(query);
  }

  // Declared before ':id' for readability; the paths differ in segment count, so they never clash
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a product by slug' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  findBySlug(@Param('slug') slug: string): Promise<ProductView> {
    return this.productsService.findBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by id' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid id' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  findOne(@Param('id', ParseObjectIdPipe) id: string): Promise<ProductView> {
    return this.productsService.findById(id);
  }

  @Post()
  @Auth('admin')
  @ApiOperation({ summary: 'Create a product (admin)' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: 'Slug already in use' })
  create(@Body() dto: CreateProductDto): Promise<ProductView> {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Auth('admin')
  @ApiOperation({ summary: 'Update a product (admin)' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid id or input, or nothing to update' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'Slug already in use' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductView> {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @Auth('admin')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a product (admin)' })
  @ApiNoContentResponse({ description: 'Product deleted' })
  @ApiBadRequestResponse({ description: 'Invalid id' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  remove(@Param('id', ParseObjectIdPipe) id: string): Promise<void> {
    return this.productsService.remove(id);
  }
}
