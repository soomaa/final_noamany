import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateDashboardShortcutsDto {
  @IsArray()
  @ArrayMaxSize(250)
  @IsString({ each: true })
  routes!: string[];
}
