import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { GmailService } from './gmail.service';
import { SendEmailDto } from './dto/send-email.dto';

@Controller()
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  @Get('emails')
  findAll() {
    return this.gmailService.getAllEmails();
  }

  @Get('email/:id/html')
  findOneHtml(@Param('id') id: string) {
    return this.gmailService.getEmailHtml(id);
  }

  @Get('email/:id')
  findOne(@Param('id') id: string) {
    return this.gmailService.getEmailById(id);
  }

  @Post('send-email')
  sendEmail(@Body() emailData: SendEmailDto) {
    return this.gmailService.sendEmail(emailData);
  }

  @Delete('email/:id')
  deleteEmail(@Param('id') id: string) {
    return this.gmailService.deleteEmail(id);
  }
}
