import { Module } from '@nestjs/common';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';

@Module({
  controllers: [GmailController],
  providers: [GmailService],
})
export class GmailModule {}
