import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import type { AuthUser } from '../common/types/auth-user';
import { CartService } from './cart.service';
import type { CartView } from './cart.types';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

// Every route needs a valid token. The cart owner is always the user from the JWT:
// there is no userId in paths, query or body, so nobody can reach another user's cart.
@ApiTags('cart')
@Auth()
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get my cart (an empty cart if there is none)' })
  @ApiOkResponse({ type: CartResponseDto })
  getCart(@CurrentUser() user: AuthUser): Promise<CartView> {
    return this.cartService.getCart(user.userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add a product to the cart (quantities are summed)' })
  @ApiCreatedResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'Not enough stock, or the cart has 50 lines' })
  addItem(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto): Promise<CartView> {
    return this.cartService.addItem(user.userId, dto.productId, dto.quantity);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Set the quantity of a line' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid id or input' })
  @ApiNotFoundResponse({ description: 'Line not in the cart, or the product no longer exists' })
  @ApiConflictResponse({ description: 'Not enough stock' })
  setQuantity(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseObjectIdPipe) productId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartView> {
    return this.cartService.setQuantity(user.userId, productId, dto.quantity);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove a line (also works for deleted products)' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid id' })
  @ApiNotFoundResponse({ description: 'Line not in the cart' })
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseObjectIdPipe) productId: string,
  ): Promise<CartView> {
    return this.cartService.removeItem(user.userId, productId);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Empty the cart' })
  @ApiNoContentResponse({ description: 'Cart is empty now' })
  clear(@CurrentUser() user: AuthUser): Promise<void> {
    return this.cartService.clear(user.userId);
  }
}
