/**
 * Configurable keyword and location aliases for Panchbibi relevance filtering.
 */

// Tier A: Direct mentions of Panchbibi
export const TIER_A_KEYWORDS: string[] = [
  'পাঁচবিবি',
  'পাঁচ বিবি',
  'panchbibi',
  'panch-bibi',
  'panch bibi',
  'panchbibi-news'
];

// Tier B: Verified Panchbibi unions, localities, and key entities
export const TIER_B_KEYWORDS: string[] = [
  // 8 Unions of Panchbibi Upazila
  'বাগজানা',
  'bagjana',
  'ধরঞ্জী',
  'ধরঞ্জি',
  'dharanji',
  'আয়মারসুলপুর',
  'আইমারসুলপুর',
  'aymarasulpur',
  'aimarasulpur',
  'বালিঘাটা',
  'balighata',
  'আটাপুর',
  'atapur',
  'মোহাম্মদপুর',
  'mohammadpur',
  'আওলাই',
  'aolai',
  'কুসুম্বা',
  'kusumba',

  // Prominent localities, institutions, and border points in Panchbibi
  'কাঁকড়া পিংলু',
  'পাথরঘাটা নিমাই শাহ',
  'পাথরঘাটা মাজার',
  'উচনা সীমান্ত',
  'বীরনগর',
  'চেঁচড়া',
  'পাঁচবিবি পৌরসভা',
  'পাঁচবিবি থানা',
  'পাঁচবিবি রেলস্টেশন',
  'পাঁচবিবি রেলওয়ে স্টেশন',
  'পাঁচবিবি উপজেলা স্বাস্থ্য কমপ্লেক্স'
];

// Joypurhat district keywords (Tier C - only allowed when combined with Tier A or Tier B context)
export const JOYPURHAT_KEYWORDS: string[] = [
  'জয়পুরহাট',
  'জয়পুরহাট',
  'joypurhat',
  'jaipurhat'
];
