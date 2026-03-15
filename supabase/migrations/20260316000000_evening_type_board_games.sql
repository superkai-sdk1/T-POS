-- Add board_games to evening_type enum
alter table shifts drop constraint if exists shifts_evening_type_check;
alter table shifts add constraint shifts_evening_type_check
  check (evening_type is null or evening_type in ('sport_mafia', 'city_mafia', 'kids_mafia', 'board_games', 'no_event'));
