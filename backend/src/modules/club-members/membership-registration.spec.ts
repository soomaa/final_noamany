import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { MembershipRegistrationService } from './membership-registration.service';
import { MembershipRegistrationController } from './membership-registration.controller';
import { ClubSubscriptionsController } from '../club-subscriptions/club-subscriptions.controller';
import { ClubMembersController } from './club-members.controller';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { buildRouteMap, flattenCatalog } from '../rbac/catalog/rbac.catalog';

const user = { sub: 20, level: 2, branch: 1 } as never;
const member = { id: 9, memberCode: 'DEMO-9', name: 'Demo member', branchId: 1, phone: '*******10', gender: 'male' };
function build() {
 const prisma = { department_jobs: { findMany: jest.fn().mockResolvedValue([{id:3}]) }, employees: { findMany: jest.fn().mockResolvedValue([{ id:7, employee:'Demo rep', emp_code:70, branch_id_fk:1, salary:999 }]) } };
 const members = { list: jest.fn(), findOne: jest.fn().mockResolvedValue(member) };
 const types = { listActive: jest.fn() };
 const scope = { allowedBranchIds: jest.fn().mockReturnValue([1]) };
 return { service: new MembershipRegistrationService(prisma as never, members as never, types as never, scope as never), prisma, members, types };
}
describe('Membership-only registration permissions and data', () => {
 it('has an independent view/create matrix row and route', () => {
  const mapped = buildRouteMap()['/club/membership-add'];
  expect(Array.isArray(mapped) ? mapped : [mapped]).toEqual(['club.membership_add']);
  expect(flattenCatalog().find(row => row.key === 'club.membership_add')?.actions).toEqual(['view','create']);
  expect(buildRouteMap()['/club/subscriptions']).not.toContain('club.membership_add');
 });
 it('permits the new sale but denies financial lists, history, updates and deletes', async () => {
  const keys = new Set(['club.membership_add:view','club.membership_add:create']);
  const engine = { canAny: async (_id:number, required:string[]) => required.some(key => keys.has(key)) };
  const guard = new PermissionsGuard(new Reflector(), {} as never, engine as never);
  const context = (controller:any, handler:any) => ({getClass:()=>controller,getHandler:()=>handler,switchToHttp:()=>({getRequest:()=>({user})})}) as never;
  for (const handler of ['search','findOne','types','sales']) await expect(guard.canActivate(context(MembershipRegistrationController, (MembershipRegistrationController.prototype as any)[handler]))).resolves.toBe(true);
  await expect(guard.canActivate(context(ClubSubscriptionsController, ClubSubscriptionsController.prototype.create))).resolves.toBe(true);
  for (const handler of ['list','update','remove']) { const fn=(ClubSubscriptionsController.prototype as any)[handler]; if(fn) await expect(guard.canActivate(context(ClubSubscriptionsController,fn))).rejects.toBeInstanceOf(ForbiddenException); }
  await expect(guard.canActivate(context(ClubMembersController, ClubMembersController.prototype.findOne))).rejects.toBeInstanceOf(ForbiddenException);
  keys.delete('club.membership_add:create');
  await expect(guard.canActivate(context(MembershipRegistrationController,MembershipRegistrationController.prototype.search))).rejects.toBeInstanceOf(ForbiddenException);
  await expect(guard.canActivate(context(ClubSubscriptionsController,ClubSubscriptionsController.prototype.create))).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('retains identity and masked phones without balances or financial history', async () => {
  const { service,members }=build();
  members.list.mockResolvedValue({data:[{...member, emergencyName:'Demo contact', totalPaid:999999, membershipType:{price:777}, financialHistory:[44], remainingAmount:9000}],total:1,page:1,pageSize:8});
  expect(await service.search(' DEMO ',user)).toEqual({data:[{...member,emergencyName:'Demo contact'}],total:1,page:1,pageSize:8});
  expect(members.list.mock.calls[0][1]).toBe(user);
  expect(members.list.mock.calls[0][0]).toMatchObject({search:'DEMO',page:1,pageSize:8,forSelect:true});
 });
 it('does not enumerate members without a search',async()=>{
  const {service,members}=build();expect(await service.search(' ',user)).toEqual({data:[],total:0,page:1,pageSize:8});expect(members.list).not.toHaveBeenCalled();
 });
 it('retains full form fields and delegates member branch access checks',async()=>{
  const {service,members}=build();
  members.findOne.mockResolvedValueOnce({...member,guardianName:'Guardian',emergencyPhone:'01000000001',passportNumber:'DEMO',subscriptions:[{paid:99}],totalPaid:999});
  expect(await service.findOne(9,user)).toEqual({...member,guardianName:'Guardian',emergencyPhone:'01000000001',passportNumber:'DEMO'});
  expect(members.findOne).toHaveBeenCalledWith(9,user);
  members.findOne.mockRejectedValueOnce(new ForbiddenException());await expect(service.findOne(10,user)).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('returns package pricing for the new payment without sales totals and respects branch scope',async()=>{
  const {service,types}=build();
  const type={id:1,name:'Demo package',days:30,price:500,minPrice:200,branchId:1,branchIds:[],applyToAllBranches:false,incomeType:'membership',benefits:{inbodyCount:1},includesGymAccess:false,classTypeIds:[4],classTypes:[{id:4,name:'Demo class'}],classSessionsCount:3,branchPrices:[{branchId:1,price:450},{branchId:2,price:700}],subscriptionsCount:400,revenue:999999};
  types.listActive.mockResolvedValue([type,{...type,id:2,branchId:2},{...type,id:3,branchId:2,applyToAllBranches:true}]);
  const rows=await service.packageOptions(user);expect(rows.map(row=>row.id)).toEqual([1,3]);
  expect(rows[0]).toMatchObject({price:500,minPrice:200,benefits:{inbodyCount:1},includesGymAccess:false,classTypeIds:[4],classTypes:[{id:4,name:'Demo class'}],classSessionsCount:3});expect(rows[0].branchPrices).toEqual([{branchId:1,price:450}]);expect(rows[0]).not.toHaveProperty('revenue');expect(rows[0]).not.toHaveProperty('subscriptionsCount');
 });
 it('returns sales representatives without salary fields',async()=>{
  const {service,prisma}=build();expect(await service.sales(user)).toEqual([{id:7,name:'Demo rep',empCode:70,branchId:1}]);
  expect(prisma.employees.findMany.mock.calls[0][0].select).toEqual({id:true,employee:true,emp_code:true,branch_id_fk:true});
 });
 
});
