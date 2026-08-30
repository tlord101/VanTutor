import type { AppSettings } from '../types';

export const APP_SETTINGS_PATH = 'app_settings/global';

export const DEFAULT_USAGE_SETTINGS = {
  tiers: {
    free: {
      tier_id: 'free',
      display_name: 'Free Tier',
      description: 'Standard access with daily limits. 30 chat messages/day, 3 camera scans/day. Live tutorial locked.',
      price_ngn: 0,
      credit_allocation: 30,
      max_saved_courses: 5,
      live_tutorial_daily_topics: 0,
      live_tutorial_minutes_label: '0 mins',
      chat_daily_limit: 50,
      scan_daily_limit: 3,
      flashcard_daily_limit: 3,
      quiz_daily_limit: 3,
      max_notebooks: 100,
      sources_per_notebook: 50,
      max_source_words: 500000,
      max_source_mb: 200,
      deep_research_monthly: 10,
      audio_overviews_daily: 3,
      video_overviews_daily: 3,
      reports_daily: 10,
      has_verification_badge: false,
      badge_color: 'none',
    },
    weekly: {
      tier_id: 'weekly',
      display_name: 'Weekly Plan',
      description: 'Unlimited chats & camera scans, unlimited uploads. 1 Live Voice Tutorial topic per day (7 topics per week). Generated content accessible offline.',
      price_ngn: 1200,
      credit_allocation: 500,
      max_saved_courses: -1,
      live_tutorial_daily_topics: 1,       // 1 per day = 7 per week
      live_tutorial_weekly_topics: 7,
      live_tutorial_minutes_label: '1 topic / day (7/week)',
      chat_daily_limit: -1, // unlimited
      scan_daily_limit: -1, // unlimited
      flashcard_daily_limit: 3,
      quiz_daily_limit: 3,
      max_notebooks: 100,
      sources_per_notebook: 50,
      max_source_words: 500000,
      max_source_mb: 200,
      has_verification_badge: true,
      badge_color: 'blue',
    },
    monthly: {
      tier_id: 'monthly',
      display_name: 'Monthly Plan',
      description: 'Unlimited chats, scans & flashcards. Max 3 Live Voice Tutorial topics per day, 15 topics total per month. All content saved for offline access.',
      price_ngn: 4000,
      credit_allocation: 2500,
      max_saved_courses: -1,
      live_tutorial_daily_topics: 3,       // max 3 per day
      live_tutorial_monthly_topics: 15,    // 15 total per month
      live_tutorial_minutes_label: 'Max 3 topics/day · 15/month',
      chat_daily_limit: -1,
      scan_daily_limit: -1,
      flashcard_daily_limit: -1,
      quiz_daily_limit: -1,
      max_notebooks: 100,
      sources_per_notebook: 50,
      max_source_words: 500000,
      max_source_mb: 200,
      has_verification_badge: true,
      badge_color: 'purple',
    },
    semester: {
      tier_id: 'semester',
      display_name: 'Semester Plan',
      description: 'All-inclusive academic access for the entire semester. Max 3 Live Tutorial topics per day, 15/month. All generated content saved offline. Best academic value.',
      price_ngn: 12000,
      credit_allocation: 8000,
      max_saved_courses: -1,
      live_tutorial_daily_topics: 3,       // max 3 per day
      live_tutorial_monthly_topics: 15,    // 15 total per month
      live_tutorial_minutes_label: 'Max 3 topics/day · 15/month',
      chat_daily_limit: -1,
      scan_daily_limit: -1,
      flashcard_daily_limit: -1,
      quiz_daily_limit: -1,
      max_notebooks: 100,
      sources_per_notebook: 50,
      max_source_words: 500000,
      max_source_mb: 200,
      has_verification_badge: true,
      badge_color: 'gold',
    },
    // Legacy tier aliases
    basic: {
      tier_id: 'basic',
      display_name: 'Weekly Plan',
      description: 'Unlimited chats, scans, 1 Live Voice Tutorial topic per day (7 per week). Content saved offline.',
      price_ngn: 1200,
      credit_allocation: 500,
      max_saved_courses: -1,
      live_tutorial_daily_topics: 1,
      live_tutorial_weekly_topics: 7,
      live_tutorial_minutes_label: '1 topic / day (7/week)',
      has_verification_badge: true,
      badge_color: 'blue',
    },
    premium: {
      tier_id: 'premium',
      display_name: 'Monthly Plan',
      description: 'Unlimited chats, scans & flashcards. Max 3 Live Tutorial topics per day, 15 per month. All content saved offline.',
      price_ngn: 4000,
      credit_allocation: 2500,
      max_saved_courses: -1,
      live_tutorial_daily_topics: 3,
      live_tutorial_monthly_topics: 15,
      live_tutorial_minutes_label: 'Max 3 topics/day · 15/month',
      has_verification_badge: true,
      badge_color: 'purple',
    },
  },
  feature_costs: {
    live_tutorial: 150,           // ₦150 per full topic (pay-as-you-go)
    live_tutorial_question: 50,   // 50 credits per question asked during live tutorial
    flashcard_generation: 50,     // ₦50 per flashcard
    chat_interaction: 1,          // 1 credit per AI response (Notebook Chat & Study Guide Chat)
    visual_solve: 5,              // 5 credits per scan (covers Gemini HIGH thinking cost)
    ai_quiz_generation: 50,
    study_guide_lesson: 300,
    study_guide_extraction: 10,   // 10 credits per extraction (no longer free)
  },
  feature_models: {
    visual_solve: 'qwen3.8-max',
    chat_interaction: 'qwen3.8-max',
    flashcard_generation: 'qwen3.8-max',
    ai_quiz_generation: 'qwen3.8-max',
    study_guide_lesson: 'qwen3.8-max',
    study_guide_extraction: 'qwen3.8-max',
    title_generation: 'qwen3.8-max',
  },
  additional_prices: {
    live_tutorial_pass: 150,
    flashcards_pack_10: 500,
    visual_messages_price: 200,
    visual_messages_count: 10,
    studyguide_course_price: 300,
    studyguide_request_price: 50,
  },
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  primary_gemini_model: 'qwen3.8-max',
  gemini_api_key: '',
  primary_ai_provider: 'alibaba_qwen',
  alibaba_api_key: '',
  alibaba_base_url: 'https://ws-o3v6mh0i8y9tqdfx.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
  alibaba_model: 'qwen3.8-max',
  active_voice_provider: 'grok',
  studyguide_voice_provider: 'grok',
  notebook_voice_provider: 'grok',
  alibaba_voice_model: 'qwen3-tts-flash',
  alibaba_voice_name: 'Cherry',
  grok_api_key: '',
  grok_voice_id: 'altair',
  upload_center_uploads_enabled: true,
  coming_soon_enabled: false,
  show_playstore_modal: true,
  playstore_modal_collect_emails: true,
  paystack_public_key: '',
  custom_user_limit_rpm: 10,
  custom_user_limit_tpm: 250000,
  usage_settings: DEFAULT_USAGE_SETTINGS as any, // Temporary cast until types propagate fully
  youtube_api_key: '',
  google_client_id: '',
  google_api_key: '',
  pinecone_api_key: '',
  pinecone_index_name: '',
  revenuecat_api_key_android: '',
  kittenml_api_key: '',
};

