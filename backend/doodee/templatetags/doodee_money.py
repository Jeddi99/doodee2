"""Satang to baht, for display only.

A filter rather than a value prepared in Python because the same integer is rendered in a
dozen places; formatting each at the call site is where a stray float creeps in.
"""

from django import template

register = template.Library()


@register.filter
def satang(value):
    try:
        amount = int(value or 0)
    except (TypeError, ValueError):
        return "0"
    # Whole baht read better on a dashboard; only show satang when there are any.
    return f"{amount / 100:,.2f}" if amount % 100 else f"{amount // 100:,}"
