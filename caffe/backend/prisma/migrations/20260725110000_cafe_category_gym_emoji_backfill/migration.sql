UPDATE `inv_categories`
SET `emoji` = CASE
  WHEN `name_ar` LIKE '%بروتين شيك%' OR `name_en` LIKE '%protein shake%' THEN '💪🥤'
  WHEN `name_ar` LIKE '%whey%' OR `name_en` LIKE '%whey%' THEN '🥛💪'
  WHEN `name_ar` LIKE '%ايس كوفي%' OR `name_ar` LIKE '%آيس كوفي%' OR `name_en` LIKE '%iced coffee%' THEN '🧊☕'
  WHEN `name_ar` LIKE '%ماتشا%' OR `name_en` LIKE '%matcha%' THEN '🍵'
  WHEN `name_ar` LIKE '%سموز%' OR `name_en` LIKE '%smoothie%' THEN '🥤💪'
  WHEN `name_ar` LIKE '%هيلث%' OR `name_en` LIKE '%healthy market%' THEN '🛒'
  WHEN `name_ar` LIKE '%فراي%' OR `name_en` LIKE '%fries%' THEN '🍟'
  WHEN `name_ar` LIKE '%كلاسيك%' OR `name_en` LIKE '%classic%' THEN '☕'
  WHEN `name_ar` LIKE '%ضاف%' OR `name_en` LIKE '%add-on%' OR `name_en` LIKE '%extra%' THEN '➕'
  WHEN `name_ar` LIKE '%سناك%' OR `name_en` LIKE '%snack%' THEN '🍿'
  WHEN `name_ar` LIKE '%كانز%' OR `name_en` LIKE '%can%' THEN '🥤'
  WHEN `name_ar` LIKE '%سلط%' OR `name_en` LIKE '%salad%' THEN '🥗'
  WHEN `name_ar` LIKE '%فطار%' OR `name_en` LIKE '%breakfast%' THEN '🥞'
  WHEN `name_ar` LIKE '%مقبل%' OR `name_en` LIKE '%appetizer%' THEN '🍟'
  WHEN `name_ar` LIKE '%بيتزا%' OR `name_en` LIKE '%pizza%' THEN '🍕'
  WHEN `name_ar` LIKE '%راب%' OR `name_en` LIKE '%wrap%' THEN '🌯'
  WHEN `name_ar` LIKE '%برجر%' OR `name_en` LIKE '%burger%' THEN '🍔'
  WHEN `name_ar` LIKE '%مكرون%' OR `name_en` LIKE '%pasta%' THEN '🍝'
  ELSE `emoji`
END
WHERE `emoji` = '🍽️' OR `emoji` = '';
