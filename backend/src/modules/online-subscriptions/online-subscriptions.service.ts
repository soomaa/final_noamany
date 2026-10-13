import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSubscriptionsService } from '../club-subscriptions/club-subscriptions.service';

type Row = Record<string, any>;
const paymentMap: Record<string, 'cash' | 'card' | 'transfer'> = {
  cash: 'cash',
  card: 'card',
  bank: 'transfer',
  online: 'card',
  visa: 'card',
  transfer: 'transfer',
  wallet: 'transfer',
  instapay: 'transfer',
};

@Injectable()
export class OnlineSubscriptionsService {
  constructor(private readonly prisma: PrismaService, private readonly scope: BranchScopeService, private readonly subscriptions: ClubSubscriptionsService) {}
  async list(user: JwtUser) { const branches=this.scope.allowedBranchIds(user); const rows=await this.prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM online_subscription_requests ${branches===null?'':`WHERE branch_id IN (${branches.map(()=>'?').join(',')})`} ORDER BY created_at DESC`,...(branches??[])); return {items:rows.map((r)=>({id:Number(r.id),memberCode:r.member_code,customerName:r.customer_name,subscriptionType:r.subscription_type_name,startDate:r.requested_start_date,endDate:r.requested_end_date,notes:r.notes,status:r.status,paymentProofPath:r.payment_proof_path,rejectionReason:r.rejection_reason}))}; }
  private async pending(id:number,user:JwtUser){const rows=await this.prisma.$queryRawUnsafe<Row[]>('SELECT * FROM online_subscription_requests WHERE id=? LIMIT 1',id);const row=rows[0];if(!row)throw new NotFoundException('طلب الاشتراك غير موجود');if(!this.scope.isBranchAllowed(user,Number(row.branch_id)))throw new ForbiddenException('لا تملك صلاحية مراجعة هذا الطلب');if(row.status!=='pending')throw new BadRequestException('تمت مراجعة الطلب بالفعل');return row;}
  async approve(id:number,user:JwtUser){const row=await this.pending(id,user);const method=paymentMap[String(row.payment_base_method).toLowerCase()];if(!method)throw new BadRequestException('طريقة الدفع غير مدعومة');const created:any=await this.subscriptions.create({branchId:Number(row.branch_id),memberId:Number(row.member_id),customerName:row.customer_name,subscriptionTypeId:Number(row.subscription_type_id),startDate:row.requested_start_date,paidAmount:Number(row.subscription_value),paymentMethod:method},user);const updated=await this.prisma.$executeRawUnsafe("UPDATE online_subscription_requests SET status='approved',club_subscription_id=?,approved_by=?,approved_at=NOW() WHERE id=? AND status='pending'",created.id,user.sub,id);if(!updated)throw new BadRequestException('تمت مراجعة الطلب بالفعل');await this.prisma.am_member_notifications.create({data:{member_id:Number(row.member_id),branch_id:Number(row.branch_id),title:'تم قبول طلب الاشتراك أونلاين',body:'تم اعتماد طلب الاشتراك أونلاين بنجاح.',type:'online_subscription_approved',data:JSON.stringify({onlineSubscriptionRequestId:id,clubSubscriptionId:created.id}),created_by:user.sub}});return {success:true,message:'تم اعتماد الاشتراك أونلاين'};}
  async reject(id:number,user:JwtUser,reason:string){const text=String(reason??'').trim();if(!text)throw new BadRequestException('سبب الرفض مطلوب');const row=await this.pending(id,user);const updated=await this.prisma.$executeRawUnsafe("UPDATE online_subscription_requests SET status='rejected',rejection_reason=?,rejected_by=?,rejected_at=NOW() WHERE id=? AND status='pending'",text,user.sub,id);if(!updated)throw new BadRequestException('تمت مراجعة الطلب بالفعل');await this.prisma.am_member_notifications.create({data:{member_id:Number(row.member_id),branch_id:Number(row.branch_id),title:'تم رفض طلب الاشتراك أونلاين',body:`تم رفض طلب الاشتراك أونلاين. السبب: ${text}`,type:'online_subscription_rejected',data:JSON.stringify({onlineSubscriptionRequestId:id,rejectionReason:text}),created_by:user.sub}});return {success:true,message:'تم رفض طلب الاشتراك'};}
}