/**
 * Central resolution helper for Alibaba Cloud (DashScope / Model Studio) API Key.
 * Order of resolution:
 * 1. Non-empty Firebase app settings `alibaba_api_key`
 * 2. Client / environment variables (VITE_ALIBABA_API_KEY / ALIBABA_API_KEY)
 */
export const getAlibabaApiKey = (appSettings?: AppSettings | Partial<AppSettings> | null): string => {
  const fromSettings = appSettings?.alibaba_api_key?.trim();
  if (fromSettings) {
    return fromSettings;
  }

  let fromEnv = '';
  try {
    const metaEnv = (import.meta as any)?.env;
    if (metaEnv) {
      fromEnv = metaEnv.VITE_ALIBABA_API_KEY || metaEnv.ALIBABA_API_KEY || '';
    }
  } catch (_) {}

  if (!fromEnv && typeof process !== 'undefined' && process?.env) {
    fromEnv = process.env.VITE_ALIBABA_API_KEY || process.env.ALIBABA_API_KEY || '';
  }

  const key = fromEnv.trim();
  if (!key) {
    throw new Error('Alibaba Cloud DashScope API Key is not configured. Please set it in Admin System Settings or environment variables.');
  }

  return key;
};

export const normalizeAppSettings = (raw: Partial<AppSettings> | null | undefined): AppSettings => ({
  primary_gemini_model: (raw?.primary_gemini_model || DEFAULT_APP_SETTINGS.primary_gemini_model).toString().trim() || DEFAULT_APP_SETTINGS.primary_gemini_model,
  gemini_api_key: (raw?.gemini_api_key || DEFAULT_APP_SETTINGS.gemini_api_key).toString().trim(),
  primary_ai_provider: raw?.primary_ai_provider || DEFAULT_APP_SETTINGS.primary_ai_provider,
  alibaba_api_key: (raw?.alibaba_api_key || DEFAULT_APP_SETTINGS.alibaba_api_key || '').toString().trim(),
  alibaba_base_url: (raw?.alibaba_base_url || DEFAULT_APP_SETTINGS.alibaba_base_url || '').toString().trim(),
  alibaba_model: (raw?.alibaba_model || DEFAULT_APP_SETTINGS.alibaba_model || '').toString().trim(),
  active_voice_provider: raw?.active_voice_provider || DEFAULT_APP_SETTINGS.active_voice_provider,
  studyguide_voice_provider: raw?.studyguide_voice_provider || raw?.active_voice_provider || DEFAULT_APP_SETTINGS.studyguide_voice_provider,
  notebook_voice_provider: raw?.notebook_voice_provider || raw?.active_voice_provider || DEFAULT_APP_SETTINGS.notebook_voice_provider,
  alibaba_voice_model: (raw?.alibaba_voice_model || DEFAULT_APP_SETTINGS.alibaba_voice_model || '').toString().trim(),
  alibaba_voice_name: (raw?.alibaba_voice_name || DEFAULT_APP_SETTINGS.alibaba_voice_name || '').toString().trim(),
  grok_api_key: (raw?.grok_api_key || DEFAULT_APP_SETTINGS.grok_api_key || '').toString().trim(),
  grok_voice_id: (raw?.grok_voice_id || DEFAULT_APP_SETTINGS.grok_voice_id || '').toString().trim(),
  kittenml_api_key: (raw?.kittenml_api_key || DEFAULT_APP_SETTINGS.kittenml_api_key || '').toString().trim(),
  youtube_api_key: (raw?.youtube_api_key || DEFAULT_APP_SETTINGS.youtube_api_key || '').toString().trim(),
  google_client_id: (raw?.google_client_id || DEFAULT_APP_SETTINGS.google_client_id || '').toString().trim(),
  google_api_key: (raw?.google_api_key || DEFAULT_APP_SETTINGS.google_api_key || '').toString().trim(),
  pinecone_api_key: (raw?.pinecone_api_key || DEFAULT_APP_SETTINGS.pinecone_api_key || '').toString().trim(),
  pinecone_index_name: (raw?.pinecone_index_name || DEFAULT_APP_SETTINGS.pinecone_index_name || '').toString().trim(),
  revenuecat_api_key_android: (raw?.revenuecat_api_key_android || DEFAULT_APP_SETTINGS.revenuecat_api_key_android || '').toString().trim(),
  upload_center_uploads_enabled: raw?.upload_center_uploads_enabled ?? DEFAULT_APP_SETTINGS.upload_center_uploads_enabled,
  coming_soon_enabled: raw?.coming_soon_enabled ?? DEFAULT_APP_SETTINGS.coming_soon_enabled,
  show_playstore_modal: raw?.show_playstore_modal ?? DEFAULT_APP_SETTINGS.show_playstore_modal,
  playstore_modal_collect_emails: raw?.playstore_modal_collect_emails ?? DEFAULT_APP_SETTINGS.playstore_modal_collect_emails,
  paystack_public_key: (raw?.paystack_public_key || DEFAULT_APP_SETTINGS.paystack_public_key).toString().trim(),
  custom_user_limit_rpm: typeof raw?.custom_user_limit_rpm === 'number' ? raw.custom_user_limit_rpm : DEFAULT_APP_SETTINGS.custom_user_limit_rpm,
  custom_user_limit_tpm: typeof raw?.custom_user_limit_tpm === 'number' ? raw.custom_user_limit_tpm : DEFAULT_APP_SETTINGS.custom_user_limit_tpm,
  usage_settings: raw?.usage_settings ? {
    feature_costs: {
      visual_solve: typeof raw.usage_settings.feature_costs?.visual_solve === 'number' ? raw.usage_settings.feature_costs.visual_solve : DEFAULT_USAGE_SETTINGS.feature_costs.visual_solve,
      chat_interaction: typeof raw.usage_settings.feature_costs?.chat_interaction === 'number' ? raw.usage_settings.feature_costs.chat_interaction : DEFAULT_USAGE_SETTINGS.feature_costs.chat_interaction,
      flashcard_generation: typeof raw.usage_settings.feature_costs?.flashcard_generation === 'number' ? raw.usage_settings.feature_costs.flashcard_generation : DEFAULT_USAGE_SETTINGS.feature_costs.flashcard_generation,
      ai_quiz_generation: typeof raw.usage_settings.feature_costs?.ai_quiz_generation === 'number' ? raw.usage_settings.feature_costs.ai_quiz_generation : DEFAULT_USAGE_SETTINGS.feature_costs.ai_quiz_generation,
      study_guide_lesson: typeof raw.usage_settings.feature_costs?.study_guide_lesson === 'number' ? raw.usage_settings.feature_costs.study_guide_lesson : DEFAULT_USAGE_SETTINGS.feature_costs.study_guide_lesson,
      study_guide_extraction: typeof raw.usage_settings.feature_costs?.study_guide_extraction === 'number' ? raw.usage_settings.feature_costs.study_guide_extraction : DEFAULT_USAGE_SETTINGS.feature_costs.study_guide_extraction,
    },
    feature_models: {
      visual_solve: raw.usage_settings.feature_models?.visual_solve || DEFAULT_USAGE_SETTINGS.feature_models.visual_solve,
      chat_interaction: raw.usage_settings.feature_models?.chat_interaction || DEFAULT_USAGE_SETTINGS.feature_models.chat_interaction,
      flashcard_generation: raw.usage_settings.feature_models?.flashcard_generation || DEFAULT_USAGE_SETTINGS.feature_models.flashcard_generation,
      ai_quiz_generation: raw.usage_settings.feature_models?.ai_quiz_generation || DEFAULT_USAGE_SETTINGS.feature_models.ai_quiz_generation,
      study_guide_lesson: raw.usage_settings.feature_models?.study_guide_lesson || DEFAULT_USAGE_SETTINGS.feature_models.study_guide_lesson,
      study_guide_extraction: raw.usage_settings.feature_models?.study_guide_extraction || DEFAULT_USAGE_SETTINGS.feature_models.study_guide_extraction,
      title_generation: raw.usage_settings.feature_models?.title_generation || DEFAULT_USAGE_SETTINGS.feature_models.title_generation,
    },
    tiers: {
      free: {
        tier_id: raw.usage_settings.tiers?.free?.tier_id || DEFAULT_USAGE_SETTINGS.tiers.free.tier_id,
        display_name: raw.usage_settings.tiers?.free?.display_name || DEFAULT_USAGE_SETTINGS.tiers.free.display_name,
        description: raw.usage_settings.tiers?.free?.description || DEFAULT_USAGE_SETTINGS.tiers.free.description,
        price_ngn: typeof raw.usage_settings.tiers?.free?.price_ngn === 'number' ? raw.usage_settings.tiers.free.price_ngn : DEFAULT_USAGE_SETTINGS.tiers.free.price_ngn,
        credit_allocation: typeof raw.usage_settings.tiers?.free?.credit_allocation === 'number' ? raw.usage_settings.tiers.free.credit_allocation : DEFAULT_USAGE_SETTINGS.tiers.free.credit_allocation,
        max_saved_courses: typeof raw.usage_settings.tiers?.free?.max_saved_courses === 'number' ? raw.usage_settings.tiers.free.max_saved_courses : DEFAULT_USAGE_SETTINGS.tiers.free.max_saved_courses,
        has_verification_badge: typeof raw.usage_settings.tiers?.free?.has_verification_badge === 'boolean' ? raw.usage_settings.tiers.free.has_verification_badge : DEFAULT_USAGE_SETTINGS.tiers.free.has_verification_badge,
        badge_color: raw.usage_settings.tiers?.free?.badge_color || DEFAULT_USAGE_SETTINGS.tiers.free.badge_color,
      },
      basic: {
        tier_id: raw.usage_settings.tiers?.basic?.tier_id || DEFAULT_USAGE_SETTINGS.tiers.basic.tier_id,
        display_name: raw.usage_settings.tiers?.basic?.display_name || DEFAULT_USAGE_SETTINGS.tiers.basic.display_name,
        description: raw.usage_settings.tiers?.basic?.description || DEFAULT_USAGE_SETTINGS.tiers.basic.description,
        price_ngn: typeof raw.usage_settings.tiers?.basic?.price_ngn === 'number' ? raw.usage_settings.tiers.basic.price_ngn : DEFAULT_USAGE_SETTINGS.tiers.basic.price_ngn,
        credit_allocation: typeof raw.usage_settings.tiers?.basic?.credit_allocation === 'number' ? raw.usage_settings.tiers.basic.credit_allocation : DEFAULT_USAGE_SETTINGS.tiers.basic.credit_allocation,
        max_saved_courses: typeof raw.usage_settings.tiers?.basic?.max_saved_courses === 'number' ? raw.usage_settings.tiers.basic.max_saved_courses : DEFAULT_USAGE_SETTINGS.tiers.basic.max_saved_courses,
        has_verification_badge: typeof raw.usage_settings.tiers?.basic?.has_verification_badge === 'boolean' ? raw.usage_settings.tiers.basic.has_verification_badge : DEFAULT_USAGE_SETTINGS.tiers.basic.has_verification_badge,
        badge_color: raw.usage_settings.tiers?.basic?.badge_color || DEFAULT_USAGE_SETTINGS.tiers.basic.badge_color,
      },
      premium: {
        tier_id: raw.usage_settings.tiers?.premium?.tier_id || DEFAULT_USAGE_SETTINGS.tiers.premium.tier_id,
        display_name: raw.usage_settings.tiers?.premium?.display_name || DEFAULT_USAGE_SETTINGS.tiers.premium.display_name,
        description: raw.usage_settings.tiers?.premium?.description || DEFAULT_USAGE_SETTINGS.tiers.premium.description,
        price_ngn: typeof raw.usage_settings.tiers?.premium?.price_ngn === 'number' ? raw.usage_settings.tiers.premium.price_ngn : DEFAULT_USAGE_SETTINGS.tiers.premium.price_ngn,
        credit_allocation: typeof raw.usage_settings.tiers?.premium?.credit_allocation === 'number' ? raw.usage_settings.tiers.premium.credit_allocation : DEFAULT_USAGE_SETTINGS.tiers.premium.credit_allocation,
        max_saved_courses: typeof raw.usage_settings.tiers?.premium?.max_saved_courses === 'number' ? raw.usage_settings.tiers.premium.max_saved_courses : DEFAULT_USAGE_SETTINGS.tiers.premium.max_saved_courses,
        has_verification_badge: typeof raw.usage_settings.tiers?.premium?.has_verification_badge === 'boolean' ? raw.usage_settings.tiers.premium.has_verification_badge : DEFAULT_USAGE_SETTINGS.tiers.premium.has_verification_badge,
        badge_color: raw.usage_settings.tiers?.premium?.badge_color || DEFAULT_USAGE_SETTINGS.tiers.premium.badge_color,
      }
    },
    additional_prices: {
      visual_messages_price: typeof raw.usage_settings.additional_prices?.visual_messages_price === 'number' ? raw.usage_settings.additional_prices.visual_messages_price : DEFAULT_USAGE_SETTINGS.additional_prices.visual_messages_price,
      visual_messages_count: typeof raw.usage_settings.additional_prices?.visual_messages_count === 'number' ? raw.usage_settings.additional_prices.visual_messages_count : DEFAULT_USAGE_SETTINGS.additional_prices.visual_messages_count,
      studyguide_course_price: typeof raw.usage_settings.additional_prices?.studyguide_course_price === 'number' ? raw.usage_settings.additional_prices.studyguide_course_price : DEFAULT_USAGE_SETTINGS.additional_prices.studyguide_course_price,
      studyguide_request_price: typeof raw.usage_settings.additional_prices?.studyguide_request_price === 'number' ? raw.usage_settings.additional_prices.studyguide_request_price : DEFAULT_USAGE_SETTINGS.additional_prices.studyguide_request_price,
    }
  } : (DEFAULT_USAGE_SETTINGS as any),
});
