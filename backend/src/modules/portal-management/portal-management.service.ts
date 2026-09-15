import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type Input = { title?: string; status?: string; branchId?: number | null; data?: Record<string, any> };
type Query = { q?: string; status?: string; branchId?: string; page?: string; pageSize?: string; from?: string; to?: string; captainId?: string };
type Row = Record<string, any>;

const TYPES = new Set([
  'sliders', 'partners', 'policies', 'photos', 'videos', 'hero-videos', 'branches', 'trainers', 'classes',
  'messages', 'jobs', 'job-applications', 'offers', 'badges', 'captain-discounts', 'categories', 'products', 'orders', 'customers',
  'stats', 'services', 'class-showcase', 'about-features', 'coach-features', 'section-settings',
]);
const CONTENT_TYPES = new Set(['stats', 'services', 'class-showcase', 'about-features', 'coach-features', 'section-settings']);
const PUBLIC_SECTION_KEYS = new Set(['hero','about','products','offers','schedule','services','classes','coaches','videos','gallery','membership','branches','contact','lead','footer']);
const ORDER_STATUSES = new Set(['pending', 'processing', 'completed', 'cancelled']);

function text(value: unknown) { return value == null || value === '' ? null : String(value).trim(); }
function int(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function decimal(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function bool(value: unknown) { return value === true || value === 1 || value === '1' || value === 'true'; }
function date(value: unknown) { const v = text(value); return v ? v.slice(0, 10) : null; }
function jsonText(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return JSON.stringify(value);
  try { return JSON.stringify(JSON.parse(value)); } catch { throw new BadRequestException('مواصفات المنتج يجب أن تكون JSON صحيحًا'); }
}

@Injectable()
export class PortalManagementService {
  constructor(private readonly prisma: PrismaService) {}

  private assertType(type: string) {
    if (!TYPES.has(type)) throw new BadRequestException('نوع شاشة البوابة غير صالح');
  }

  async list(type: string, query: Query) {
    this.assertType(type);
    const page = Math.max(1, int(query.page, 1));
    const pageSize = Math.min(100, Math.max(1, int(query.pageSize, 25)));
    const all = await this.rows(type, query);
    const q = text(query.q)?.toLocaleLowerCase('ar') ?? '';
    const filtered = all.filter((row) => {
      if (query.status && String(row.status) !== query.status) return false;
      if (query.branchId && Number(row.branchId) !== Number(query.branchId)) return false;
      return !q || JSON.stringify(row).toLocaleLowerCase('ar').includes(q);
    });
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize };
  }

  async options() {
    const [branches, employees, categories, badges, jobs] = await Promise.all([
      this.prisma.tbl_branches.findMany({ orderBy: { branch_id: 'asc' }, select: { branch_id: true, branch_name: true } }),
      this.prisma.employees.findMany({ where: { employee: { not: null } }, orderBy: { employee: 'asc' }, select: { id: true, employee: true, emp_code: true, branch_id_fk: true }, take: 2000 }),
      this.safeRows('SELECT id, name FROM categories ORDER BY display_order, id'),
      this.safeRows('SELECT id, name FROM tbl_badge_settings WHERE is_active=1 ORDER BY display_order, id'),
      this.safeRows('SELECT ads_id AS id, mosama_wazefy_name AS name FROM design_web_job_ads ORDER BY ads_id DESC'),
    ]);
    return {
      branches: branches.map((b) => ({ id: b.branch_id, name: b.branch_name })),
      employees: employees.map((e) => ({ id: e.id, name: e.employee, code: e.emp_code, branchId: e.branch_id_fk })),
      categories, badges, jobs,
    };
  }

  async create(type: string, body: Input, userId: number) {
    this.assertType(type);
    const d = body.data ?? {};
    if (['messages', 'job-applications', 'orders', 'customers'].includes(type)) throw new BadRequestException('هذه الشاشة للعرض والإجراءات فقط');
    await this.validate(type, body);
    let result: number;
    switch (type) {
      case 'sliders': result = await this.insert('design_web_slider', ['title','slug_title','details','main_image','date','publisher'], [text(body.title), text(d.slugTitle), text(d.details), text(d.mainImage), date(d.date), userId]); break;
      case 'partners': result = await this.insert('design_web_partners', ['name','details','main_image','date','publisher'], [text(body.title), text(d.details), text(d.mainImage), date(d.date), userId]); break;
      case 'policies': result = await this.insert('design_web_systems', ['title','slug_title','details','type','file_path','date','publisher'], [text(body.title), text(d.slugTitle), text(d.details), int(d.type, 1), text(d.filePath), date(d.date), userId]); break;
      case 'videos': result = await this.insert('design_web_videos', ['title','slug_title','video_link','main_page_video','main_image','date','publisher'], [text(body.title), text(d.slugTitle), text(d.videoLink), bool(d.mainPageVideo) ? 1 : 0, text(d.mainImage), date(d.date), userId]); break;
      case 'hero-videos': result = await this.insert('design_web_slider_videos', ['title','branch_id','video_link','main_page_video','main_image','date','publisher'], [text(body.title), int(body.branchId), text(d.videoLink), bool(d.mainPageVideo) ? 1 : 0, text(d.mainImage), date(d.date), userId]); break;
      case 'trainers': result = await this.insert('design_web_projects', ['title','job_title','branch_id','gender','main_image','date','publisher'], [text(body.title), text(d.jobTitle), int(body.branchId), int(d.gender), text(d.mainImage), date(d.date), userId]); break;
      case 'classes': result = await this.insert('design_web_classes', ['class_title','branch_id','class_type','day','time','date','publisher'], [text(body.title), int(body.branchId), int(d.classType), text(d.day), text(d.time), date(d.date), userId]); break;
      case 'photos':
        result = await this.insert('design_web_photos', ['title','branch_id','details','main_image','date','publisher'], [text(body.title), int(body.branchId), text(d.details), text(d.mainImage), date(d.date), userId]);
        await this.replaceChildren('design_web_photos_images', 'photos_id_fk', result, 'images_name', d.images);
        break;
      case 'jobs':
        result = await this.insert('design_web_job_ads', ['mosama_wazefy_name','specialization','salary','gender','age','experience_years','ads_start_date','ads_end_date','details','image','user_id','status','branch_id','ads_added_date','ads_added_time'], [text(body.title),text(d.specialization),text(d.salary),text(d.gender) ?? 'all',text(d.age),text(d.experienceYears),date(d.startDate),date(d.endDate),text(d.details),text(d.image),userId,body.status === 'notactive' ? 'notactive':'active',body.branchId ? int(body.branchId):null,new Date().toISOString().slice(0,10),new Date().toTimeString().slice(0,8)]);
        await this.replaceChildren('design_web_job_ads_files', 'ads_id_fk', result, 'file', d.files);
        break;
      case 'badges': result = await this.insert('tbl_badge_settings', ['name','name_en','badge_type','background_color','text_color','is_active','display_order'], [text(body.title),text(d.nameEn),text(d.badgeType) ?? 'custom',text(d.backgroundColor) ?? '#dc2626',text(d.textColor) ?? '#ffffff',body.status === 'inactive' ? 0:1,Math.max(1,int(d.displayOrder,1))]); break;
      case 'offers': result = await this.insert('tbl_offers', ['offer_name','sub_title','from_date','to_date','offer_value','status','offer_details','image'], [text(body.title),text(d.subtitle),date(d.startDate),date(d.endDate),decimal(d.value),body.status === 'inactive' ? 'notactiv':'activ',text(d.details),text(d.image)]); break;
      case 'captain-discounts': result = await this.createCaptainDiscount(d); break;
      case 'categories': result = await this.insert('categories', ['name','icon_class','image','display_order'], [text(body.title),text(d.iconClass),text(d.image),Math.max(1,int(d.displayOrder,1))]); break;
      case 'products': result = await this.createProduct(body); break;
      case 'branches': result = await this.saveBranchProfile(int(body.branchId), d, userId); break;
      case 'stats': case 'services': case 'class-showcase': case 'about-features': case 'coach-features': case 'section-settings':
        result = await this.createContentItem(type, body, userId); break;
      default: throw new BadRequestException('الإضافة غير مدعومة');
    }
    return (await this.list(type, { q: '', pageSize: '100' })).items.find((r: Row) => Number(r.id) === Number(result)) ?? { id: result };
  }

  async update(type: string, id: number, body: Input, userId: number) {
    this.assertType(type);
    const d = body.data ?? {};
    await this.validate(type, body);
    switch (type) {
      case 'sliders': await this.updateRow('design_web_slider','id',id,{ title:text(body.title),slug_title:text(d.slugTitle),details:text(d.details),main_image:text(d.mainImage),date:date(d.date),publisher:userId }); break;
      case 'partners': await this.updateRow('design_web_partners','id',id,{ name:text(body.title),details:text(d.details),main_image:text(d.mainImage),date:date(d.date),publisher:userId }); break;
      case 'policies': await this.updateRow('design_web_systems','id',id,{ title:text(body.title),slug_title:text(d.slugTitle),details:text(d.details),type:int(d.type,1),file_path:text(d.filePath),date:date(d.date),publisher:userId }); break;
      case 'videos': await this.updateRow('design_web_videos','id',id,{ title:text(body.title),slug_title:text(d.slugTitle),video_link:text(d.videoLink),main_page_video:bool(d.mainPageVideo)?1:0,main_image:text(d.mainImage),date:date(d.date),publisher:userId }); break;
      case 'hero-videos': await this.updateRow('design_web_slider_videos','id',id,{ title:text(body.title),branch_id:int(body.branchId),video_link:text(d.videoLink),main_page_video:bool(d.mainPageVideo)?1:0,main_image:text(d.mainImage),date:date(d.date),publisher:userId }); break;
      case 'trainers': await this.updateRow('design_web_projects','id',id,{ title:text(body.title),job_title:text(d.jobTitle),branch_id:int(body.branchId),gender:int(d.gender),main_image:text(d.mainImage),date:date(d.date),publisher:userId }); break;
      case 'classes': await this.updateRow('design_web_classes','id',id,{ class_title:text(body.title),branch_id:int(body.branchId),class_type:int(d.classType),day:text(d.day),time:text(d.time),date:date(d.date),publisher:userId }); break;
      case 'photos': await this.updateRow('design_web_photos','id',id,{ title:text(body.title),branch_id:int(body.branchId),details:text(d.details),main_image:text(d.mainImage),date:date(d.date),publisher:userId }); await this.replaceChildren('design_web_photos_images','photos_id_fk',id,'images_name',d.images); break;
      case 'jobs': await this.updateRow('design_web_job_ads','ads_id',id,{ mosama_wazefy_name:text(body.title),specialization:text(d.specialization),salary:text(d.salary),gender:text(d.gender)??'all',age:text(d.age),experience_years:text(d.experienceYears),ads_start_date:date(d.startDate),ads_end_date:date(d.endDate),details:text(d.details),image:text(d.image),status:body.status==='notactive'?'notactive':'active',branch_id:body.branchId?int(body.branchId):null,user_id:userId }); await this.replaceChildren('design_web_job_ads_files','ads_id_fk',id,'file',d.files); break;
      case 'badges': await this.updateRow('tbl_badge_settings','id',id,{ name:text(body.title),name_en:text(d.nameEn),badge_type:text(d.badgeType)??'custom',background_color:text(d.backgroundColor)??'#dc2626',text_color:text(d.textColor)??'#ffffff',is_active:body.status==='inactive'?0:1,display_order:Math.max(1,int(d.displayOrder,1)) }); break;
      case 'offers': await this.updateRow('tbl_offers','offer_id',id,{ offer_name:text(body.title),sub_title:text(d.subtitle),from_date:date(d.startDate),to_date:date(d.endDate),offer_value:decimal(d.value),status:body.status==='inactive'?'notactiv':'activ',offer_details:text(d.details),image:text(d.image) }); break;
      case 'captain-discounts': await this.updateCaptainDiscount(id,d,body.status); break;
      case 'categories': await this.updateRow('categories','id',id,{ name:text(body.title),icon_class:text(d.iconClass),image:text(d.image),display_order:Math.max(1,int(d.displayOrder,1)) }); break;
      case 'products': await this.updateProduct(id,body); break;
      case 'branches': await this.saveBranchProfile(id,d,userId); break;
      case 'customers': await this.updateCustomer(id,d,body.status); break;
      case 'stats': case 'services': case 'class-showcase': case 'about-features': case 'coach-features': case 'section-settings':
        await this.updateContentItem(id, type, body, userId); break;
      default: throw new BadRequestException('التعديل غير مدعوم لهذه الشاشة');
    }
    return { success: true };
  }

  async updateStatus(type: string, id: number, status: string, userId: number, comment?: string) {
    this.assertType(type);
    if (type === 'messages') {
      await this.updateRow('design_web_contact_us','id',id,{ seen: status === 'read' ? 1:0, action_date_ar:new Date().toISOString().slice(0,19).replace('T',' '), action_publisher_name:String(userId) });
    } else if (type === 'job-applications') {
      const approved = status === 'accepted' ? 1 : status === 'rejected' ? 2 : 0;
      await this.updateRow('users_applications','id',id,{ approved,comment:text(comment),action_date:new Date(),user_id_fk:userId });
    } else if (type === 'orders') {
      if (!ORDER_STATUSES.has(status)) throw new BadRequestException('حالة الطلب غير صحيحة');
      await this.updateRow('orders','id',id,{ status,updated_at:new Date() });
    } else if (CONTENT_TYPES.has(type)) {
      await this.updateRow('portal_content_items','id',id,{ is_active: status === 'active' ? 1 : 0, publisher:userId });
    } else if (['offers','badges','captain-discounts','customers'].includes(type)) {
      const table = type === 'offers' ? 'tbl_offers' : type === 'badges' ? 'tbl_badge_settings' : type === 'captain-discounts' ? 'tbl_store_captain_discounts' : 'web_users';
      const col = type === 'offers' ? 'status' : type === 'captain-discounts' ? 'status' : 'is_active';
      await this.updateRow(table,type === 'offers' ? 'offer_id':'id',id,{ [col]: type === 'offers' ? (status === 'active' ? 'activ':'notactiv') : (status === 'active' ? 1:0) });
    } else if (type === 'jobs') {
      await this.updateRow('design_web_job_ads','ads_id',id,{ status:status==='active'?'active':'notactive',user_id:userId });
    } else throw new BadRequestException('تغيير الحالة غير متاح لهذه الشاشة');
    return { success: true };
  }

  async addStock(id: number, quantity: number) {
    if (quantity <= 0) throw new BadRequestException('الكمية يجب أن تكون أكبر من صفر');
    const affected = await this.prisma.$executeRawUnsafe('UPDATE products SET current_stock=current_stock+?, stock_status=\'in_stock\' WHERE id=?', quantity, id);
    if (!affected) throw new NotFoundException('المنتج غير موجود');
    return { success: true };
  }

  async remove(type: string, id: number) {
    this.assertType(type);
    if (type === 'orders') return this.deleteOrder(id);
    if (type === 'customers') return this.deleteCustomer(id);
    if (CONTENT_TYPES.has(type)) {
      const affected = await this.prisma.$executeRawUnsafe('DELETE FROM portal_content_items WHERE id=? AND content_type=?', id, type);
      if (!affected) throw new NotFoundException('السجل غير موجود');
      return { success: true };
    }
    const target: Record<string,[string,string]> = {
      sliders:['design_web_slider','id'],partners:['design_web_partners','id'],policies:['design_web_systems','id'],photos:['design_web_photos','id'],videos:['design_web_videos','id'],
      'hero-videos':['design_web_slider_videos','id'],trainers:['design_web_projects','id'],classes:['design_web_classes','id'],jobs:['design_web_job_ads','ads_id'],offers:['tbl_offers','offer_id'],badges:['tbl_badge_settings','id'],
      'captain-discounts':['tbl_store_captain_discounts','id'],categories:['categories','id'],products:['products','id'],
    };
    const config = target[type];
    if (!config) throw new BadRequestException('الحذف غير متاح لهذه الشاشة');
    const affected = await this.prisma.$executeRawUnsafe(`DELETE FROM \`${config[0]}\` WHERE \`${config[1]}\`=?`, id);
    if (!affected) throw new NotFoundException('السجل غير موجود');
    return { success: true };
  }

  async getSetting(key: string) {
    if (key === 'company') return (await this.prisma.conf_company_data.findFirst({ select: {
      id_config:true,nameweb:true,abbreviation_name:true,slogan:true,summary_company:true,website:true,email:true,email_cadangan:true,
      address:true,telepon:true,hp:true,fax:true,logo:true,icon:true,footer:true,keywords:true,metatext:true,facebook:true,twitter:true,
      instagram:true,google_plus:true,google_map:true,
    } })) ?? {};
    if (key === 'about') {
      const rows = await this.safeRows('SELECT * FROM design_web_about ORDER BY id DESC LIMIT 1');
      const r = rows[0];
      return r ? { id:r.id,title:r.page_title,details:r.details,mainImage:r.main_img } : {};
    }
    throw new BadRequestException('نوع الإعداد غير صالح');
  }

  async saveSetting(key: string, data: Record<string, any>, userId: number) {
    if (key === 'company') {
      const row = await this.prisma.conf_company_data.findFirst({ select:{ id_config:true } });
      if (!row) throw new NotFoundException('بيانات الشركة غير موجودة');
      const allowed = ['nameweb','abbreviation_name','slogan','summary_company','website','email','email_cadangan','address','telepon','hp','fax','logo','icon','footer','keywords','metatext','facebook','twitter','instagram','google_plus','google_map'];
      const update = Object.fromEntries(allowed.filter((k)=>k in data).map((k)=>[k,text(data[k])]));
      return this.prisma.conf_company_data.update({ where:{id_config:row.id_config}, data:{...update,id_user:userId} });
    }
    if (key === 'about') {
      const rows = await this.safeRows('SELECT id FROM design_web_about ORDER BY id DESC LIMIT 1');
      if (rows[0]) await this.updateRow('design_web_about','id',rows[0].id,{page_title:text(data.title),details:text(data.details),main_img:text(data.mainImage),publisher:userId});
      else await this.insert('design_web_about',['page_title','details','main_img','date_add','publisher'],[text(data.title),text(data.details),text(data.mainImage),new Date(),userId]);
      return this.getSetting('about');
    }
    throw new BadRequestException('نوع الإعداد غير صالح');
  }

  async report(query: Query) {
    const where = [`o.status='completed'`, `o.coupon_code IS NOT NULL`, `o.coupon_code<>''`];
    const params: any[]=[];
    if (query.from) { where.push('DATE(o.created_at)>=?'); params.push(query.from); }
    if (query.to) { where.push('DATE(o.created_at)<=?'); params.push(query.to); }
    if (query.captainId) { where.push('o.captain_id=?'); params.push(int(query.captainId)); }
    return this.safeRows(`SELECT o.captain_id AS captainId,e.employee AS captain,o.coupon_code AS discountCode,COUNT(*) AS orderCount,SUM(o.total+o.coupon_discount_amount) AS grossTotal,SUM(o.coupon_discount_amount) AS discountTotal,SUM(o.total) AS netTotal,MIN(o.created_at) AS firstOrder,MAX(o.created_at) AS lastOrder FROM orders o LEFT JOIN employees e ON e.id=o.captain_id WHERE ${where.join(' AND ')} GROUP BY o.captain_id,e.employee,o.coupon_code ORDER BY netTotal DESC`,...params);
  }

  async summary() {
    const count = async (sql: string, ...params: any[]) => {
      const rows = await this.safeRows(sql, ...params);
      return Number(rows[0]?.total ?? 0);
    };
    const amount = async (sql: string, ...params: any[]) => {
      const rows = await this.safeRows(sql, ...params);
      return Number(rows[0]?.amount ?? 0);
    };

    const [
      unreadMessages, readMessages, pendingApplications, acceptedApplications, rejectedApplications, activeJobs,
      pendingOrders, processingOrders, completedOrders, cancelledOrders, products, outOfStockProducts, customers,
      sliders, photos, videos, heroVideos, branches, trainers, classes, completedRevenue, recentOrders, recentMessages,
    ] = await Promise.all([
      count('SELECT COUNT(*) AS total FROM design_web_contact_us WHERE seen=0'),
      count('SELECT COUNT(*) AS total FROM design_web_contact_us WHERE seen=1'),
      count('SELECT COUNT(*) AS total FROM users_applications WHERE approved=0'),
      count('SELECT COUNT(*) AS total FROM users_applications WHERE approved=1'),
      count('SELECT COUNT(*) AS total FROM users_applications WHERE approved=2'),
      count("SELECT COUNT(*) AS total FROM design_web_job_ads WHERE status='active'"),
      count("SELECT COUNT(*) AS total FROM orders WHERE status='pending'"),
      count("SELECT COUNT(*) AS total FROM orders WHERE status='processing'"),
      count("SELECT COUNT(*) AS total FROM orders WHERE status='completed'"),
      count("SELECT COUNT(*) AS total FROM orders WHERE status='cancelled'"),
      count('SELECT COUNT(*) AS total FROM products'),
      count("SELECT COUNT(*) AS total FROM products WHERE current_stock<=0 OR stock_status='out_of_stock'"),
      count('SELECT COUNT(*) AS total FROM web_users'),
      count('SELECT COUNT(*) AS total FROM design_web_slider'),
      count('SELECT COUNT(*) AS total FROM design_web_photos'),
      count('SELECT COUNT(*) AS total FROM design_web_videos'),
      count('SELECT COUNT(*) AS total FROM design_web_slider_videos'),
      count('SELECT COUNT(*) AS total FROM tbl_branches'),
      count('SELECT COUNT(*) AS total FROM design_web_projects'),
      count('SELECT COUNT(*) AS total FROM design_web_classes'),
      amount("SELECT COALESCE(SUM(total),0) AS amount FROM orders WHERE status='completed'"),
      this.safeRows('SELECT id,full_name AS customer,total,status,created_at AS createdAt FROM orders ORDER BY id DESC LIMIT 5'),
      this.safeRows('SELECT id,name,email,message,date_add AS createdAt FROM design_web_contact_us ORDER BY id DESC LIMIT 5'),
    ]);

    return {
      attention: { unreadMessages, pendingApplications, pendingOrders, outOfStockProducts },
      orders: { pending: pendingOrders, processing: processingOrders, completed: completedOrders, cancelled: cancelledOrders },
      jobs: { active: activeJobs, pending: pendingApplications, accepted: acceptedApplications, rejected: rejectedApplications },
      store: { products, customers, completedRevenue },
      content: { sliders, photos, videos, heroVideos, branches, trainers, classes },
      messages: { unread: unreadMessages, read: readMessages },
      recentOrders: recentOrders.map((row) => ({ ...row, id: Number(row.id), total: Number(row.total ?? 0) })),
      recentMessages: recentMessages.map((row) => ({ ...row, id: Number(row.id) })),
    };
  }

  private async rows(type: string, query: Query): Promise<Row[]> {
    const sql: Record<string,string> = {
      sliders:'SELECT * FROM design_web_slider ORDER BY id DESC', partners:'SELECT * FROM design_web_partners ORDER BY id DESC', policies:'SELECT * FROM design_web_systems ORDER BY id DESC',
      photos:'SELECT p.*,b.branch_name FROM design_web_photos p LEFT JOIN tbl_branches b ON b.branch_id=p.branch_id ORDER BY p.id DESC', videos:'SELECT * FROM design_web_videos ORDER BY id DESC',
      'hero-videos':'SELECT v.*,b.branch_name FROM design_web_slider_videos v LEFT JOIN tbl_branches b ON b.branch_id=v.branch_id ORDER BY v.id DESC',
      branches:'SELECT b.branch_id AS id,b.branch_name,p.address,p.mob1,p.mob2,p.lat_map,p.lang_map FROM tbl_branches b LEFT JOIN portal_branch_profiles p ON p.branch_id=b.branch_id ORDER BY b.branch_id',
      trainers:'SELECT t.*,b.branch_name FROM design_web_projects t LEFT JOIN tbl_branches b ON b.branch_id=t.branch_id ORDER BY t.id DESC',
      classes:'SELECT c.*,b.branch_name FROM design_web_classes c LEFT JOIN tbl_branches b ON b.branch_id=c.branch_id ORDER BY c.id DESC',
      messages:'SELECT * FROM design_web_contact_us ORDER BY id DESC', jobs:'SELECT j.*,b.branch_name FROM design_web_job_ads j LEFT JOIN tbl_branches b ON b.branch_id=j.branch_id ORDER BY j.ads_id DESC',
      'job-applications':'SELECT a.*,j.mosama_wazefy_name AS job_title FROM users_applications a LEFT JOIN design_web_job_ads j ON j.ads_id=a.job_id_fk ORDER BY a.id DESC',
      offers:'SELECT * FROM tbl_offers ORDER BY offer_id DESC', badges:'SELECT * FROM tbl_badge_settings ORDER BY display_order,id', 'captain-discounts':'SELECT d.*,e.employee AS captain_name,e.emp_code FROM tbl_store_captain_discounts d LEFT JOIN employees e ON e.id=d.captain_id ORDER BY d.id DESC',
      categories:'SELECT * FROM categories ORDER BY display_order,id', products:'SELECT p.*,c.name AS category_name,b.name AS badge_name FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN tbl_badge_settings b ON b.id=p.selected_badge ORDER BY p.display_order,p.id DESC',
      orders:'SELECT o.*,u.account_type FROM orders o LEFT JOIN web_users u ON u.id=o.user_id ORDER BY o.id DESC', customers:'SELECT * FROM web_users ORDER BY id DESC',
      stats:"SELECT * FROM portal_content_items WHERE content_type='stats' ORDER BY display_order,id",
      services:"SELECT * FROM portal_content_items WHERE content_type='services' ORDER BY display_order,id",
      'class-showcase':"SELECT * FROM portal_content_items WHERE content_type='class-showcase' ORDER BY display_order,id",
      'about-features':"SELECT * FROM portal_content_items WHERE content_type='about-features' ORDER BY display_order,id",
      'coach-features':"SELECT * FROM portal_content_items WHERE content_type='coach-features' ORDER BY display_order,id",
      'section-settings':"SELECT * FROM portal_content_items WHERE content_type='section-settings' ORDER BY display_order,id",
    };
    const raw = await this.safeRows(sql[type]);
    const attach = async (table:string,fk:string,col:string,key:string,ids:number[]) => {
      if (!ids.length) return new Map<number,string[]>();
      const rows=await this.safeRows(`SELECT ${fk} AS parentId,${col} AS value FROM ${table} WHERE ${fk} IN (${ids.map(()=>'?').join(',')})`,...ids);
      const map=new Map<number,string[]>(); rows.forEach(r=>map.set(Number(r.parentId),[...(map.get(Number(r.parentId))??[]),String(r.value)])); return map;
    };
    let children=new Map<number,string[]>();
    if(type==='photos') children=await attach('design_web_photos_images','photos_id_fk','images_name','images',raw.map(r=>Number(r.id)));
    if(type==='jobs') children=await attach('design_web_job_ads_files','ads_id_fk','file','files',raw.map(r=>Number(r.ads_id)));
    if(type==='products') children=await attach('product_images','product_id','image_path','images',raw.map(r=>Number(r.id)));
    if(type==='orders') {
      const ids=raw.map(r=>Number(r.id)); const items=ids.length?await this.safeRows(`SELECT * FROM order_items WHERE order_id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`,...ids):[];
      return raw.map(r=>this.serialize(type,r,items.filter(i=>Number(i.order_id)===Number(r.id))));
    }
    return raw.map(r=>this.serialize(type,r,children.get(Number(r.id??r.ads_id))));
  }

  private serialize(type:string,r:Row,children?:any) {
    const status = type==='messages'?(r.seen?'read':'unread'):type==='job-applications'?(['pending','accepted','rejected'][Number(r.approved)]??'pending'):type==='offers'?(r.status==='activ'?'active':'inactive'):CONTENT_TYPES.has(type)?(r.is_active?'active':'inactive'):type==='badges'||type==='customers'?(r.is_active?'active':'inactive'):type==='captain-discounts'?(r.status?'active':'inactive'):type==='jobs'?(r.status==='notactive'?'notactive':'active'):type==='orders'?r.status:'active';
    const id=Number(r.ads_id??r.offer_id??r.id); const branchId=type==='branches'?id:(r.branch_id==null?null:Number(r.branch_id));
    const title = r.title??r.name??r.offer_name??r.page_title??r.class_title??r.mosama_wazefy_name??r.full_name??(r.fname ? `${r.fname}${r.lname ? ` ${r.lname}` : ''}` : null)??r.captain_name??r.product_name??(`طلب #${id}`);
    const data:Row={...r}; delete data.id; delete data.ads_id; delete data.offer_id; delete data.title; delete data.name; delete data.offer_name; delete data.status;
    const aliases:Record<string,string>={slug_title:'slugTitle',details:'details',main_image:'mainImage',file_path:'filePath',video_link:'videoLink',main_page_video:'mainPageVideo',branch_name:'branchName',job_title:'jobTitle',class_type:'classType',experience_years:'experienceYears',ads_start_date:'startDate',ads_end_date:'endDate',sub_title:'subtitle',from_date:'startDate',to_date:'endDate',offer_value:'value',offer_details:'details',name_en:'nameEn',badge_type:'badgeType',background_color:'backgroundColor',text_color:'textColor',display_order:'displayOrder',captain_id:'captainId',captain_name:'captainName',discount_code:'discountCode',discount_rate:'discountRate',category_id:'categoryId',category_name:'categoryName',current_stock:'currentStock',old_price:'oldPrice',stock_status:'stockStatus',is_featured:'isFeatured',is_new:'isNew',selected_badge:'selectedBadge',badge_name:'badgeName',full_name:'fullName',backup_phone:'backupPhone',order_notes:'orderNotes',payment_method:'paymentMethod',coupon_code:'couponCode',coupon_percentage:'couponPercentage',coupon_discount_amount:'couponDiscountAmount',shipping_cost:'shippingCost',account_type:'accountType',member_code:'memberCode',city_street:'cityStreet',is_active:'isActive',discount_start:'discountStart',discount_end:'discountEnd',discount_active:'discountActive',job_id_fk:'jobId',personal_image:'personalImage',action_date:'actionDate',section_key:'sectionKey',link_text:'linkText',link_url:'linkUrl',numeric_value:'numericValue',extra_text:'extraText'};
    Object.entries(aliases).forEach(([old,n])=>{if(old in data){data[n]=data[old];delete data[old];}});
    if (r.date_ar) data.date = r.date_ar;
    if (type === 'customers') delete data.password;
    if (type === 'products' && !r.selected_badge) data.selectedBadge = '';
    if(children) data[type==='jobs'?'files':type==='orders'?'items':'images']=children;
    if(type==='branches'){ data.branchName=r.branch_name; data.address=r.address; data.mob1=r.mob1; data.mob2=r.mob2; data.latMap=r.lat_map; data.lngMap=r.lang_map; }
    return {id,type,title,status,branchId,data,isActive:status==='active',createdAt:r.created_at??r.date??r.datetime??null};
  }

  private async validate(type:string,body:Input) {
    const d=body.data??{};
    if(!text(body.title)&&!['branches','captain-discounts','customers'].includes(type)) throw new BadRequestException('العنوان أو الاسم مطلوب');
    if(['photos','hero-videos','trainers','classes'].includes(type) || (type==='branches')) await this.assertBranch(int(body.branchId));
    if(type==='products') { if(text(body.title)!.length<3) throw new BadRequestException('اسم المنتج يجب ألا يقل عن 3 أحرف'); if(int(d.categoryId)<=0) throw new BadRequestException('اختر القسم'); if(decimal(d.price)<=0) throw new BadRequestException('السعر يجب أن يكون أكبر من صفر'); if(decimal(d.oldPrice)<0||int(d.currentStock)<0) throw new BadRequestException('السعر القديم والرصيد لا يقبلان قيمة سالبة'); }
    if(type==='captain-discounts' && (int(d.captainId)<=0 || decimal(d.discountRate)<=0 || decimal(d.discountRate)>100)) throw new BadRequestException('اختر الكابتن وأدخل نسبة خصم من 0 إلى 100');
    if(type==='section-settings' && !PUBLIC_SECTION_KEYS.has(String(d.sectionKey ?? ''))) throw new BadRequestException('مفتاح قسم الموقع غير معتمد');
  }
  private async assertBranch(id:number) { if(!id||!await this.prisma.tbl_branches.findUnique({where:{branch_id:id},select:{branch_id:true}})) throw new BadRequestException('اختر فرعًا صحيحًا من فروع النظام'); }
  private async safeRows(sql:string,...params:any[]):Promise<Row[]> { try{return await this.prisma.$queryRawUnsafe<Row[]>(sql,...params);}catch(e:any){if(e?.code==='P2010'&&String(e?.meta?.message??'').includes("doesn't exist"))return[];throw e;} }
  private async insert(table:string,columns:string[],values:any[]) { const placeholders=values.map(()=>'?').join(','); await this.prisma.$executeRawUnsafe(`INSERT INTO \`${table}\` (${columns.map(c=>`\`${c}\``).join(',')}) VALUES (${placeholders})`,...values); const r=await this.prisma.$queryRawUnsafe<Row[]>('SELECT LAST_INSERT_ID() AS id'); return Number(r[0].id); }
  private async updateRow(table:string,idColumn:string,id:number,data:Row) { const entries=Object.entries(data); const affected=await this.prisma.$executeRawUnsafe(`UPDATE \`${table}\` SET ${entries.map(([k])=>`\`${k}\`=?`).join(',')} WHERE \`${idColumn}\`=?`,...entries.map(([,v])=>v),id); if(!affected) throw new NotFoundException('السجل غير موجود'); }
  private async replaceChildren(table:string,fk:string,id:number,col:string,values:unknown) { const list=Array.isArray(values)?values.map(text).filter(Boolean):[]; await this.prisma.$executeRawUnsafe(`DELETE FROM \`${table}\` WHERE \`${fk}\`=?`,id); for(const value of list) await this.insert(table,[fk,col],[id,value]); }
  private async saveBranchProfile(branchId:number,d:Row,userId:number) { await this.assertBranch(branchId); await this.prisma.$executeRawUnsafe('INSERT INTO portal_branch_profiles (branch_id,address,mob1,mob2,lat_map,lang_map,publisher) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE address=VALUES(address),mob1=VALUES(mob1),mob2=VALUES(mob2),lat_map=VALUES(lat_map),lang_map=VALUES(lang_map),publisher=VALUES(publisher)',branchId,text(d.address),text(d.mob1),text(d.mob2),text(d.latMap),text(d.lngMap),userId); return branchId; }
  private async createCaptainDiscount(d:Row) { const captainId=int(d.captainId); const emp=await this.prisma.employees.findUnique({where:{id:captainId},select:{emp_code:true}}); if(!emp)throw new BadRequestException('الكابتن غير موجود'); const code=(text(d.discountCode)??`CAP${emp.emp_code??captainId}`).toUpperCase(); try{return await this.insert('tbl_store_captain_discounts',['captain_id','discount_code','discount_rate','status'],[captainId,code,decimal(d.discountRate),1]);}catch{throw new BadRequestException('هذا الكابتن أو كود الخصم مسجل من قبل');} }
  private async updateCaptainDiscount(id:number,d:Row,status?:string) { await this.updateRow('tbl_store_captain_discounts','id',id,{captain_id:int(d.captainId),discount_code:(text(d.discountCode)??'').toUpperCase(),discount_rate:decimal(d.discountRate),status:status==='inactive'?0:1}); }
  private contentData(type:string,body:Input,userId:number) { const d=body.data??{}; return {content_type:type,section_key:text(d.sectionKey),title:text(body.title),subtitle:text(d.subtitle),details:text(d.details),image:text(d.image),icon:text(d.icon),link_text:text(d.linkText),link_url:text(d.linkUrl),numeric_value:d.numericValue==null||d.numericValue===''?null:decimal(d.numericValue),suffix:text(d.suffix),extra_text:text(d.extraText),branch_id:body.branchId?int(body.branchId):null,is_featured:bool(d.isFeatured)?1:0,is_active:body.status==='inactive'?0:1,display_order:Math.max(1,int(d.displayOrder,1)),publisher:userId}; }
  private async createContentItem(type:string,body:Input,userId:number) { const data=this.contentData(type,body,userId); return this.insert('portal_content_items',Object.keys(data),Object.values(data)); }
  private async updateContentItem(id:number,type:string,body:Input,userId:number) { const rows=await this.safeRows('SELECT id FROM portal_content_items WHERE id=? AND content_type=?',id,type); if(!rows.length)throw new NotFoundException('السجل غير موجود'); await this.updateRow('portal_content_items','id',id,this.contentData(type,body,userId)); }
  private async createProduct(body:Input) { const d=body.data??{}; const stock=int(d.currentStock); const id=await this.insert('products',['category_id','name','name_en','current_stock','image','description','short_description','specifications','price','old_price','stock_status','is_featured','is_new','display_order','selected_badge'],[int(d.categoryId),text(body.title),text(d.nameEn),stock,text(d.image),text(d.description),text(d.shortDescription),jsonText(d.specifications),decimal(d.price),d.oldPrice?decimal(d.oldPrice):null,stock>0?'in_stock':'out_of_stock',bool(d.isFeatured)?1:0,bool(d.isNew)?1:0,Math.max(1,int(d.displayOrder,1)),d.selectedBadge?int(d.selectedBadge):null]); await this.replaceProductImages(id,d.images); return id; }
  private async updateProduct(id:number,body:Input) { const d=body.data??{}; const stock=int(d.currentStock); await this.updateRow('products','id',id,{category_id:int(d.categoryId),name:text(body.title),name_en:text(d.nameEn),current_stock:stock,image:text(d.image),description:text(d.description),short_description:text(d.shortDescription),specifications:jsonText(d.specifications),price:decimal(d.price),old_price:d.oldPrice?decimal(d.oldPrice):null,stock_status:stock>0?'in_stock':'out_of_stock',is_featured:bool(d.isFeatured)?1:0,is_new:bool(d.isNew)?1:0,display_order:Math.max(1,int(d.displayOrder,1)),selected_badge:d.selectedBadge?int(d.selectedBadge):null}); await this.replaceProductImages(id,d.images); }
  private async replaceProductImages(productId:number,values:unknown) { const list=Array.isArray(values)?values.map(text).filter((v):v is string=>Boolean(v)):[]; await this.prisma.$executeRawUnsafe('DELETE FROM product_images WHERE product_id=?',productId); for(let i=0;i<list.length;i++) await this.insert('product_images',['product_id','image_path','is_primary','display_order'],[productId,list[i],i===0?1:0,i+1]); }
  private async updateCustomer(id:number,d:Row,status?:string){ const rate=decimal(d.discountRate); if(rate<0||rate>100)throw new BadRequestException('نسبة الخصم يجب أن تكون من 0 إلى 100'); if(bool(d.discountActive)&&(!date(d.discountStart)||!date(d.discountEnd)))throw new BadRequestException('حدد تاريخ بداية ونهاية الخصم'); await this.updateRow('web_users','id',id,{discount_rate:rate,discount_start:date(d.discountStart),discount_end:date(d.discountEnd),discount_active:bool(d.discountActive)?1:0,is_active:status==='inactive'?0:1}); }
  private async deleteOrder(id:number){ await this.prisma.$transaction(async tx=>{const items=await tx.$queryRawUnsafe<Row[]>('SELECT product_id,quantity FROM order_items WHERE order_id=?',id); const exists=await tx.$queryRawUnsafe<Row[]>('SELECT id FROM orders WHERE id=?',id); if(!exists.length)throw new NotFoundException('الطلب غير موجود'); for(const item of items)await tx.$executeRawUnsafe("UPDATE products SET current_stock=current_stock+?,stock_status=IF(current_stock+?>0,'in_stock','out_of_stock') WHERE id=?",int(item.quantity),int(item.quantity),int(item.product_id)); await tx.$executeRawUnsafe('DELETE FROM order_items WHERE order_id=?',id); await tx.$executeRawUnsafe('DELETE FROM orders WHERE id=?',id);}); return{success:true,stockRestored:true}; }
  private async deleteCustomer(id:number){ await this.prisma.$transaction(async tx=>{const user=await tx.$queryRawUnsafe<Row[]>('SELECT id,phone,email FROM web_users WHERE id=?',id); if(!user.length)throw new NotFoundException('العميل غير موجود'); const orders=await tx.$queryRawUnsafe<Row[]>('SELECT id FROM orders WHERE user_id=? OR phone=? OR (email IS NOT NULL AND email=?)',id,user[0].phone,user[0].email); for(const o of orders)await tx.$executeRawUnsafe('DELETE FROM order_items WHERE order_id=?',o.id); await tx.$executeRawUnsafe('DELETE FROM orders WHERE user_id=? OR phone=? OR (email IS NOT NULL AND email=?)',id,user[0].phone,user[0].email); await tx.$executeRawUnsafe('DELETE FROM web_users WHERE id=?',id);}); return{success:true}; }
}
