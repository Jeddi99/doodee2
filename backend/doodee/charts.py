"""SVG geometry for the admin reports chart.

Pure arithmetic, no database and no template logic — Django templates cannot divide, and a
chart library would be a dependency to maintain for one picture (see the note at the top of
`templates/admin/doodee/reports.html`). So the coordinates are computed here and the template
only loops over them.

The chart carries two series on two independent scales: monthly visitors as bars, cumulative
registered users as a line. That is what makes it readable — the two differ by an order of
magnitude, so one scale would flatten the bars into nothing — and also what makes it easy to
misread, which is why both axes are labelled and the template says outright that heights
cannot be compared across the two.
"""

PAD_LEFT = 44
PAD_RIGHT = 48
PAD_TOP = 12
PAD_BOTTOM = 26
# Bars sit on a share of their slot so neighbours do not touch; the rest is the gap.
BAR_SHARE = 0.62
TICKS = 4


def _nice_ceiling(value):
    """Round an axis maximum up to something a person would choose: 1, 2, 5 x 10^n.

    A raw maximum gives ticks like 37 and 74. Rounding up also guarantees the top of the axis
    is never below the tallest bar.
    """
    if value <= 0:
        return 1
    step = 1
    while step * 10 <= value:
        step *= 10
    for factor in (1, 2, 5, 10):
        if step * factor >= value:
            return step * factor
    return step * 10


def _axis(maximum, height):
    """Tick marks from 0 to `maximum`, top-down, with their y positions.

    With only a handful of users, four evenly spaced ticks over a maximum of 1 round down to
    0, 0, 0, 0, 1 — an axis that reads as broken. Below the tick count the axis simply gets one
    tick per unit instead.
    """
    top = _nice_ceiling(maximum)
    steps = TICKS if top >= TICKS else top
    plot = height - PAD_TOP - PAD_BOTTOM
    return top, [
        {"value": top * i // steps, "y": round(PAD_TOP + plot * (1 - i / steps), 2)}
        for i in range(steps, -1, -1)
    ]


def bar_chart(rows, value_key, tracking_started=None, width=720, height=180):
    """One series of bars over months. Same axis helpers, one scale instead of two.

    Deliberately not a generalisation of `monthly_chart` below: that one is wired to two named
    series on two independent scales, the reports page depends on every key it returns, and
    bending it into a shape that also serves a single series would put a parameter in front of
    every one of those callers to buy nothing.
    """
    series = list(reversed(rows or []))
    if not series:
        return None

    plot_height = height - PAD_TOP - PAD_BOTTOM
    plot_width = width - PAD_LEFT - PAD_RIGHT
    slot = plot_width / len(series)
    bar_width = slot * BAR_SHARE

    maximum, ticks = _axis(max((row[value_key] for row in series), default=0), height)

    bars = []
    for index, row in enumerate(series):
        centre = PAD_LEFT + slot * (index + 0.5)
        bar_height = plot_height * row[value_key] / maximum
        # Before the counter existed a month reads as zero but means "not recorded". Drawn
        # hollow, for the same reason as in monthly_chart: a flat zero beside real data is a lie
        # by omission.
        untracked = bool(tracking_started and row["month"] < tracking_started.replace(day=1))
        bars.append({
            "x": round(centre - bar_width / 2, 2),
            "y": round(PAD_TOP + plot_height - bar_height, 2),
            "width": round(bar_width, 2),
            "height": round(bar_height, 2),
            "label": row["month"].strftime("%m/%y"),
            "label_x": round(centre, 2),
            "value": row[value_key],
            "untracked": untracked,
        })

    return {
        "width": width,
        "height": height,
        "baseline_y": PAD_TOP + plot_height,
        "plot_left": PAD_LEFT,
        "plot_right": width - PAD_RIGHT,
        "bars": bars,
        "ticks": ticks,
        "maximum": maximum,
        "empty": all(row[value_key] == 0 for row in series),
    }


def monthly_chart(rows, tracking_started=None, width=720, height=220):
    """Bars for `active`, a line for `cumulative_users`.

    `rows` is `analytics.monthly_rows()` output — newest first, so it is reversed here to put
    time left-to-right. Returns everything pre-computed; the template does no arithmetic.
    """
    series = list(reversed(rows or []))
    if not series:
        return None

    plot_height = height - PAD_TOP - PAD_BOTTOM
    plot_width = width - PAD_LEFT - PAD_RIGHT
    slot = plot_width / len(series)
    bar_width = slot * BAR_SHARE

    # max(..., default=0) then a floor of 1 inside _nice_ceiling: an empty database and a month
    # of all zeros both have to render an empty chart rather than divide by zero.
    max_active, left_ticks = _axis(max((r["active"] for r in series), default=0), height)
    max_cumulative, right_ticks = _axis(
        max((r.get("cumulative_users", 0) for r in series), default=0), height
    )

    bars, points, dots = [], [], []
    for index, row in enumerate(series):
        centre = PAD_LEFT + slot * (index + 0.5)

        bar_height = plot_height * row["active"] / max_active
        # A month before tracking began reads as zero but means "not recorded". The template
        # draws these hollow, because a flat zero next to real data is a lie by omission.
        untracked = bool(tracking_started and row["month"] < tracking_started.replace(day=1))
        bars.append({
            "x": round(centre - bar_width / 2, 2),
            "y": round(PAD_TOP + plot_height - bar_height, 2),
            "width": round(bar_width, 2),
            "height": round(bar_height, 2),
            "label": row["month"].strftime("%m/%y"),
            "label_x": round(centre, 2),
            "value": row["active"],
            "untracked": untracked,
        })

        y = round(PAD_TOP + plot_height * (1 - row.get("cumulative_users", 0) / max_cumulative), 2)
        points.append(f"{round(centre, 2)},{y}")
        dots.append({"x": round(centre, 2), "y": y, "value": row.get("cumulative_users", 0)})

    return {
        "width": width,
        "height": height,
        "baseline_y": PAD_TOP + plot_height,
        "plot_left": PAD_LEFT,
        "plot_right": width - PAD_RIGHT,
        "bars": bars,
        "line": " ".join(points),
        "dots": dots,
        "left_ticks": left_ticks,
        "right_ticks": right_ticks,
        "max_active": max_active,
        "max_cumulative": max_cumulative,
        # True when no month has a recorded visitor, so the template can say why the bars are
        # missing instead of showing a flat empty axis with no explanation.
        "no_visits": all(r["active"] == 0 for r in series),
    }
