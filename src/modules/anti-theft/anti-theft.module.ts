import { Module } from '@nestjs/common';
import { AntiTheftService } from './anti-theft.service';
import { AntiTheftController } from './anti-theft.controller';

@Module({
  controllers: [AntiTheftController],
  providers: [AntiTheftService],
})
export class AntiTheftModule {}
