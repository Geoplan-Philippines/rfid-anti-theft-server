import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDTO } from '../../../common/dto/pagination-query.dto';

export class ListTransactionsQueryDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  storeCode?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
