import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDTO } from '../../../common/dto/pagination-query.dto';

export class ListKnownEpcsQueryDto extends PaginationQueryDTO {
  @IsOptional()
  @IsString()
  search?: string;
}
