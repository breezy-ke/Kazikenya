export type Locale = "en" | "sw";

export interface Category {
  id: number;
  slug: string;
  name_en: string;
  name_sw: string;
  icon: string;
  kind: "local" | "remote";
  sort: number;
}

export interface County {
  id: number;
  name: string;
}

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  county_id: number | null;
  town: string | null;
  locale: Locale;
  is_provider: boolean;
  is_admin: boolean;
  verification_level: number;
  onboarded: boolean;
  suspended: boolean;
  created_at: string;
}

export interface ProfilePrivate {
  user_id: string;
  phone: string | null;
  email: string | null;
  mpesa_phone: string | null;
}

export interface ProviderProfile {
  id: string;
  headline: string;
  about: string;
  rate_kes: number | null;
  rate_unit: "job" | "hour" | "day";
  years_experience: number;
  skills: string[];
  remote_ok: boolean;
  available: boolean;
  is_pro: boolean;
  pro_until: string | null;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  quotes_month: string;
  quotes_used: number;
  created_at: string;
}

export interface ProviderSearchRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  county_id: number | null;
  county_name: string | null;
  town: string | null;
  verification_level: number;
  headline: string;
  rate_kes: number | null;
  rate_unit: "job" | "hour" | "day";
  years_experience: number;
  remote_ok: boolean;
  available: boolean;
  is_pro: boolean;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  category_ids: number[];
}

export type JobStatus = "open" | "assigned" | "closed" | "cancelled";
export type Urgency = "asap" | "this_week" | "flexible";

export interface Job {
  id: string;
  buyer_id: string;
  category_id: number;
  title: string;
  description: string;
  county_id: number | null;
  town: string | null;
  is_remote: boolean;
  budget_min: number | null;
  budget_max: number | null;
  urgency: Urgency;
  photos: string[];
  status: JobStatus;
  quotes_count: number;
  created_at: string;
}

export interface Quote {
  id: string;
  job_id: string;
  provider_id: string;
  amount: number;
  message: string;
  eta_days: number;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  created_at: string;
}

export type BookingStatus =
  | "requested"
  | "declined"
  | "awaiting_payment"
  | "funded"
  | "in_progress"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed"
  | "refunded";

export interface Booking {
  id: string;
  ref: string;
  buyer_id: string;
  provider_id: string;
  job_id: string | null;
  quote_id: string | null;
  category_id: number | null;
  title: string;
  description: string;
  amount: number;
  county_id: number | null;
  town: string | null;
  scheduled_for: string | null;
  status: BookingStatus;
  commission_rate: number;
  commission_amount: number | null;
  payout_amount: number | null;
  funded_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingEvent {
  id: number;
  booking_id: string;
  actor_id: string | null;
  from_status: string | null;
  to_status: BookingStatus;
  created_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  booking_id: string | null;
  purpose: "escrow" | "subscription";
  amount: number;
  phone: string;
  status: "pending" | "success" | "failed" | "cancelled";
  mpesa_receipt: string | null;
  result_desc: string | null;
  simulated: boolean;
  created_at: string;
}

export interface Payout {
  id: string;
  booking_id: string;
  provider_id: string;
  kind: "payout" | "refund";
  amount: number;
  phone: string;
  status: "pending" | "processing" | "success" | "failed";
  mpesa_receipt: string | null;
  result_desc: string | null;
  simulated: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  buyer_id: string;
  provider_id: string;
  last_message: string | null;
  last_message_at: string;
  buyer_unread: number;
  provider_unread: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface Verification {
  id: string;
  user_id: string;
  kind: "id" | "pro";
  id_number: string | null;
  doc_front_path: string | null;
  doc_back_path: string | null;
  selfie_path: string | null;
  cert_path: string | null;
  cert_name: string | null;
  status: "pending" | "approved" | "rejected";
  reviewer_note: string | null;
  created_at: string;
}

export interface Dispute {
  id: string;
  booking_id: string;
  raised_by: string;
  reason: "not_done" | "poor_quality" | "no_show" | "overcharge" | "other";
  details: string;
  status: "open" | "resolved_provider" | "resolved_buyer";
  resolution_note: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface PlatformSettings {
  commission_rate: number;
  pro_price_kes: number;
  pro_days: number;
  free_quotes_per_month: number;
  auto_release_hours: number;
  founding_slots_per_county: number;
  founding_pro_days: number;
}

export type MiniProfile = Pick<Profile, "id" | "full_name" | "avatar_url" | "verification_level" | "county_id" | "town">;
