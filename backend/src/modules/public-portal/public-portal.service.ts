import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { resolveSubscriptionEndDate } from '../club-subscriptions/club-subscription.utils';
import { isSubscriptionTypeAvailableAtBranch, subscriptionTypeBranchWhere } from '../club-subscriptions/subscription-type-branch-scope';
import type { PortalCustomerClaims } from './portal-customer.guard';

type Row = Record<string, any>;
type CartLine = { productId: number; quantity: number };
type PricedLine = {
  productId: number;
  name: string;
  image: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  stock: number;
};

const phonePattern = /^01[0125][0-9]{8}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stringValue(value: unknown, max = 1000) {
  return value == null ? '' : String(value).trim().slice(0, max);
}

function positiveInt(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function publicProduct(row: Row) {
  const images = Array.isArray(row.images)
    ? row.images
    : stringValue(row.images).split('||').filter(Boolean);
  // The legacy products.image column can contain a shared placeholder. Prefer
  // the product gallery, whose first item is the real per-product primary image.
  const primaryImage = images[0] || row.image || null;
  return {
    id: Number(row.id),
    categoryId: Number(row.category_id),
    category: row.category_name ?? '',
    name: row.name,
    nameEn: row.name_en,
    stock: Math.max(0, Number(row.current_stock ?? 0)),
    stockStatus: Number(row.current_stock ?? 0) > 0 && row.stock_status !== 'out_of_stock' ? 'in_stock' : 'out_of_stock',
    image: primaryImage,
    images: [...new Set([primaryImage, ...images].filter(Boolean))],
    description: row.description,
    shortDescription: row.short_description,
    specifications: row.specifications,
    price: Number(row.price ?? 0),
    oldPrice: row.old_price == null ? null : Number(row.old_price),
    featured: Boolean(row.is_featured),
    isNew: Boolean(row.is_new),
    badge: row.badge_name
      ? { name: row.badge_name, backgroundColor: row.background_color, textColor: row.text_color }
      : null,
  };
}

function publicContent(row: Row) {
  return {
    id: Number(row.id),
    type: row.content_type,
    sectionKey: row.section_key,
    title: row.title,
    subtitle: row.subtitle,
    details: row.details,
    image: row.image,
    icon: row.icon,
    linkText: row.link_text,
    linkUrl: row.link_url,
    numericValue: row.numeric_value == null ? null : Number(row.numeric_value),
    suffix: row.suffix,
    extraText: row.extra_text,
    subscriptionTypeId: row.subscriptionTypeId == null ? null : Number(row.subscriptionTypeId),
    subscriptionTypeName: row.subscriptionTypeName ?? null,
    subscriptionPrice: row.subscriptionPrice == null ? null : Number(row.subscriptionPrice),
    subscriptionDays: row.subscriptionDays == null ? null : Number(row.subscriptionDays),
    branchId: row.branch_id == null ? null : Number(row.branch_id),
    featured: Boolean(row.is_featured),
    displayOrder: Number(row.display_order),
  };
}

@Injectable()
export class PublicPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
  ) {}

  async home() {
    const [company, about, sliders, offers, branches, classes, trainers, photos, videos, partners, products, contentRows] = await Promise.all([
      this.safeRows('SELECT * FROM conf_company_data ORDER BY id_config DESC LIMIT 1'),
      this.safeRows('SELECT * FROM design_web_about ORDER BY id DESC LIMIT 1'),
      this.safeRows('SELECT id,title,slug_title,details,main_image,date FROM design_web_slider ORDER BY id DESC'),
      this.safeRows("SELECT offer_id AS id,offer_name AS title,sub_title AS subtitle,from_date AS fromDate,to_date AS toDate,offer_value AS value,offer_details AS details,image FROM tbl_offers WHERE status='activ' AND (from_date IS NULL OR from_date='' OR from_date<=CURDATE()) AND (to_date IS NULL OR to_date='' OR to_date>=CURDATE()) ORDER BY offer_id DESC LIMIT 8"),
      this.safeRows("SELECT b.branch_id AS id,b.branch_name AS name,p.address,p.mob1,p.mob2,COALESCE(NULLIF(p.lat_map,''),g.lat_map) AS lat,COALESCE(NULLIF(p.lang_map,''),g.long_map) AS lng FROM tbl_branches b LEFT JOIN portal_branch_profiles p ON p.branch_id=b.branch_id LEFT JOIN branch_settings g ON g.title=b.branch_name ORDER BY b.branch_id"),
      this.safeRows('SELECT c.id,c.class_title AS title,c.class_type AS classType,c.day,c.time,c.branch_id AS branchId,b.branch_name AS branch FROM design_web_classes c LEFT JOIN tbl_branches b ON b.branch_id=c.branch_id ORDER BY c.branch_id,c.class_type,c.day,c.time'),
      this.safeRows('SELECT t.id,t.title,t.job_title AS jobTitle,t.main_image AS image,t.gender,t.branch_id AS branchId,b.branch_name AS branch FROM design_web_projects t LEFT JOIN tbl_branches b ON b.branch_id=t.branch_id ORDER BY t.id DESC'),
      this.safeRows("SELECT p.id,p.title,p.details,p.main_image AS image,p.branch_id AS branchId,b.branch_name AS branch,GROUP_CONCAT(DISTINCT pi.images_name ORDER BY pi.images_id SEPARATOR '||') AS albumImages FROM design_web_photos p LEFT JOIN tbl_branches b ON b.branch_id=p.branch_id LEFT JOIN design_web_photos_images pi ON pi.photos_id_fk=p.id GROUP BY p.id ORDER BY p.id DESC LIMIT 18"),
      this.safeRows('SELECT id,title,slug_title AS subtitle,video_link AS videoLink,main_image AS image FROM design_web_videos WHERE main_page_video=1 ORDER BY id DESC LIMIT 8'),
      this.safeRows('SELECT id,name,details,main_image AS image FROM design_web_partners ORDER BY id DESC'),
      this.productRows('WHERE p.is_featured=1 OR p.is_new=1', 'LIMIT 8'),
      this.safeRows("SELECT p.*,t.id AS subscriptionTypeId,t.name AS subscriptionTypeName,t.price AS subscriptionPrice,t.days AS subscriptionDays FROM portal_content_items p LEFT JOIN club_subscription_types t ON t.id=p.subscription_type_id WHERE p.is_active=1 AND (p.content_type<>'membership-plans' OR (t.is_active=1 AND t.apply_to_all_branches=1)) ORDER BY p.content_type,p.display_order,p.id"),
    ]);

    const content = contentRows.reduce<Record<string, ReturnType<typeof publicContent>[]>>((groups, row) => {
      const key = String(row.content_type);
      (groups[key] ??= []).push(publicContent(row));
      return groups;
    }, {});

    return {
      company: company[0] ?? null,
      about: about[0] ? {
        title: about[0].page_title,
        details: about[0].details,
        image: about[0].main_img,
      } : null,
      sliders,
      offers: offers.map((row) => ({ ...row, id: Number(row.id), value: Number(row.value ?? 0) })),
      branches: branches.map((row) => ({ ...row, id: Number(row.id) })),
      classes: classes.map((row) => ({ ...row, id: Number(row.id), classType: Number(row.classType), branchId: Number(row.branchId) })),
      trainers: trainers.map((row) => ({ ...row, id: Number(row.id), gender: Number(row.gender), branchId: Number(row.branchId) })),
      photos: photos.map((row) => ({ ...row, id: Number(row.id), branchId: Number(row.branchId), images: stringValue(row.albumImages).split('||').filter(Boolean) })),
      videos: videos.map((row) => ({ ...row, id: Number(row.id) })),
      partners: partners.map((row) => ({ ...row, id: Number(row.id) })),
      products: products.map(publicProduct),
      content,
    };
  }

  async products() {
    const [rows, categories] = await Promise.all([
      this.productRows('', ''),
      this.safeRows('SELECT id,name,image,display_order AS displayOrder FROM categories ORDER BY display_order,id'),
    ]);
    return {
      items: rows.map(publicProduct),
      categories: categories.map((row) => ({ ...row, id: Number(row.id), displayOrder: Number(row.displayOrder) })),
    };
  }

  async product(id: number) {
    const rows = await this.productRows('WHERE p.id=?', '', id);
    if (!rows[0]) throw new NotFoundException('المنتج غير موجود');
    const product = publicProduct(rows[0]);
    const related = await this.productRows('WHERE p.category_id=? AND p.id<>?', 'LIMIT 4', product.categoryId, id);
    return { ...product, related: related.map(publicProduct) };
  }

  async jobs() {
    const rows = await this.safeRows("SELECT j.ads_id AS id,j.mosama_wazefy_name AS title,j.specialization,j.salary,j.gender,j.age,j.experience_years AS experienceYears,j.ads_start_date AS startDate,j.ads_end_date AS endDate,j.details,j.image,j.branch_id AS branchId,b.branch_name AS branch FROM design_web_job_ads j LEFT JOIN tbl_branches b ON b.branch_id=j.branch_id WHERE j.status='active' AND (j.ads_start_date IS NULL OR j.ads_start_date<=CURDATE()) AND (j.ads_end_date IS NULL OR j.ads_end_date>=CURDATE()) ORDER BY j.ads_id DESC");
    return rows.map((row) => ({ ...row, id: Number(row.id), branchId: row.branchId == null ? null : Number(row.branchId) }));
  }

  async membershipPlans() {
    const rows = await this.safeRows(
      "SELECT p.*,t.id AS subscriptionTypeId,t.name AS subscriptionTypeName,t.price AS subscriptionPrice,t.days AS subscriptionDays FROM portal_content_items p JOIN club_subscription_types t ON t.id=p.subscription_type_id WHERE p.content_type='membership-plans' AND p.is_active=1 AND t.is_active=1 AND t.apply_to_all_branches=1 ORDER BY p.display_order,p.id",
    );
    if (rows.length) return rows.map((row) => ({ ...publicContent(row), subscriptionTypeId: Number(row.subscriptionTypeId), name: row.subscriptionTypeName, price: Number(row.subscriptionPrice), days: Number(row.subscriptionDays) }));
    const types = await this.safeRows('SELECT id,name,price,days FROM club_subscription_types WHERE is_active=1 AND apply_to_all_branches=1 ORDER BY price,id');
    return types.map((type) => ({ id: Number(type.id), title: type.name, subtitle: '', details: '', extraText: '', featured: false, subscriptionTypeId: Number(type.id), subscriptionTypeName: type.name, subscriptionPrice: Number(type.price), subscriptionDays: Number(type.days), name: type.name, price: Number(type.price), days: Number(type.days) }));
  }

  async paymentMethods() {
    const rows = await this.safeRows('SELECT id,name,number,username,image FROM settings_payment_methods WHERE is_active=1 ORDER BY id');
    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      number: row.number,
      username: row.username ?? null,
      image: row.image ?? null,
    }));
  }

  /** Options are resolved from the member record; the client never supplies a branch. */
  async onlineSubscriptionOptions(body: Record<string, unknown>) {
    const member = await this.resolveOnlineSubscriptionMember(body);
    const [plans, paymentMethods] = await Promise.all([
      this.prisma.club_subscription_types.findMany({
        where: { is_active: true, ...subscriptionTypeBranchWhere([member.branch_id]) },
        select: { id: true, name: true, price: true, days: true, is_linked_to_sessions: true },
        orderBy: [{ price: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.settings_payment_methods.findMany({
        where: { is_active: true },
        select: { id: true, name: true, number: true, username: true, image: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    return {
      branchId: member.branch_id,
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        price: Number(plan.price),
        days: plan.days,
        isLinkedToSessions: plan.is_linked_to_sessions,
      })),
      paymentMethods: paymentMethods.map((method) => ({
        id: method.id,
        name: method.name,
        number: method.number,
        username: method.username ?? null,
        image: method.image ?? null,
        // Online requests always include proof of an external payment.
        baseMethod: 'transfer',
      })),
    };
  }

  private async resolveOnlineSubscriptionMember(body: Record<string, unknown>) {
    const memberCode = stringValue(body.memberCode, 30);
    const customerName = stringValue(body.customerName, 200);
    if (!memberCode || customerName.length < 2) {
      throw new BadRequestException('أدخل كود العضو والاسم المسجلين في العضوية');
    }
    const member = await this.prisma.club_members.findFirst({
      where: { member_code: memberCode, is_deleted: false, is_active: true },
      select: { id: true, member_code: true, name: true, branch_id: true },
    });
    if (!member) throw new BadRequestException('كود العضو غير صحيح أو العضوية غير نشطة');
    if (member.name.trim().toLocaleLowerCase('ar') !== customerName.trim().toLocaleLowerCase('ar')) {
      throw new BadRequestException('كود العضو والاسم غير متطابقين');
    }
    return member;
  }

  async createOnlineSubscriptionRequest(body: Record<string, unknown>, paymentProof?: Express.Multer.File) {
    const subscriptionTypeId = positiveInt(body.subscriptionTypeId);
    const paymentMethodId = positiveInt(body.paymentMethodId);
    const startDate = stringValue(body.startDate, 10);
    if (!subscriptionTypeId || !paymentMethodId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new BadRequestException('أكمل بيانات الاشتراك المطلوبة');
    if (!paymentProof) throw new BadRequestException('ارفق صورة الدفع');
    const member = await this.resolveOnlineSubscriptionMember(body);
    const [type, method] = await Promise.all([
      this.prisma.club_subscription_types.findFirst({
        where: { id: subscriptionTypeId, is_active: true },
        select: { id: true, name: true, price: true, days: true, is_linked_to_sessions: true, branch_id: true, apply_to_all_branches: true, branches: { select: { branch_id: true } } },
      }),
      this.prisma.settings_payment_methods.findFirst({ where: { id: paymentMethodId, is_active: true }, select: { id: true, name: true } }),
    ]);
    if (!type || !isSubscriptionTypeAvailableAtBranch(type, member.branch_id)) throw new BadRequestException('الباقة غير متاحة لفرع العضو');
    if (!method) throw new BadRequestException('طريقة الدفع غير متاحة حاليًا');
    const proof = this.uploads.store('online-subscription-proof', paymentProof).path;
    const endDate = resolveSubscriptionEndDate(startDate, type.days, type.is_linked_to_sessions);
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO online_subscription_requests (member_id,member_code,customer_name,branch_id,subscription_type_id,subscription_type_name,subscription_value,duration_days,requested_start_date,requested_end_date,payment_method_id,payment_method_name,payment_base_method,payment_proof_path,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      member.id, member.member_code, member.name, member.branch_id, type.id, type.name, Number(type.price), type.days, startDate, endDate, method.id, method.name, 'transfer', proof, stringValue(body.notes, 5000) || null,
    );
    return { success: true, message: 'تم إرسال طلب الاشتراك بنجاح' };
  }

  async jobApplication(
    body: Record<string, unknown>,
    files?: { cv?: Express.Multer.File[]; personalImage?: Express.Multer.File[] },
  ) {
    const jobId = positiveInt(body.jobId);
    const firstName = stringValue(body.firstName, 150);
    const lastName = stringValue(body.lastName, 150);
    const mobile = stringValue(body.mobile, 30);
    const email = stringValue(body.email, 255).toLowerCase();
    if (!jobId || firstName.length < 2 || !phonePattern.test(mobile)) {
      throw new BadRequestException('اختر الوظيفة واكتب الاسم ورقم موبايل مصري صحيح');
    }
    if (email && !emailPattern.test(email)) throw new BadRequestException('البريد الإلكتروني غير صحيح');
    const jobs = await this.safeRows(
      "SELECT ads_id AS id FROM design_web_job_ads WHERE ads_id=? AND status='active' AND (ads_start_date IS NULL OR ads_start_date<=CURDATE()) AND (ads_end_date IS NULL OR ads_end_date>=CURDATE()) LIMIT 1",
      jobId,
    );
    if (!jobs[0]) throw new BadRequestException('الوظيفة غير متاحة حاليًا');
    const cvFile = files?.cv?.[0];
    if (!cvFile) throw new BadRequestException('ارفق السيرة الذاتية بصيغة PDF أو Word');
    const cv = this.uploads.store('job-cv', cvFile).path;
    const personalImage = files?.personalImage?.[0]
      ? this.uploads.store('job-photo', files.personalImage[0]).path
      : null;
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO users_applications (job_id_fk,fname,lname,birth_date,birth_place,status,religious,mobile,phone,address,email,degree,university_school,city,start_learn,end_learn,specalize,language,level,writing,skills,about_job,cv,personal_image,datetime,approved) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)',
      jobId,
      firstName,
      lastName || null,
      stringValue(body.birthDate, 20) || null,
      stringValue(body.birthPlace, 255) || null,
      stringValue(body.maritalStatus, 100) || null,
      stringValue(body.religion, 100) || null,
      mobile,
      stringValue(body.phone, 30) || null,
      stringValue(body.address, 2000) || null,
      email || null,
      stringValue(body.degree, 255) || null,
      stringValue(body.university, 255) || null,
      stringValue(body.city, 255) || null,
      stringValue(body.studyStart, 20) || null,
      stringValue(body.studyEnd, 20) || null,
      stringValue(body.specialization, 255) || null,
      stringValue(body.language, 255) || null,
      stringValue(body.languageLevel, 100) || null,
      stringValue(body.writingLevel, 100) || null,
      stringValue(body.skills, 5000) || null,
      stringValue(body.aboutJob, 5000) || null,
      cv,
      personalImage,
      String(Math.floor(Date.now() / 1000)),
    );
    return { success: true, message: 'تم إرسال طلب التوظيف بنجاح' };
  }

  async contact(body: Record<string, unknown>) {
    const name = stringValue(body.name, 255);
    const phone = stringValue(body.phone, 30);
    const email = stringValue(body.email, 255);
    const message = stringValue(body.message, 5000);
    if (name.length < 3 || !phone || !message) throw new BadRequestException('الاسم ورقم الهاتف والرسالة مطلوبة');
    if (email && !emailPattern.test(email)) throw new BadRequestException('البريد الإلكتروني غير صحيح');
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO design_web_contact_us (name,phone,email,message,date_add,date_add_s,date_add_ar,seen) VALUES (?,?,?,?,NOW(),DATE_FORMAT(NOW(),\'%Y-%m-%d\'),DATE_FORMAT(NOW(),\'%Y-%m-%d\'),0)',
      name, phone, email || null, message,
    );
    return { success: true, message: 'تم إرسال رسالتك بنجاح، سنتواصل معك قريبًا' };
  }

  async membershipLead(body: Record<string, unknown>) {
    const name = stringValue(body.name, 255);
    const phone = stringValue(body.phone, 30);
    const branchId = positiveInt(body.branchId);
    if (name.length < 3 || !phonePattern.test(phone)) throw new BadRequestException('اكتب الاسم ورقم موبايل مصري صحيح');
    const branches = await this.safeRows('SELECT branch_id AS id,branch_name AS name FROM tbl_branches WHERE branch_id=?', branchId);
    if (!branches[0]) throw new BadRequestException('اختر فرعًا صحيحًا من فروع النظام');
    return this.contact({
      name,
      phone,
      email: body.email,
      message: `[طلب اشتراك جديد] الفرع: ${branches[0].name}${body.message ? ` — ${stringValue(body.message, 2000)}` : ''}`,
    });
  }

  async register(body: Record<string, unknown>) {
    const fullName = stringValue(body.fullName, 255);
    const phone = stringValue(body.phone, 20);
    const email = stringValue(body.email, 255).toLowerCase();
    const password = stringValue(body.password, 200);
    if (fullName.length < 3) throw new BadRequestException('الاسم يجب ألا يقل عن 3 أحرف');
    if (!phonePattern.test(phone)) throw new BadRequestException('رقم الموبايل غير صحيح');
    if (email && !emailPattern.test(email)) throw new BadRequestException('البريد الإلكتروني غير صحيح');
    if (password.length < 6) throw new BadRequestException('كلمة المرور يجب ألا تقل عن 6 أحرف');

    const existing = await this.safeRows('SELECT id,email,password FROM web_users WHERE phone=? OR (?<>\'\' AND email=?) ORDER BY id LIMIT 1', phone, email, email);
    const hash = await bcrypt.hash(password, this.config.get<number>('bcryptRounds') ?? 12);
    let id: number;
    if (existing[0]) {
      if (existing[0].password) throw new ConflictException('رقم الهاتف أو البريد مسجل من قبل');
      if (existing[0].email && email && String(existing[0].email).toLowerCase() !== email) {
        throw new ConflictException('هذا الرقم مرتبط بطلب سابق؛ تواصل معنا لتفعيل الحساب بأمان');
      }
      id = Number(existing[0].id);
      await this.prisma.$executeRawUnsafe(
        'UPDATE web_users SET full_name=?,email=COALESCE(NULLIF(?,\'\'),email),password=?,is_active=1,updated_at=NOW() WHERE id=?',
        fullName, email, hash, id,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        'INSERT INTO web_users (full_name,phone,email,password,governorate,city_street,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,NOW(),NOW())',
        fullName, phone, email || null, hash, stringValue(body.governorate, 100) || null, stringValue(body.cityStreet, 2000) || null,
      );
      const inserted = await this.safeRows('SELECT id FROM web_users WHERE phone=? ORDER BY id DESC LIMIT 1', phone);
      id = Number(inserted[0].id);
    }
    return this.authResult(id);
  }

  async login(body: Record<string, unknown>) {
    const identity = stringValue(body.identity, 255).toLowerCase();
    const password = stringValue(body.password, 200);
    if (!identity || !password) throw new BadRequestException('رقم الهاتف/البريد وكلمة المرور مطلوبان');
    const rows = await this.safeRows('SELECT id,password,is_active FROM web_users WHERE phone=? OR LOWER(email)=? ORDER BY id LIMIT 1', identity, identity);
    const user = rows[0];
    if (!user?.password || Number(user.is_active) !== 1) throw new UnauthorizedException('بيانات تسجيل الدخول غير صحيحة');
    const stored = String(user.password).replace(/^\$2y\$/, '$2b$');
    if (!(await bcrypt.compare(password, stored))) throw new UnauthorizedException('بيانات تسجيل الدخول غير صحيحة');
    return this.authResult(Number(user.id));
  }

  async account(userId: number) {
    const rows = await this.safeRows('SELECT id,account_type AS accountType,member_code AS memberCode,full_name AS fullName,phone,email,governorate,city_street AS cityStreet,discount_rate AS discountRate,discount_start AS discountStart,discount_end AS discountEnd,discount_active AS discountActive FROM web_users WHERE id=? AND is_active=1', userId);
    if (!rows[0]) throw new UnauthorizedException('الحساب غير متاح');
    const user = rows[0];
    return { ...user, id: Number(user.id), discountRate: this.activeDiscount(user) };
  }

  async accountOrders(userId: number) {
    const rows = await this.safeRows('SELECT id,full_name AS fullName,phone,total,status,payment_method AS paymentMethod,created_at AS createdAt FROM orders WHERE user_id=? ORDER BY id DESC', userId);
    return rows.map((row) => ({ ...row, id: Number(row.id), total: Number(row.total) }));
  }

  async accountOrder(userId: number, orderId: number) {
    const rows = await this.safeRows('SELECT * FROM orders WHERE id=? AND user_id=?', orderId, userId);
    if (!rows[0]) throw new NotFoundException('الطلب غير موجود');
    const items = await this.safeRows('SELECT id,product_id AS productId,product_name AS productName,quantity,price,line_total AS lineTotal FROM order_items WHERE order_id=? ORDER BY id', orderId);
    return {
      ...rows[0],
      id: Number(rows[0].id),
      subtotal: Number(rows[0].subtotal),
      shipping_cost: Number(rows[0].shipping_cost),
      total: Number(rows[0].total),
      items: items.map((item) => ({ ...item, id: Number(item.id), productId: Number(item.productId), quantity: Number(item.quantity), price: Number(item.price), lineTotal: Number(item.lineTotal) })),
    };
  }

  async validateCoupon(body: Record<string, unknown>, authorization?: string) {
    const customer = await this.optionalCustomer(authorization);
    const lines = this.cartLines(body.items);
    const priced = await this.priceCart(this.prisma, lines, customer?.sub);
    const coupon = await this.coupon(stringValue(body.code, 50));
    const discount = this.money(priced.subtotal * coupon.rate / 100);
    return {
      valid: true,
      code: coupon.code,
      rate: coupon.rate,
      discount,
      customerDiscountRate: priced.customerDiscountRate,
      subtotal: priced.subtotal,
      total: this.money(Math.max(0, priced.subtotal - discount)),
    };
  }

  async createOrder(body: Record<string, unknown>, authorization?: string, paymentProof?: Express.Multer.File) {
    const customer = await this.optionalCustomer(authorization);
    const fullName = stringValue(body.fullName, 255);
    const country = stringValue(body.country, 100) || 'مصر';
    const governorate = stringValue(body.governorate, 100);
    const cityStreet = stringValue(body.cityStreet, 3000);
    const phone = stringValue(body.phone, 30);
    const backupPhone = stringValue(body.backupPhone, 30);
    const email = stringValue(body.email, 255).toLowerCase();
    const notes = stringValue(body.notes, 5000);
    const paymentMethod = stringValue(body.paymentMethod, 40) || 'cod';
    if (fullName.length < 3 || !country || !governorate || !cityStreet) throw new BadRequestException('أكمل الاسم والعنوان والمحافظة');
    if (!phonePattern.test(phone)) throw new BadRequestException('رقم الموبايل غير صحيح');
    if (backupPhone && !phonePattern.test(backupPhone)) throw new BadRequestException('رقم الهاتف الاحتياطي غير صحيح');
    if (email && !emailPattern.test(email)) throw new BadRequestException('البريد الإلكتروني غير صحيح');
    if (!['cod', 'vodafone_cash', 'instapay'].includes(paymentMethod)) throw new BadRequestException('طريقة الدفع غير صحيحة');
    if (paymentMethod !== 'cod' && !paymentProof) throw new BadRequestException('ارفق صورة التحويل لتأكيد الطلب');
    const lines = this.cartLines(body.items);

    return this.prisma.$transaction(async (tx) => {
      const priced = await this.priceCart(tx, lines, customer?.sub, true);
      const couponCode = stringValue(body.couponCode, 50);
      const coupon = couponCode ? await this.coupon(couponCode, tx) : null;
      const couponDiscount = coupon ? this.money(priced.subtotal * coupon.rate / 100) : 0;
      const subtotalAfterDiscount = this.money(Math.max(0, priced.subtotal - couponDiscount));
      const shippingCost = 0;
      const total = this.money(subtotalAfterDiscount + shippingCost);

      const duplicate = await this.duplicateOrder(tx, phone, total, priced.items);
      if (duplicate) return {
        success: true,
        duplicate: true,
        orderId: duplicate,
        total,
        status: 'pending',
        message: 'تم إرسال الطلب، وهو قيد المراجعة وسوف يتم الرد عليك.',
      };

      let userId = customer?.sub ?? null;
      if (userId) {
        await tx.$executeRawUnsafe('UPDATE web_users SET full_name=?,phone=?,email=COALESCE(NULLIF(?,\'\'),email),governorate=?,city_street=?,updated_at=NOW() WHERE id=?', fullName, phone, email, governorate, cityStreet, userId);
      } else {
        const existing = await tx.$queryRawUnsafe<Row[]>('SELECT id,password FROM web_users WHERE phone=? ORDER BY id LIMIT 1 FOR UPDATE', phone);
        if (existing[0]) {
          userId = Number(existing[0].id);
          if (!existing[0].password) {
            await tx.$executeRawUnsafe('UPDATE web_users SET full_name=?,email=COALESCE(NULLIF(?,\'\'),email),governorate=?,city_street=?,updated_at=NOW() WHERE id=?', fullName, email, governorate, cityStreet, userId);
          }
        } else {
          await tx.$executeRawUnsafe('INSERT INTO web_users (full_name,phone,email,password,governorate,city_street,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,NOW(),NOW())', fullName, phone, email || null, null, governorate, cityStreet);
          const inserted = await tx.$queryRawUnsafe<Row[]>('SELECT LAST_INSERT_ID() AS id');
          userId = Number(inserted[0].id);
        }
      }

      const paymentProofPath = paymentProof ? this.uploads.store('store-payment-proof', paymentProof).path : null;
      await tx.$executeRawUnsafe(
        'INSERT INTO orders (user_id,full_name,country,governorate,city_street,phone,backup_phone,email,order_notes,payment_method,payment_status,payment_proof_path,coupon_code,coupon_id,coupon_percentage,coupon_discount_amount,captain_id,subtotal,shipping_cost,total,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,\'pending\',NOW(),NOW())',
        userId, fullName, country, governorate, cityStreet, phone, backupPhone || null, email || null, notes || null, paymentMethod, 'pending', paymentProofPath,
        coupon?.code ?? null, coupon?.id ?? null, coupon?.rate ?? 0, couponDiscount, coupon?.captainId ?? null,
        subtotalAfterDiscount, shippingCost, total,
      );
      const inserted = await tx.$queryRawUnsafe<Row[]>('SELECT LAST_INSERT_ID() AS id');
      const orderId = Number(inserted[0].id);

      for (const item of priced.items) {
        const changed = await tx.$executeRawUnsafe(
          "UPDATE products SET current_stock=current_stock-?,stock_status=IF(current_stock-?<=0,'out_of_stock','in_stock') WHERE id=? AND current_stock>=?",
          item.quantity, item.quantity, item.productId, item.quantity,
        );
        if (Number(changed) !== 1) throw new ConflictException(`الكمية المتاحة من ${item.name} تغيرت؛ راجع السلة`);
        await tx.$executeRawUnsafe(
          'INSERT INTO order_items (order_id,product_id,product_name,quantity,price,line_total,created_at) VALUES (?,?,?,?,?,?,NOW())',
          orderId, item.productId, item.name, item.quantity, item.unitPrice, item.lineTotal,
        );
      }
      return { success: true, duplicate: false, orderId, subtotal: subtotalAfterDiscount, shippingCost, total, couponDiscount, status: 'pending', message: 'تم إرسال الطلب، وهو قيد المراجعة وسوف يتم الرد عليك.' };
    }, { timeout: 15_000 });
  }

  private cartLines(value: unknown): CartLine[] {
    if (!Array.isArray(value) || value.length === 0) throw new BadRequestException('سلة المشتريات فارغة');
    const merged = new Map<number, number>();
    for (const raw of value.slice(0, 50)) {
      const item = raw as Record<string, unknown>;
      const productId = positiveInt(item.productId);
      const quantity = positiveInt(item.quantity);
      if (!productId || !quantity || quantity > 99) throw new BadRequestException('بيانات منتج أو كمية غير صحيحة');
      merged.set(productId, (merged.get(productId) ?? 0) + quantity);
    }
    if ([...merged.values()].some((quantity) => quantity > 99)) throw new BadRequestException('الكمية المطلوبة من منتج واحد كبيرة جدًا');
    return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
  }

  private async priceCart(client: PrismaService | Prisma.TransactionClient, lines: CartLine[], userId?: number, lock = false) {
    const ids = lines.map((line) => line.productId);
    const rows = await client.$queryRawUnsafe<Row[]>(
      `SELECT id,name,current_stock,stock_status,price,image FROM products WHERE id IN (${ids.map(() => '?').join(',')})${lock ? ' FOR UPDATE' : ''}`,
      ...ids,
    );
    if (rows.length !== ids.length) throw new BadRequestException('أحد منتجات السلة لم يعد متاحًا');
    const customerDiscountRate = userId ? await this.customerDiscount(userId, client) : 0;
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    const items: PricedLine[] = lines.map((line) => {
      const row = byId.get(line.productId)!;
      const stock = Number(row.current_stock ?? 0);
      if (row.stock_status === 'out_of_stock' || stock < line.quantity) throw new ConflictException(`الكمية المتاحة من ${row.name} هي ${Math.max(0, stock)} فقط`);
      const basePrice = Number(row.price);
      const unitPrice = this.money(basePrice * (1 - customerDiscountRate / 100));
      return { productId: line.productId, name: row.name, image: row.image, quantity: line.quantity, unitPrice, lineTotal: this.money(unitPrice * line.quantity), stock };
    });
    return { items, customerDiscountRate, subtotal: this.money(items.reduce((sum, item) => sum + item.lineTotal, 0)) };
  }

  private async customerDiscount(userId: number, client: PrismaService | Prisma.TransactionClient) {
    const rows = await client.$queryRawUnsafe<Row[]>('SELECT discount_rate AS discountRate,discount_start AS discountStart,discount_end AS discountEnd,discount_active AS discountActive FROM web_users WHERE id=? AND is_active=1', userId);
    return this.activeDiscount(rows[0]);
  }

  private activeDiscount(user?: Row) {
    if (!user || !Number(user.discountActive)) return 0;
    const today = new Date().toISOString().slice(0, 10);
    if (user.discountStart && String(user.discountStart).slice(0, 10) > today) return 0;
    if (user.discountEnd && String(user.discountEnd).slice(0, 10) < today) return 0;
    return Math.min(100, Math.max(0, Number(user.discountRate ?? 0)));
  }

  private async coupon(code: string, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    if (!code) throw new BadRequestException('اكتب كود الخصم');
    const rows = await client.$queryRawUnsafe<Row[]>('SELECT id,discount_code AS code,discount_rate AS rate,captain_id AS captainId FROM tbl_store_captain_discounts WHERE UPPER(discount_code)=UPPER(?) AND status=1 LIMIT 1', code);
    if (!rows[0] || numeric(rows[0].rate) <= 0) throw new BadRequestException('كود الخصم غير صحيح أو غير مفعل');
    return { id: Number(rows[0].id), code: rows[0].code, rate: Number(rows[0].rate), captainId: rows[0].captainId == null ? null : Number(rows[0].captainId) };
  }

  private async duplicateOrder(client: Prisma.TransactionClient, phone: string, total: number, items: PricedLine[]) {
    const rows = await client.$queryRawUnsafe<Row[]>("SELECT id FROM orders WHERE phone=? AND total=? AND status='pending' AND created_at>=DATE_SUB(NOW(),INTERVAL 2 MINUTE) ORDER BY id DESC", phone, total);
    const signature = items.map((item) => `${item.productId}:${item.quantity}`).sort().join('|');
    for (const row of rows) {
      const saved = await client.$queryRawUnsafe<Row[]>('SELECT product_id AS productId,quantity FROM order_items WHERE order_id=? ORDER BY product_id', row.id);
      const savedSignature = saved.map((item) => `${Number(item.productId)}:${Number(item.quantity)}`).sort().join('|');
      if (signature === savedSignature) return Number(row.id);
    }
    return null;
  }

  private async optionalCustomer(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<PortalCustomerClaims>(token, { secret: this.config.get<string>('jwt.accessSecret') });
      if (payload.type !== 'portal-customer') return null;
      const rows = await this.safeRows('SELECT id FROM web_users WHERE id=? AND is_active=1', payload.sub);
      return rows[0] ? payload : null;
    } catch {
      return null;
    }
  }

  private async authResult(id: number) {
    const rows = await this.safeRows('SELECT id,full_name AS fullName,phone,email FROM web_users WHERE id=? AND is_active=1', id);
    if (!rows[0]) throw new UnauthorizedException('الحساب غير متاح');
    const user: Row = { ...rows[0], id: Number(rows[0].id) };
    const claims: PortalCustomerClaims = { sub: user.id, type: 'portal-customer', name: user.fullName, phone: user.phone };
    const accessToken = await this.jwt.signAsync(claims, { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: '7d' });
    return { accessToken, user };
  }

  private async productRows(where: string, suffix: string, ...params: unknown[]) {
    try {
      return await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT p.*,c.name AS category_name,b.name AS badge_name,b.background_color,b.text_color,GROUP_CONCAT(DISTINCT pi.image_path ORDER BY pi.display_order SEPARATOR '||') AS images FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN tbl_badge_settings b ON b.id=p.selected_badge AND b.is_active=1 LEFT JOIN product_images pi ON pi.product_id=p.id ${where} GROUP BY p.id ORDER BY p.display_order,p.id DESC ${suffix}`,
        ...params,
      );
    } catch (error: any) {
      // A partially migrated production database may have the core products table
      // before the optional category, badge, or gallery tables. Do not hide every
      // product just because one of those presentation joins is unavailable.
      if (error?.code !== 'P2010') throw error;
      return this.safeRows(
        `SELECT p.*,'' AS category_name,NULL AS badge_name,NULL AS background_color,NULL AS text_color,p.image AS images FROM products p ${where} ORDER BY p.display_order,p.id DESC ${suffix}`,
        ...params,
      );
    }
  }

  private async safeRows(sql: string, ...params: unknown[]): Promise<Row[]> {
    try {
      return await this.prisma.$queryRawUnsafe<Row[]>(sql, ...params);
    } catch (error: any) {
      if (error?.code === 'P2010' && String(error?.meta?.message ?? '').includes("doesn't exist")) return [];
      throw error;
    }
  }

  private money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
}
