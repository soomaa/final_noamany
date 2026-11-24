import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ClubLeadsService } from './club-leads.service';
const user = { sub: 9, emp_code: 77, branch: 1 } as never;
function setup() {
 const prisma:any = { club_leads:{findMany:jest.fn().mockResolvedValue([]),updateMany:jest.fn().mockResolvedValue({count:1})},club_lead_follow_ups:{create:jest.fn()} };
 prisma.$transaction = jest.fn(fn=>fn(prisma));
 const service = new ClubLeadsService(prisma,{resolveListFilter:()=>[1]} as never,{isSalesEmployee:async()=>true} as never,{} as never);
 return {prisma,service};
}
test('reminders combine both appointment kinds, sort before pagination and enforce own branch/assignee',async()=>{
 const {prisma,service}=setup();
 const base={name:'عميل',phone:'01000000000',status:'in_progress',branch_id:1,converted_member_id:null};
 prisma.club_leads.findMany.mockResolvedValue([
  {...base,id:1,next_call_at:new Date('2026-09-10T09:00:00Z'),next_follow_up_at:new Date('2026-09-08T09:00:00Z')},
  {...base,id:2,next_call_at:new Date('2026-09-09T09:00:00Z'),next_follow_up_at:null},
 ]);
 const result=await service.reminders(user,{page:1,pageSize:2});
 expect(result.total).toBe(3);expect(result.data.map(r=>[r.lead.id,r.kind])).toEqual([[1,'follow_up'],[2,'call']]);
 expect(prisma.club_leads.findMany.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([{branch_id:{in:[1]}},{assigned_to:77},{status:{notIn:['lost','qualified']}}]));
 expect((await service.reminders(user,{page:2,pageSize:2})).data[0].lead.id).toBe(1);
 await expect(service.reminders({sub:9} as never,{})).rejects.toBeInstanceOf(ForbiddenException);
});
test('completion matches owner, branch and exact booking so stale clicks cannot clear a rescheduled reminder',async()=>{
 const {prisma,service}=setup();const dueAt='2026-09-09T09:00:00.000Z';
 await service.completeReminder(1,{kind:'call',dueAt},user);
 expect(prisma.club_leads.updateMany).toHaveBeenCalledWith({where:{AND:expect.arrayContaining([{id:1,assigned_to:77,next_call_at:new Date(dueAt)},{branch_id:{in:[1]}}])},data:{next_call_at:null}});
 expect(prisma.club_lead_follow_ups.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({lead_id:1,activity_type:'system'})}));
 prisma.club_leads.updateMany.mockResolvedValue({count:0});prisma.club_lead_follow_ups.create.mockClear();
 await expect(service.completeReminder(1,{kind:'call',dueAt},user)).rejects.toBeInstanceOf(BadRequestException);
 expect(prisma.club_lead_follow_ups.create).not.toHaveBeenCalled();
});
