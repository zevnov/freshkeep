import { supabase } from "./supabase";

export interface CommunityExpiryItem {
  normalized_name: string;
  category: string;
  fridge_days: number | null;
  freezer_days: number | null;
  perishable: boolean;
  submission_count: number;
}

export interface CommunityExpirySubmission {
  normalized_name: string;
  category: string;
  fridge_days: number | null;
  freezer_days: number | null;
  perishable: boolean;
}

/**
 * Look up community-sourced expiry data for an item name.
 * Returns null if no community data exists for this item.
 */
export async function fetchCommunityExpiry(
  normalizedName: string
): Promise<CommunityExpiryItem | null> {
  const key = normalizedName.toLowerCase().trim();
  if (!key) return null;

  const { data, error } = await supabase
    .from("community_expiry_knowledge")
    .select("*")
    .eq("normalized_name", key)
    .maybeSingle();

  if (error) {
    console.warn("Community expiry fetch failed:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    normalized_name: data.normalized_name,
    category: data.category,
    fridge_days: data.fridge_days as number | null,
    freezer_days: data.freezer_days as number | null,
    perishable: data.perishable as boolean,
    submission_count: data.submission_count as number,
  };
}

/**
 * Submit (or update) community expiry data for an item.
 * Averaging and submission-count bookkeeping happen atomically in the
 * submit_community_expiry Postgres function, so concurrent submissions
 * cannot clobber each other.
 */
export async function submitCommunityExpiry(
  submission: CommunityExpirySubmission
): Promise<void> {
  const key = submission.normalized_name.toLowerCase().trim();
  if (!key) return;

  const { error } = await supabase.rpc("submit_community_expiry", {
    p_name: key,
    p_category: submission.category,
    p_fridge_days: submission.fridge_days,
    p_freezer_days: submission.freezer_days,
    p_perishable: submission.perishable,
  });

  if (error) {
    console.warn("Failed to submit community expiry:", error.message);
  }
}
