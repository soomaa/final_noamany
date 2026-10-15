import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LocationsService } from './locations.service';
import {
  CreateLocationDto,
  ListLocationsDto,
  UpdateLocationDto,
} from './dto/locations.dto';

@UseGuards(JwtAuthGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(@Query() query: ListLocationsDto) {
    return this.locations.list(query);
  }

  @Get('tree')
  tree() {
    return this.locations.tree();
  }

  @Post()
  @RequiresPermission('admin.locations:update')
  create(@Body() dto: CreateLocationDto) {
    return this.locations.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('admin.locations:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto) {
    return this.locations.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('admin.locations:update')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.locations.remove(id);
  }
}
