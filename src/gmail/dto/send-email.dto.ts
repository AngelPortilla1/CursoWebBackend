import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SendEmailDto {
  @IsEmail()
  @IsString()
  to: string;

  @IsString()
  subject: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  snippet?: string;
}
