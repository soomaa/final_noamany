import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ClubMemberGroupsService } from './club-member-groups.service';
import { MemberGroupQueryDto } from './dto/member-group.dto';

describe('Member groups branch and assignment safeguards', () => {
  const group={id:2,name:'Demo group',category:'Companies',branch_id:10,max_members:2,current_members:1,is_active:true,discount_type:'percentage',discount_amount:15};
  const user={sub:1,branch:10,level:2} as never;
  let prisma:any,scope:any,audit:any,service:ClubMemberGroupsService;
  beforeEach(()=>{
    prisma={club_member_groups:{findFirst:jest.fn().mockResolvedValue(group),findMany:jest.fn().mockResolvedValue([]),update:jest.fn()},
      club_members:{findMany:jest.fn().mockResolvedValue([{id:7,branch_id:10}])},
      club_member_group_members:{findMany:jest.fn().mockResolvedValue([]),count:jest.fn().mockResolvedValue(1),deleteMany:jest.fn(),createMany:jest.fn()},
      $queryRaw:jest.fn().mockResolvedValue([]),$transaction:jest.fn()};
    prisma.$transaction.mockImplementation(async fn=>fn(prisma));
    scope={allowedBranchIds:jest.fn().mockReturnValue([10]),isBranchAllowed:jest.fn().mockReturnValue(true)};
    audit={log:jest.fn()};service=new ClubMemberGroupsService(prisma,scope,audit);
  });
  it('filters both branch-specific and legacy shared groups in the visible list',async()=>{
    await service.list(new MemberGroupQueryDto(),user);
    expect(prisma.club_member_groups.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:[{branch_id:null},{branch_id:{in:[10]}}],is_active:true})}));
  });
  it('rejects a member hidden from the current branch before any assignment',async()=>{
    prisma.club_members.findMany.mockResolvedValue([]);
    await expect(service.assign(2,{memberIds:[7]},user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_member_group_members.createMany).not.toHaveBeenCalled();
  });
  it('requires removing an existing active group membership before moving groups',async()=>{
    prisma.club_member_group_members.findMany.mockResolvedValue([{member_id:7,group_id:3,group:{is_active:true,name:'Other group'}}]);
    await expect(service.assign(2,{memberIds:[7]},user)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.club_member_group_members.createMany).not.toHaveBeenCalled();
  });
  it('enforces capacity inside the transaction',async()=>{
    prisma.club_member_group_members.count.mockResolvedValue(2);
    await expect(service.assign(2,{memberIds:[7]},user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_member_group_members.createMany).not.toHaveBeenCalled();
  });
  it('adds each selected member once and records the scoped group audit',async()=>{
    await expect(service.assign(2,{memberIds:[7,7]},user)).resolves.toMatchObject({added:1});
    expect(prisma.club_member_group_members.createMany).toHaveBeenCalledWith({data:[{group_id:2,member_id:7}]});
    expect(prisma.club_member_groups.update).toHaveBeenCalledWith({where:{id:2},data:{current_members:2}});
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({entityId:2,action:'add_members',actorUserId:1}));
  });
});
