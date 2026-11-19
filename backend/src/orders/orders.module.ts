import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CartModule } from '../cart/cart.module';
import { ProductsModule } from '../products/products.module';
import { ORDER_NUMBER_GENERATOR, generateOrderNumber } from './order-number';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    // orders -> cart, products: foreign models are reached only through their services
    CartModule,
    ProductsModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    // A provider (not a direct import) so a test can replace the generator
    { provide: ORDER_NUMBER_GENERATOR, useValue: () => generateOrderNumber() },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
