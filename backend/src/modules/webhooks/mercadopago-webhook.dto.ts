import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class MercadoPagoDataDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class MercadoPagoWebhookPayloadDto {
  @Transform(({ value }) => (value === null || value === undefined ? value : String(value)))
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsBoolean()
  @IsNotEmpty()
  live_mode: boolean;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  date_created: string;

  @IsInt()
  @IsNotEmpty()
  user_id: number;

  @IsString()
  @IsNotEmpty()
  api_version: string;

  @IsString()
  @IsNotEmpty()
  action: string;

  @ValidateNested()
  @Type(() => MercadoPagoDataDto)
  @IsNotEmpty()
  data: MercadoPagoDataDto;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  resource?: string;
}
