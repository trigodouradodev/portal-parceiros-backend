import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class PostalCodeParamsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, {
    message: 'zipCode deve ser um CEP válido.',
  })
  zipCode: string;
}
