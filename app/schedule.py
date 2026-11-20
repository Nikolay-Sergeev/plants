"""Calendar rules for deciding when a plant care task is due."""

from datetime import date, datetime, timedelta
from typing import Any

def today() -> date:
    """Local date for the container's TZ, so 'due today' matches the wall clock."""
    return datetime.now().astimezone().date()


def iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return None


def _care_interval(task, season: dict[str, Any], on: date) -> tuple[int, str]:
    interval = int(task["interval_days"])
    if on.month not in season["months"]:
        return interval, ""
    if task["winter_interval_days"]:
        days = int(task["winter_interval_days"])
        return days, f"winter interval {days} days"
    multiplier = season["multiplier"]
    if abs(multiplier - 1.0) > 1e-9:
        days = max(1, round(interval * multiplier))
        return days, f"winter x{multiplier:g} = {days} days"
    return interval, ""


def _due_state(days: int) -> str:
    if days < 0:
        return "overdue"
    if days == 0:
        return "today"
    if days <= 7:
        return "upcoming"
    return "later"


def _care_history(task, start: date | None) -> list[str]:
    last = iso_date(task["last_done"])
    if last is None:
        return ["never logged"]
    history = [f"last done {last:%b %-d}"]
    if start and start > last:
        history.append(f"skipped {start:%b %-d}")
    return history


def task_status(task, season: dict[str, Any], on: date | None = None) -> dict[str, Any]:
    """Work out when a task is next due and explain why."""
    on = on or today()
    interval, season_note = _care_interval(task, season, on)
    start = iso_date(task["cycle_start"])
    created = iso_date(str(task["created_at"])[:10]) or on
    scheduled = start + timedelta(days=interval) if start else created
    snoozed = iso_date(task["snoozed_until"])
    due = max(scheduled, snoozed) if snoozed else scheduled
    days = (due - on).days

    reason = [f"Every {int(task['interval_days'])} days"]
    if season_note:
        reason.append(season_note)
    reason.extend(_care_history(task, start))
    if snoozed == due and days >= 0:
        reason.append(f"snoozed to {due:%b %-d}")

    return {
        "next_due": due.isoformat(),
        "days": days,
        "state": _due_state(days),
        "effective_interval": interval,
        "snoozed": due > scheduled and days > 0,
        "reason": ", ".join(reason),
    }
