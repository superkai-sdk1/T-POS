export type UserRole = 'owner' | 'staff' | 'client';

/** Management section IDs (cash & analytics always accessible) */
export type ManagementPermissionKey =
  | 'menu' | 'inventory' | 'supplies' | 'clients' | 'discounts' | 'bonus'
  | 'expenses' | 'debtors' | 'staff' | 'salary' | 'about';

export interface ManagementPermissions {
  menu?: boolean;
  inventory?: boolean;
  supplies?: boolean;
  clients?: boolean;
  discounts?: boolean;
  bonus?: boolean;
  expenses?: boolean;
  debtors?: boolean;
  staff?: boolean;
  salary?: boolean;
  about?: boolean;
}
export type ClientTier = 'regular' | 'resident' | 'student';
export type VisitTariff = 'regular' | 'resident' | 'student' | 'single_game';
export type ItemCategory = string;
export type CheckStatus = 'open' | 'closed';
export type PaymentMethod = 'cash' | 'card' | 'debt' | 'bonus' | 'split' | 'deposit';
export type TransactionType = 'supply' | 'write_off' | 'sale' | 'revision' | 'bonus_accrual' | 'bonus_spend' | 'cash_operation' | 'debt_adjustment' | 'refund';

export interface Profile {
  id: string;
  nickname: string;
  is_resident: boolean;
  balance: number;
  bonus_points: number;
  tg_id: string | null;
  tg_username: string | null;
  role: UserRole;
  password_hash: string | null;
  pin: string | null;
  phone: string | null;
  photo_url: string | null;
  birthday: string | null;
  client_tier: ClientTier;
  search_tags: string[];
  permissions?: ManagementPermissions | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  price: number;
  track_stock: boolean;
  stock_quantity: number;
  min_threshold: number;
  is_active: boolean;
  image_url: string | null;
  sort_order: number;
  search_tags: string[];
  is_top: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  icon_name: string;
  color?: string;
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
  certificate_used: number;
  certificate_id: string | null;
  space_id: string | null;
  guest_names: string | null;
  note: string | null;
  created_at: string;
  closed_at: string | null;
  player?: Profile;
  space?: Space;
  event?: Event;
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

export type EveningType = 'sport_mafia' | 'city_mafia' | 'kids_mafia' | 'no_event';

export const EVENING_TYPE_LABELS: Record<EveningType, string> = {
  sport_mafia: 'Спортивная мафия',
  city_mafia: 'Городская мафия',
  kids_mafia: 'Детская мафия',
  no_event: 'Без вечера',
};

export interface Shift {
  id: string;
  opened_by: string;
  closed_by: string | null;
  status: ShiftStatus;
  evening_type: EveningType | null;
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
  certificate_used: number;
  closed_at: string | null;
  items: { name: string; quantity: number; price: number }[];
}

export interface CartItem {
  item: InventoryItem;
  quantity: number;
  modifiers?: { id: string; name: string; price: number }[];
}

export type SupplyPaymentMethod = 'cash' | 'transfer';

export interface Supply {
  id: string;
  note: string | null;
  total_cost: number;
  payment_method: SupplyPaymentMethod;
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

export type CashOperationType = 'inkassation' | 'deposit' | 'salary';

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

export interface SalaryPayment {
  id: string;
  profile_id: string;
  amount: number;
  shift_id: string;
  payment_method: 'cash' | 'transfer';
  cash_operation_id: string | null;
  paid_by: string | null;
  note: string | null;
  created_at: string;
  profile?: Profile;
  paidBy?: Profile;
  shift?: Shift;
}

export type DiscountType = 'percentage' | 'fixed';
export type DiscountTarget = 'check' | 'item';

export interface Discount {
  id: string;
  name: string;
  type: DiscountType;
  value: number;
  is_active: boolean;
  min_quantity: number | null;
  item_id: string | null;
  is_auto?: boolean;
  item?: InventoryItem;
  created_at: string;
}

export interface CheckDiscount {
  id: string;
  check_id: string;
  discount_id: string | null;
  target: DiscountTarget;
  item_id: string | null;
  discount_amount: number;
  client_rule_id?: string | null;
  created_at: string;
  discount?: Discount;
}

export interface ClientDiscountRule {
  id: string;
  discount_id: string;
  profile_id: string;
  item_id: string;
  created_at: string;
  discount?: Discount;
  profile?: Profile;
  item?: InventoryItem;
}

export type SpaceType = 'cabin_small' | 'cabin_big' | 'hall';

export interface Space {
  id: string;
  name: string;
  type: SpaceType;
  hourly_rate: number | null;
  is_active: boolean;
}


export type EventType = 'titan' | 'exit';
export type PaymentType = 'fixed' | 'hourly';
export type EventStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface Event {
  id: string;
  type: EventType;
  location: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  payment_type: PaymentType;
  fixed_amount: number | null;
  status: EventStatus;
  comment: string | null;
  reminders: Record<string, unknown> | null;
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

export interface Modifier {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductModifier {
  id: string;
  product_id: string;
  modifier_id: string;
  modifier?: Modifier;
  product?: InventoryItem;
}

export interface CheckItemModifier {
  id: string;
  check_item_id: string;
  modifier_id: string;
  price_at_time: number;
  modifier?: Modifier;
}

export interface BonusHistoryEntry {
  id: string;
  profile_id: string;
  amount: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

export interface Certificate {
  id: string;
  code: string;
  nominal: number;
  balance: number;
  is_used: boolean;
  used_by: string | null;
  used_at: string | null;
  created_by: string | null;
  created_at: string;
  creator?: { nickname: string };
  user?: { nickname: string };
}

export type ExpenseCategory = 'rent' | 'utilities' | 'salary' | 'other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  expense_date: string;
  created_by: string | null;
  created_at: string;
  creator?: { nickname: string };
}

export type RefundType = 'full' | 'partial';

export interface Refund {
  id: string;
  check_id: string;
  shift_id: string | null;
  refund_type: RefundType;
  total_amount: number;
  bonus_deducted: number;
  bonus_returned: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  creator?: { nickname: string };
  check?: Check;
  items?: RefundItem[];
}

export interface RefundItem {
  id: string;
  refund_id: string;
  item_id: string;
  quantity: number;
  price_at_time: number;
  item?: InventoryItem;
}
