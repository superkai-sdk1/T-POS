-- Add evening_type to shifts for tracking event types (Спортивная мафия, Городская мафия, etc.)
alter table shifts
  add column evening_type text
  check (evening_type is null or evening_type in ('sport_mafia', 'city_mafia', 'kids_mafia', 'no_event'));
