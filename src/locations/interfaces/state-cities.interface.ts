import { ApiProperty } from '@nestjs/swagger';
import { BrazilState } from '../../common/brazil-state.enum';

export class StateCities {
  @ApiProperty({ enum: BrazilState, example: BrazilState.SP })
  state: BrazilState;

  @ApiProperty({ example: 'São Paulo' })
  stateName: string;

  @ApiProperty({ type: [String], example: ['Campinas', 'São Paulo'] })
  cities: string[];
}
