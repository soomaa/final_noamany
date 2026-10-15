UPDATE `rbac_resources`
SET
  `name_ar` = 'مسميات وظيفية',
  `name_en` = 'Job titles',
  `route` = '/org/job-titles'
WHERE `key` = 'org.departments';
