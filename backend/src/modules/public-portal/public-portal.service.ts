import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
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

export function cairoCalendarDay(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
    displayOrder: Number(row.display_order ?? 0),
    badge: positiveInt(row.badge_id)
      ? {
          id: positiveInt(row.badge_id),
          name: stringValue(row.badge_name, 150),
          nameEn: stringValue(row.badge_name_en, 150),
          type: stringValue(row.badge_type, 30),
          backgroundColor: stringValue(row.background_color, 20),
          textColor: stringValue(row.text_color, 20),
        }
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

  async home(now: Date = new Date()) {
    const businessDay = cairoCalendarDay(now);
    const [company, about, sliders, offers, branches, classes, trainers, photos, videos, heroVideos, partners, products, contentRows] = await Promise.all([
      this.safeRows('SELECT * FROM conf_company_data ORDER BY id_config DESC LIMIT 1'),
      this.safeRows('SELECT * FROM design_web_about ORDER BY id DESC LIMIT 1'),
      this.safeRows('SELECT id,title,slug_title,details,main_image,date FROM design_web_slider ORDER BY id DESC'),
      this.safeRows("SELECT offer_id AS id,offer_name AS title,sub_title AS subtitle,from_date AS fromDate,to_date AS toDate,offer_value AS value,offer_details AS details,image FROM tbl_offers WHERE status='activ' AND (from_date IS NULL OR from_date='' OR DATE(from_date)<=?) AND (to_date IS NULL OR to_date='' OR DATE(to_date)>=?) ORDER BY offer_id DESC LIMIT 8", businessDay, businessDay),
      this.safeRows("SELECT b.branch_id AS id,b.branch_name AS name,p.address,p.mob1,p.mob2,COALESCE(NULLIF(p.lat_map,''),g.lat_map) AS lat,COALESCE(NULLIF(p.lang_map,''),g.long_map) AS lng FROM tbl_branches b LEFT JOIN portal_branch_profiles p ON p.branch_id=b.branch_id LEFT JOIN branch_settings g ON g.title=b.branch_name ORDER BY b.branch_id"),
      this.safeRows('SELECT c.id,c.class_title AS title,c.class_type AS classType,c.day,c.time,c.date,c.branch_id AS branchId,b.branch_name AS branch FROM design_web_classes c LEFT JOIN tbl_branches b ON b.branch_id=c.branch_id ORDER BY c.branch_id,c.class_type,c.day,c.time'),
      this.safeRows('SELECT t.id,t.title,t.job_title AS jobTitle,t.main_image AS image,t.gender,t.date,t.branch_id AS branchId,b.branch_name AS branch FROM design_web_projects t LEFT JOIN tbl_branches b ON b.branch_id=t.branch_id ORDER BY t.id DESC'),
      this.safeRows("SELECT p.id,p.title,p.details,p.main_image AS image,p.date,p.branch_id AS branchId,b.branch_name AS branch,GROUP_CONCAT(DISTINCT pi.images_name ORDER BY pi.images_id SEPARATOR '||') AS albumImages FROM design_web_photos p LEFT JOIN tbl_branches b ON b.branch_id=p.branch_id LEFT JOIN design_web_photos_images pi ON pi.photos_id_fk=p.id GROUP BY p.id ORDER BY p.id DESC LIMIT 18"),
      this.safeRows('SELECT id,title,slug_title AS subtitle,video_link AS videoLink,main_image AS image,date,main_page_video AS mainPageVideo FROM design_web_videos WHERE main_page_video=1 ORDER BY id DESC LIMIT 8'),
      this.safeRows('SELECT v.id,v.title,v.branch_id AS branchId,b.branch_name AS branch,v.date,v.video_link AS videoLink,v.main_image AS image,v.main_page_video AS mainPageVideo FROM design_web_slider_videos v LEFT JOIN tbl_branches b ON b.branch_id=v.branch_id WHERE v.main_page_video=1 ORDER BY v.id DESC'),
      this.safeRows('SELECT id,name,details,main_image AS image FROM design_web_partners ORDER BY id DESC'),
      this.productRows('WHERE p.is_featured=1 OR p.is_new=1', 'LIMIT 8'),
      this.safeRows("SELECT * FROM portal_content_items WHERE is_active=1 AND content_type NOT IN ('ticker','membership-plans') ORDER BY content_type,display_order,id"),
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
      videos: videos.map((row) => ({ ...row, id: Number(row.id), mainPageVideo: Boolean(row.mainPageVideo) })),
      heroVideos: heroVideos.map((row) => ({
        id: Number(row.id),
        title: stringValue(row.title, 255),
        branchId: row.branchId == null ? null : positiveInt(row.branchId) || null,
        branch: stringValue(row.branch, 255),
        date: stringValue(row.date, 40),
        videoLink: stringValue(row.videoLink, 1000),
        image: row.image == null ? null : stringValue(row.image, 1000) || null,
        mainPageVideo: Boolean(row.mainPageVideo),
      })),
      partners: partners.map((row) => ({ ...row, id: Number(row.id) })),
      products: products.map(publicProduct),
      content,
    };
  }

  async products() {
    const [rows, categories] = await Promise.all([
      this.productRows('', ''),
      this.safeRows('SELECT id,name,icon_class AS iconClass,image,display_order AS displayOrder FROM categories ORDER BY display_order,id'),
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
    // A matching phone/email is not proof of ownership of guest order history.
    // Existing guest records require assisted verification before activation.
    if (existing[0]) throw new ConflictException('رقم الهاتف أو البريد مسجل من قبل؛ تواصل معنا لتفعيل الحساب بأمان');
    const hash = await bcrypt.hash(password, this.config.get<number>('bcryptRounds') ?? 12);
    const created = await this.prisma.web_users.create({
      data: { full_name: fullName, phone, email: email || null, password: hash,
        governorate: stringValue(body.governorate, 100) || null,
        city_street: stringValue(body.cityStreet, 2000) || null, is_active: 1 },
      select: { id: true },
    });
    return this.authResult(created.id);
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

  async createOrder(body: Record<string, unknown>, authorization?: string) {
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
    if (paymentMethod !== 'cod') throw new BadRequestException('الدفع الإلكتروني لم يُفعّل بعد؛ اختر الدفع عند الاستلام');
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
      if (duplicate) return { success: true, duplicate: true, orderId: duplicate, total };

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

      await tx.$executeRawUnsafe(
        'INSERT INTO orders (user_id,full_name,country,governorate,city_street,phone,backup_phone,email,order_notes,payment_method,coupon_code,coupon_id,coupon_percentage,coupon_discount_amount,captain_id,subtotal,shipping_cost,total,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,\'pending\',NOW(),NOW())',
        userId, fullName, country, governorate, cityStreet, phone, backupPhone || null, email || null, notes || null, paymentMethod,
        coupon?.code ?? null, coupon?.id ?? null, coupon?.rate ?? 0, couponDiscount, coupon?.captainId ?? null,
        subtotalAfterDiscount, shippingCost, total,
      );
      const inserted = await tx.$queryRawUnsafe<Row[]>('SELECT LAST_INSERT_ID() AS id');
      const orderId = Number(inserted[0].id);

      for (const item of priced.items) {
        const changed = await tx.$executeRawUnsafe(
          "UPDATE products SET stock_status=IF(current_stock-?<=0,'out_of_stock','in_stock'),current_stock=current_stock-? WHERE id=? AND current_stock>=?",
          item.quantity, item.quantity, item.productId, item.quantity,
        );
        if (Number(changed) !== 1) throw new ConflictException(`الكمية المتاحة من ${item.name} تغيرت؛ راجع السلة`);
        await tx.$executeRawUnsafe(
          'INSERT INTO order_items (order_id,product_id,product_name,quantity,price,line_total,created_at) VALUES (?,?,?,?,?,?,NOW())',
          orderId, item.productId, item.name, item.quantity, item.unitPrice, item.lineTotal,
        );
      }
      return { success: true, duplicate: false, orderId, subtotal: subtotalAfterDiscount, shippingCost, total, couponDiscount };
    }, { timeout: 15_000 });
  }

  private cartLines(value: unknown): CartLine[] {
    if (!Array.isArray(value) || value.length === 0) throw new BadRequestException('سلة المشتريات فارغة');
    if (value.length > 50) throw new BadRequestException('السلة تتجاوز الحد الأقصى لعدد المنتجات');
    const merged = new Map<number, number>();
    for (const raw of value) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('بيانات منتج أو كمية غير صحيحة');
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
        `SELECT p.*,c.name AS category_name,b.id AS badge_id,b.name AS badge_name,b.name_en AS badge_name_en,b.badge_type AS badge_type,b.background_color,b.text_color,GROUP_CONCAT(DISTINCT pi.image_path ORDER BY pi.display_order SEPARATOR '||') AS images FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN tbl_badge_settings b ON b.id=p.selected_badge AND b.is_active=1 LEFT JOIN product_images pi ON pi.product_id=p.id ${where} GROUP BY p.id ORDER BY p.display_order,p.id DESC ${suffix}`,
        ...params,
      );
    } catch (error: any) {
      // A partially migrated production database may have the core products table
      // before the optional category, badge, or gallery tables. Do not hide every
      // product just because one of those presentation joins is unavailable.
      if (error?.code !== 'P2010') throw error;
      return this.safeRows(
        `SELECT p.*,'' AS category_name,NULL AS badge_id,NULL AS badge_name,NULL AS badge_name_en,NULL AS badge_type,NULL AS background_color,NULL AS text_color,p.image AS images FROM products p ${where} ORDER BY p.display_order,p.id DESC ${suffix}`,
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
