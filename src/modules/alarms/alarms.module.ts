import { Module } from '@nestjs/common';
import { AlarmsController } from './alarms.controller';
import { AlarmsService } from './alarms.service';
import { CctvCaptureService } from './cctv-capture.service';

@Module({
  controllers: [AlarmsController],
  providers: [AlarmsService, CctvCaptureService],
})
export class AlarmsModule {}
