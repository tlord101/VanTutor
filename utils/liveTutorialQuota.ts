/**
 * Live tutorial minute pool + payment gate.
 *
 * Users get a fixed allowance of included minutes (monthly or weekly).
 * Starting a lesson either:
 *  - consumes from the pool (no credits), or
 *  - charges credits for that duration when the pool is insufficient.
 *
 * This caps API cost while still allowing 30/60-min lessons via pay-as-you-go.
 */

import type { UserProfile, AppSettings } from '../types';
import { DEFAULT_USAGE_SETTINGS } from './appSettings';
import { isExempt, isPaidSubscriber, getFeatureCost, deductAICredits } from './usage';
import { readCachedJson, writeCachedJson } from './cache';

export type LiveDurationMinutes = 15 | 30 | 60;

export interface LiveMinutePoolState {
  /** Period key: YYYY-MM for monthly, or YYYY-Www for weekly */
  periodKey: string;
  usedMinutes: number;
  updatedAt: number;
}

export interface LiveTutorialStartDecision {
  allowed: boolean;
  /** How this start is paid */
  payment: 'included' | 'credits' | 'blocked';
  creditCost: number;
  durationMinutes: LiveDurationMinutes;
  poolAllowance: number;
  poolUsed: number;
  poolRemaining: number;
  reason?:
    | 'allowed_included'
    | 'allowed_credits'
    | 'insufficient_credits'
    | 'locked_free'
    | 'no_profile';
  message: string;
}

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function weekKey(d = new Date()): string {
  // ISO-ish week: year + week number
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function storageKey(uid: string): string {
  return `avelut_live_minutes_${uid}`;
}

function resolveTierKey(userProfile?: UserProfile | null): string {
  if (!userProfile) return 'free';
  if (isExempt(userProfile)) return 'monthly';
  const status = (userProfile.subscription_status || 'free').toLowerCase();
  if (status === 'pro' || status === 'premium') return 'monthly';
  if (status === 'basic') return 'weekly';
  if (status === 'weekly' || status === 'monthly' || status === 'semester' || status === 'free') {
    return status;
  }
  return 'free';
}

function getTierConfig(userProfile?: UserProfile | null, appSettings?: AppSettings | null) {
  const tiers = (appSettings?.usage_settings?.tiers || DEFAULT_USAGE_SETTINGS.tiers) as any;
  const key = resolveTierKey(userProfile);
  return tiers[key] || tiers.free || DEFAULT_USAGE_SETTINGS.tiers.free;
}

/**
 * Included live minutes for the current billing period.
 * Free: 15 / month
 * Weekly: 105 / week (7 × 15)
 * Pro / Semester: 150 / month (10 × 15) — protects API margin under ₦3,999
 */
export function getLiveMinuteAllowance(
  userProfile?: UserProfile | null,
  appSettings?: AppSettings | null
): { allowance: number; period: 'month' | 'week'; periodKey: string } {
  const tier = getTierConfig(userProfile, appSettings);
  const key = resolveTierKey(userProfile);

  if (key === 'weekly' || key === 'basic') {
    const allowance =
      typeof tier.live_tutorial_minutes_pool === 'number'
        ? tier.live_tutorial_minutes_pool
        : 105;
    return { allowance, period: 'week', periodKey: weekKey() };
  }

  const allowance =
    typeof tier.live_tutorial_minutes_pool === 'number'
      ? tier.live_tutorial_minutes_pool
      : key === 'free'
        ? 15
        : 150;

  return { allowance, period: 'month', periodKey: monthKey() };
}

export function getLiveMinutePoolState(userId: string, periodKey: string): LiveMinutePoolState {
  const raw = readCachedJson<LiveMinutePoolState | null>(storageKey(userId), null);
  if (!raw || raw.periodKey !== periodKey) {
    return { periodKey, usedMinutes: 0, updatedAt: Date.now() };
  }
  return raw;
}

export function getLiveMinutesRemaining(
  userProfile?: UserProfile | null,
  appSettings?: AppSettings | null
): { remaining: number; used: number; allowance: number; period: 'month' | 'week'; periodKey: string } {
  const { allowance, period, periodKey } = getLiveMinuteAllowance(userProfile, appSettings);
  if (!userProfile?.uid) {
    return { remaining: 0, used: 0, allowance, period, periodKey };
  }
  if (isExempt(userProfile)) {
    return { remaining: allowance, used: 0, allowance, period, periodKey };
  }
  const state = getLiveMinutePoolState(userProfile.uid, periodKey);
  const used = Math.max(0, state.usedMinutes || 0);
  const remaining = Math.max(0, allowance - used);
  return { remaining, used, allowance, period, periodKey };
}

export function getLiveDurationCreditCost(
  minutes: LiveDurationMinutes,
  appSettings?: AppSettings | null
): number {
  if (minutes === 15) return getFeatureCost('live_tutorial_15' as any, appSettings) || getFeatureCost('live_tutorial', appSettings) || 150;
  if (minutes === 30) return getFeatureCost('live_tutorial_30' as any, appSettings) || 350;
  return getFeatureCost('live_tutorial_60' as any, appSettings) || 650;
}

/**
 * Decide whether the user can start a live lesson of `minutes` length,
 * and whether it comes from the included pool or credits.
 */
export function evaluateLiveTutorialStart(
  userProfile: UserProfile | null | undefined,
  minutes: LiveDurationMinutes,
  appSettings?: AppSettings | null
): LiveTutorialStartDecision {
  if (!userProfile) {
    return {
      allowed: false,
      payment: 'blocked',
      creditCost: 0,
      durationMinutes: minutes,
      poolAllowance: 0,
      poolUsed: 0,
      poolRemaining: 0,
      reason: 'no_profile',
      message: 'Sign in to start a live tutorial.',
    };
  }

  if (isExempt(userProfile)) {
    const pool = getLiveMinutesRemaining(userProfile, appSettings);
    return {
      allowed: true,
      payment: 'included',
      creditCost: 0,
      durationMinutes: minutes,
      poolAllowance: pool.allowance,
      poolUsed: pool.used,
      poolRemaining: pool.remaining,
      reason: 'allowed_included',
      message: 'Admin / personal token — unlimited for testing.',
    };
  }

  const pool = getLiveMinutesRemaining(userProfile, appSettings);
  const creditCost = getLiveDurationCreditCost(minutes, appSettings);
  const balance = userProfile.ai_credits_balance ?? 0;

  // Prefer included minutes when the pool can cover the full duration
  if (pool.remaining >= minutes) {
    return {
      allowed: true,
      payment: 'included',
      creditCost: 0,
      durationMinutes: minutes,
      poolAllowance: pool.allowance,
      poolUsed: pool.used,
      poolRemaining: pool.remaining,
      reason: 'allowed_included',
      message: `Uses ${minutes} of your ${pool.remaining} remaining included minutes this ${pool.period}.`,
    };
  }

  // Not enough included minutes → credits
  if (balance >= creditCost) {
    return {
      allowed: true,
      payment: 'credits',
      creditCost,
      durationMinutes: minutes,
      poolAllowance: pool.allowance,
      poolUsed: pool.used,
      poolRemaining: pool.remaining,
      reason: 'allowed_credits',
      message: `Included minutes low (${pool.remaining} left). This ${minutes}-min lesson costs ${creditCost} credits.`,
    };
  }

  // Free with no credits and empty pool
  if (!isPaidSubscriber(userProfile) && pool.remaining < minutes) {
    return {
      allowed: false,
      payment: 'blocked',
      creditCost,
      durationMinutes: minutes,
      poolAllowance: pool.allowance,
      poolUsed: pool.used,
      poolRemaining: pool.remaining,
      reason: pool.allowance > 0 && pool.remaining < minutes ? 'insufficient_credits' : 'locked_free',
      message:
        pool.remaining > 0
          ? `Only ${pool.remaining} included minutes left. Need ${minutes} min or ${creditCost} credits.`
          : `No included minutes left this ${pool.period}. Upgrade to Pro or buy ${creditCost} credits for a ${minutes}-min lesson.`,
    };
  }

  return {
    allowed: false,
    payment: 'blocked',
    creditCost,
    durationMinutes: minutes,
    poolAllowance: pool.allowance,
    poolUsed: pool.used,
    poolRemaining: pool.remaining,
    reason: 'insufficient_credits',
    message: `Need ${creditCost} credits for a ${minutes}-min lesson (you have ${balance}). Included minutes left: ${pool.remaining}.`,
  };
}

/**
 * Commit a successful start: deduct pool minutes and/or credits.
 */
export async function commitLiveTutorialStart(
  userProfile: UserProfile,
  decision: LiveTutorialStartDecision,
  appSettings?: AppSettings | null
): Promise<void> {
  if (!decision.allowed || !userProfile.uid) return;
  if (isExempt(userProfile)) return;

  if (decision.payment === 'included') {
    const { periodKey } = getLiveMinuteAllowance(userProfile, appSettings);
    const state = getLiveMinutePoolState(userProfile.uid, periodKey);
    const next: LiveMinutePoolState = {
      periodKey,
      usedMinutes: (state.usedMinutes || 0) + decision.durationMinutes,
      updatedAt: Date.now(),
    };
    writeCachedJson(storageKey(userProfile.uid), next);
    return;
  }

  if (decision.payment === 'credits' && decision.creditCost > 0) {
    await deductAICredits(
      userProfile.uid,
      decision.creditCost,
      `Live tutorial ${decision.durationMinutes}m`,
      appSettings || undefined
    );
  }
}

/** Back-compat wrapper used by headers / buttons */
export function hasLiveTutorialAccess(
  userProfile?: UserProfile | null,
  appSettings?: AppSettings | null
): { allowed: boolean; reason?: string; remainingMinutes?: number } {
  if (!userProfile) return { allowed: false, reason: 'locked_free', remainingMinutes: 0 };
  if (isExempt(userProfile)) return { allowed: true, reason: 'allowed', remainingMinutes: 9999 };

  const pool = getLiveMinutesRemaining(userProfile, appSettings);
  const balance = userProfile.ai_credits_balance ?? 0;
  const minCredit = getLiveDurationCreditCost(15, appSettings);

  if (pool.remaining >= 15 || balance >= minCredit || isPaidSubscriber(userProfile)) {
    // Paid subscribers can always open the modal even if pool is empty (they'll pay credits)
    return { allowed: true, reason: 'allowed', remainingMinutes: pool.remaining };
  }

  return { allowed: false, reason: 'locked_free', remainingMinutes: pool.remaining };
}
