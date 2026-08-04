export type Anchor =
  | "today"
  | "start_of_week"
  | "start_of_month"
  | "start_of_year"
  | "birth_date"
  | "earliest_event"
  | "latest_event"
  | "all_time";

export type Unit = "days" | "weeks" | "months" | "years";

export interface ZoomPreset {
  id: string;
  label: string;
  anchor: Anchor;
  offset_value: number;
  offset_unit: Unit;
  duration_value: number;
  duration_unit: Unit;
  order: number;
}

export interface ResolverContext {
  birthDate: Date;
  earliestEvent: Date | null;
  latestEvent: Date | null;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() - out.getDay()); // Sunday-based
  return out;
}

function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

function startOfYear(d: Date): Date {
  const out = startOfDay(d);
  out.setMonth(0, 1);
  return out;
}

function addUnit(d: Date, value: number, unit: Unit): Date {
  const out = new Date(d);
  switch (unit) {
    case "days":
      out.setDate(out.getDate() + value);
      break;
    case "weeks":
      out.setDate(out.getDate() + value * 7);
      break;
    case "months":
      out.setMonth(out.getMonth() + value);
      break;
    case "years":
      out.setFullYear(out.getFullYear() + value);
      break;
  }
  return out;
}

function anchorDate(anchor: Anchor, ctx: ResolverContext): Date {
  const today = startOfDay(new Date());
  switch (anchor) {
    case "today":
      return today;
    case "start_of_week":
      return startOfWeek(today);
    case "start_of_month":
      return startOfMonth(today);
    case "start_of_year":
      return startOfYear(today);
    case "birth_date":
      return startOfDay(ctx.birthDate);
    case "earliest_event":
      return startOfDay(ctx.earliestEvent ?? ctx.birthDate);
    case "latest_event":
      return startOfDay(ctx.latestEvent ?? today);
    case "all_time":
      return startOfDay(ctx.birthDate);
  }
}

export function resolveWindow(
  preset: ZoomPreset,
  ctx: ResolverContext,
): { start: Date; end: Date } {
  if (preset.anchor === "all_time") {
    const today = startOfDay(new Date());
    const end = ctx.latestEvent && ctx.latestEvent > today ? ctx.latestEvent : today;
    return { start: startOfDay(ctx.birthDate), end };
  }
  const anchored = anchorDate(preset.anchor, ctx);
  const start = addUnit(anchored, preset.offset_value, preset.offset_unit);
  const end = addUnit(start, preset.duration_value, preset.duration_unit);
  return { start, end };
}
