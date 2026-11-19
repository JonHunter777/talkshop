import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../common/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { Paginated } from '../common/dto/paginated-response';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import type { AuthUser } from '../common/types/auth-user';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  CheckoutConflictDto,
  OrderResponseDto,
  PaginatedOrdersDto,
} from './dto/order-response.dto';
import { OrdersService } from './orders.service';
import type { AdminOrderView, OrderView } from './orders.types';

// Every route needs a valid token and works only with the orders of the user from the JWT.
// (The admin routes `GET /orders/all` and `PATCH /orders/:id/status` come in step 8;
// `all` must be declared BEFORE `:id`.)
@ApiTags('orders')
@Auth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Place an order from my cart' })
  @ApiCreatedResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input, or the cart is empty' })
  @ApiConflictResponse({
    description: 'Some lines cannot be ordered (not enough stock or product deleted)',
    type: CheckoutConflictDto,
  })
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto): Promise<OrderView> {
    return this.ordersService.checkout(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my orders, newest first' })
  @ApiOkResponse({ type: PaginatedOrdersDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  findMine(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<OrderView>> {
    return this.ordersService.findMine(user.userId, query);
  }

  // `all` and `all/:id` are declared BEFORE `:id` on purpose: `GET /orders/all` must not be
  // read as the id "all" (that would be 400 from ParseObjectIdPipe). Admin only: the class-level
  // @Auth() runs the guards, @Roles('admin') makes RolesGuard confirm the role in the database.
  @Get('all')
  @Roles('admin')
  @ApiForbiddenResponse({ description: 'Requires role: admin' })
  @ApiOperation({ summary: 'List the orders of all users, newest first (admin)' })
  @ApiOkResponse({ type: PaginatedOrdersDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  findAll(@Query() query: AdminOrderQueryDto): Promise<Paginated<AdminOrderView>> {
    return this.ordersService.findAll(query);
  }

  @Get('all/:id')
  @Roles('admin')
  @ApiForbiddenResponse({ description: 'Requires role: admin' })
  @ApiOperation({ summary: 'Get any order with its owner (admin)' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid id' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  findAnyById(@Param('id', ParseObjectIdPipe) id: string): Promise<AdminOrderView> {
    return this.ordersService.findAnyById(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my orders (also for an admin: only own orders)' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid id' })
  @ApiNotFoundResponse({ description: 'Order not found (or it belongs to someone else)' })
  findMineById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<OrderView> {
    return this.ordersService.findMineById(user.userId, id);
  }
}
