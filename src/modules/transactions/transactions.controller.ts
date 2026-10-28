import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { CreateTransactionDTO } from './dto/create-transaction.dto';
import { ListTransactionsQueryDTO } from './dto/list-transactions-query.dto';
import {
  TransactionsService,
  type RecordedTransaction,
  type TransactionDetail,
  type TransactionSummary,
} from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // TODO: replace this open route with a per-device key once the widget and the gate bridge can log in.
  @Post()
  async recordTransaction(
    @Body() body: CreateTransactionDTO,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RecordedTransaction> {
    const recorded = await this.transactionsService.recordTransaction(body);
    response.status(recorded.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return recorded.result;
  }

  @Get()
  @UseGuards(PassportJwtGuard)
  async getTransactions(
    @Query() query: ListTransactionsQueryDTO,
  ): Promise<PaginatedResponse<TransactionSummary>> {
    return this.transactionsService.getTransactions(query);
  }

  @Get(':id')
  @UseGuards(PassportJwtGuard)
  async getTransaction(@Param('id', ParseUUIDPipe) id: string): Promise<TransactionDetail> {
    return this.transactionsService.getTransaction(id);
  }
}
