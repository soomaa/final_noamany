import { leadSubscriptionContexts } from './lead-subscription-context';
test('returns actual paid amount and latest contract within the lead branch, including phone-only imported leads', async()=>{
 const findMany=jest.fn().mockResolvedValue([
 {id:3,branch_id:1,member_id:7,member:{phone:'01000000001'},guardian_phone:null,subscription_number:'FT-3',subscription_type:'سنوي',paid_amount:3800,subscription_start_date:'2026-01-01',subscription_end_date:'2026-12-31'},
 {id:2,branch_id:1,member_id:7,member:{phone:'01000000001'},guardian_phone:null,subscription_number:'FT-2',subscription_type:'شهري',paid_amount:0,subscription_start_date:'2025-01-01',subscription_end_date:'2025-01-31'},
 {id:4,branch_id:2,member_id:8,member:{phone:'01000000001'},guardian_phone:null,subscription_number:'OTHER',subscription_type:'Other branch',paid_amount:9999,subscription_start_date:'2027-01-01',subscription_end_date:'2027-12-31'},
 ]);
 const result=await leadSubscriptionContexts({club_subscriptions:{findMany}} as never,[{id:1,branch_id:1,phone:'+201000000001',converted_member_id:null}]);
 expect(result.get(1)).toEqual({subscriptionNumber:'FT-3',packageName:'سنوي',paidAmount:3800,startDate:'2026-01-01',endDate:'2026-12-31'});
 expect(findMany).toHaveBeenCalledTimes(1);
 expect(findMany.mock.calls[0][0].where.OR[0].branch_id).toBe(1);
});
test('does not guess financial details when a phone belongs to multiple members',async()=>{
 const rows=[7,8].map(member_id=>({id:member_id,branch_id:1,member_id,member:{phone:'01000000001'},paid_amount:0}));
 const result=await leadSubscriptionContexts({club_subscriptions:{findMany:async()=>rows}} as never,[{id:1,branch_id:1,phone:'01000000001',converted_member_id:null}]);
 expect(result.has(1)).toBe(false);
});
