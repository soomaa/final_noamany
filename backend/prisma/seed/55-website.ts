/* eslint-disable no-console */
/** Public website and portal demo content for all seeded branches. */
import {
  prisma, clearTables, getBranchIds, getUsers, BASE, addDays, ymd, log,
} from './_shared';

const IMAGE = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1200&q=80';

export async function seedWebsite(): Promise<void> {
  console.log('▶ Website and portal content…');

  await clearTables([
    'users_applications', 'design_web_job_ads_files', 'design_web_job_ads',
    'design_web_contact_us', 'design_web_classes', 'design_web_projects',
    'design_web_slider_videos', 'design_web_videos', 'design_web_photos_images',
    'design_web_photos', 'portal_branch_profiles', 'design_web_about',
    'design_web_systems', 'design_web_partners', 'design_web_slider',
    'portal_records', 'portal_settings',
  ]);

  const branchIds = await getBranchIds();
  const users = await getUsers();
  const publisher = users[0]?.user_id ?? 1;
  const today = ymd(BASE);

  await prisma.portal_settings.createMany({
    data: [
      { setting_key: 'site_identity', data: { name: 'Noamany Fitness Center', slogan: 'حياة صحية أقوى كل يوم' }, updated_by: publisher },
      { setting_key: 'home_hero', data: { title: 'ابدأ رحلتك الرياضية معنا', subtitle: 'تدريب، متابعة، وخدمات متكاملة في فروعنا' }, updated_by: publisher },
      { setting_key: 'contact', data: { phone: '01000000000', email: 'info@noamanycenter.test' }, updated_by: publisher },
    ],
  });

  await prisma.design_web_about.create({
    data: {
      page_title: 'عن Noamany Fitness Center',
      details: 'مركز رياضي متكامل يقدم التدريب والاشتراكات والخدمات الصحية في بيئة آمنة ومحفزة.',
      main_img: IMAGE, date_add: today, date_add_s: today, date_add_ar: today, publisher: 'مدير النظام',
    },
  });

  for (const title of ['إدارة الاشتراكات', 'حجز الحصص والتدريب', 'متابعة التقدم الرياضي']) {
    await prisma.design_web_systems.create({
      data: { title, slug_title: title.replace(/\s+/g, '-'), details: `خدمة ${title} متاحة لجميع فروع المركز.`, type: 1, publisher: 'مدير النظام' },
    });
  }
  for (const name of ['شريك التغذية الصحية', 'شريك المعدات الرياضية', 'شريك التأمين الطبي']) {
    await prisma.design_web_partners.create({
      data: { name, details: `تعاون موثوق مع ${name}.`, main_image: IMAGE, date: today, date_ar: today, publisher: 'مدير النظام' },
    });
  }
  for (const title of ['عروض الاشتراك الموسمية', 'تدريب يناسب أهدافك', 'مجتمع رياضي متكامل']) {
    await prisma.design_web_slider.create({
      data: { title, slug_title: title.replace(/\s+/g, '-'), details: `${title} في Noamany Fitness Center`, main_image: IMAGE, date: today, date_ar: today, publisher: 'مدير النظام' },
    });
  }
  await prisma.design_web_videos.create({
    data: { title: 'جولة في المركز', slug_title: 'club-tour', video_link: 'https://www.youtube.com/embed/Scxs7L0vhZ4', main_page_video: 1, main_image: IMAGE, date: today, date_ar: today, publisher: 'مدير النظام' },
  });

  for (let index = 0; index < branchIds.length; index++) {
    const branchId = branchIds[index];
    const city = index === 0 || index === 3 ? 'طنطا، الغربية' : 'شبين الكوم، المنوفية';
    await prisma.portal_branch_profiles.create({
      data: { branch_id: branchId, address: `عنوان تجريبي: ${city}`, mob1: `0100000000${index + 1}`, lat_map: '30.7865', lang_map: '30.9985', publisher },
    });
    const photo = await prisma.design_web_photos.create({
      data: { title: `أجواء التدريب في الفرع ${index + 1}`, main_image: IMAGE, date: today, date_ar: today, branch_id: branchId, details: 'صالة مجهزة ومناطق تدريب متنوعة.', publisher: 'مدير النظام' },
    });
    await prisma.design_web_photos_images.createMany({
      data: [
        { photos_id_fk: photo.id, images_name: IMAGE },
        { photos_id_fk: photo.id, images_name: `${IMAGE}&ixid=${index + 1}` },
      ],
    });
    await prisma.design_web_projects.create({
      data: { title: `برنامج تحول صحي - الفرع ${index + 1}`, job_title: 'برنامج لياقة شامل', main_image: IMAGE, date: today, date_ar: today, branch_id: branchId, gender: index % 2, publisher: 'مدير النظام' },
    });
    await prisma.design_web_classes.create({
      data: { branch_id: branchId, class_type: 1, price: 150, date: today, date_ar: today, class_title: `حصة لياقة جماعية - الفرع ${index + 1}`, day: 'السبت والثلاثاء', time: '18:00', publisher: 'مدير النظام' },
    });
    await prisma.design_web_slider_videos.create({
      data: { title: `تعرف على الفرع ${index + 1}`, branch_id: branchId, video_link: 'https://www.youtube.com/embed/Scxs7L0vhZ4', main_page_video: 1, main_image: IMAGE, date: today, date_ar: today, publisher: 'مدير النظام' },
    });
    const job = await prisma.design_web_job_ads.create({
      data: { mosama_wazefy_name: 'مدرب لياقة بدنية', specialization: 'تدريب شخصي وجماعي', salary: 'راتب تنافسي', gender: 'all', experience_years: 'سنتان', ads_added_date: BASE, ads_added_time: '09:00:00', ads_start_date: BASE, ads_end_date: addDays(BASE, 30), details: 'فرصة عمل تجريبية ضمن فريق المركز.', image: IMAGE, user_id: publisher, status: 'active', branch_id: branchId },
    });
    await prisma.design_web_job_ads_files.create({
      data: { ads_id_fk: job.ads_id, file: '/uploads/demo/job-description.pdf', file_date: BASE, file_date_st: today, file_time: BASE },
    });
    await prisma.portal_records.create({
      data: { record_type: 'branch_highlight', title: `مميزات الفرع ${index + 1}`, branch_id: branchId, data: { image: IMAGE, city, features: ['تدريب', 'متابعة', 'حصص'] }, sort_order: index + 1, created_by: publisher, updated_by: publisher },
    });
  }

  await prisma.design_web_contact_us.createMany({
    data: [
      { name: 'أحمد محمد', phone: '01000000111', email: 'ahmed@example.test', message: 'أرغب في معرفة تفاصيل الاشتراك.', date_add: today, date_add_s: today, date_add_ar: today, seen: 0 },
      { name: 'سارة علي', phone: '01000000222', email: 'sara@example.test', message: 'هل توجد حصة تجريبية؟', date_add: today, date_add_s: today, date_add_ar: today, seen: 1 },
    ],
  });

  log('website', `branch profiles: ${branchIds.length}, projects: ${branchIds.length}`);
  console.log('✔ Website and portal content done');
}

if (require.main === module) {
  seedWebsite()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
