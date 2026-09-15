import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';
import { CreateJobTitleDto, UpdateJobTitleDto } from './dto/job-title.dto';
import { OrgService } from './org.service';

@UseGuards(JwtAuthGuard)
@Controller('departments')
@RequiresPermission('org.departments:view')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get()
  findAll() {
    return this.org.findAll();
  }

  @Get('tree')
  tree() {
    return this.org.tree();
  }

  // -------- Job titles (المسميات الوظيفية) — declared BEFORE the param routes
  // so static `job-titles/...` segments are not captured by `:id`. --------
  @Get('job-titles')
  jobTitles() {
    return this.org.jobTitles();
  }

  @Post('job-titles')
  @RequiresPermission('org.departments:create')
  createJobTitle(@Body() dto: CreateJobTitleDto) {
    return this.org.createJobTitle(dto);
  }

  @Patch('job-titles/:id')
  @RequiresPermission('org.departments:update')
  updateJobTitle(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobTitleDto) {
    return this.org.updateJobTitle(id, dto);
  }

  @Delete('job-titles/:id')
  @RequiresPermission('org.departments:delete')
  removeJobTitle(@Param('id', ParseIntPipe) id: number) {
    return this.org.removeJobTitle(id);
  }

  // -------- Departments / sections --------
  @Post()
  @RequiresPermission('org.departments:create')
  create(@Body() dto: CreateDepartmentDto) {
    return this.org.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('org.departments:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDepartmentDto) {
    return this.org.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('org.departments:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.org.remove(id);
  }
}
