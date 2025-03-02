import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { GmailModule } from './gmail/gmail.module';

@Module({
  imports: [ConfigModule.forRoot(), GmailModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
