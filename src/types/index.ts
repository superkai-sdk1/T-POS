export type UserRole = 'owner' | 'staff' | 'client';
export type ItemCategory = string;
export type CheckStatus = 'open' | 'closed';
export type PaymentMethod = 'cash' | 'card' | 'debt' | 'bonus' | 'split';
export type TransactionType = 'supply' | 'write_off' | 'sale' | 'revision' | 'bonus_accrual' | 'bonus_spend' | 'cash_operation' | 'debt_adjustment';

export interface Profile {
  id: string;
  nickname: string;
  is_resident: boolean;
  balance: number;
  bonus_points: number;
  tg_id: string | null;
  role: UserRole;
  password_hash: string | null;
  pin: string | null;
  phone: string | null;
  photo_url: string | null;
  birthday: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  price: number;
  stock_quantity: number;
  min_threshold: number;
  is_active: boolean;
  image_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  icon_name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Check {
  id: string;
  player_id: string | null;
  staff_id: string | null;
  shift_id: string | null;
  status: CheckStatus;
  total_amount: number;
  payment_method: PaymentMethod | null;
  bonus_used: number;
  discount_total: number;
  space_id: string | null;
  note: string | null;
  created_at: string;
  closed_at: string | null;
  player?: Profile;
  space?: Space;
}

export interface CheckItem {
  id: string;
  check_id: string;
  item_id: string;
  quantity: number;
  price_at_time: number;
  item?: InventoryItem;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string | null;
  item_id: string | null;
  check_id: string | null;
  player_id: string | null;
  created_by: string | null;
  created_at: string;
  creator?: Profile;
  player?: Profile;
  item?: InventoryItem;
}

export type ShiftStatus = 'open' | 'closed';

export interface Shift {
  id: string;
  opened_by: string;
  closed_by: string | null;
  status: ShiftStatus;
  cash_start: number;
  cash_end: number | null;
  note: string | null;
  opened_at: string;
  closed_at: string | null;
  opener?: Profile;
  closer?: Profile;
}

export interface ShiftCheckDetail {
  id: string;
  player_nickname: string;
  total_amount: number;
  payment_method: PaymentMethod | null;
  bonus_used: number;
  closed_at: string | null;
  items: { name: string; quantity: number; price: number }[];
}

export interface CartItem {
  item: InventoryItem;
  quantity: number;
}

export interface Supply {
  id: string;
  note: string | null;
  total_cost: number;
  created_by: string | null;
  created_at: string;
  creator?: { nickname: string };
  items?: SupplyItem[];
}

export interface SupplyItem {
  id: string;
  supply_id: string;
  item_id: string;
  quantity: number;
  cost_per_unit: number;
  total_cost: number;
  item?: InventoryItem;
}

export interface Revision {
  id: string;
  note: string | null;
  total_diff: number;
  items_count: number;
  created_by: string | null;
  created_at: string;
  creator?: { nickname: string };
}

export interface RevisionItem {
  id: string;
  revision_id: string;
  item_id: string;
  expected_qty: number;
  actual_qty: number;
  diff: number;
  item?: InventoryItem;
}

export interface AppSettings {
  bonus_accrual_rate: number;
  bonus_min_purchase: number;
  bonus_enabled: boolean;
  bonus_accrual_on_debt: boolean;
}

export type CashOperationType = 'inkassation' | 'deposit';

export interface CashOperation {
  id: string;
  shift_id: string | null;
  type: CashOperationType;
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  creator?: { nickname: string };
}

export type DiscountType = 'percentage' | 'fixed';
export type DiscountTarget = 'check' | 'item';

export interface Discount {
  id: string;
  name: string;
  type: DiscountType;
  value: number;
  is_active: boolean;
  created_at: string;
}

export interface CheckDiscount {
  id: string;
  check_id: string;
  discount_id: string | null;
  target: DiscountTarget;
  item_id: string | null;
  discount_amount: number;
  created_at: string;
  discount?: Discount;
}

export type SpaceType = 'cabin_small' | 'cabin_big' | 'hall';
export type BookingStatus = 'booked' | 'active' | 'completed' | 'cancelled';

export interface Space {
  id: string;
  name: string;
  type: SpaceType;
  hourly_rate: number | null;
  is_active: boolean;
}

export interface Booking {
  id: string;
  space_id: string;
  client_id: string | null;
  check_id: string | null;
  start_time: string;
  end_time: string;
  rental_amount: number;
  note: string | null;
  status: BookingStatus;
  created_by: string | null;
  created_at: string;
  space?: Space;
  client?: Profile;
}

export type EventStatus = 'planned' | 'completed' | 'cancelled';

export interface OffsiteEvent {
  id: string;
  name: string;
  location: string;
  start_time: string;
  end_time: string;
  amount: number;
  note: string | null;
  status: EventStatus;
  check_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CheckPayment {
  id: string;
  check_id: string;
  method: PaymentMethod;
  amount: number;
}
