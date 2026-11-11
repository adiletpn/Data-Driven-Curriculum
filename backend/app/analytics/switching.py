"""'Before / after' a textbook change — difference-in-differences on school results by year.

For every switch A -> B we compare how much the results of switching schools changed with how much the results
of comparable schools that STAYED on A changed over the same years. The regional trend, cohort-independent
school quality and everything constant within a school cancel out. Remaining assumption (parallel trends):
without the switch both groups would have changed equally — with 3+ years of data this can be checked.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm

from .common import Z95, pp, r


def analyze(ds, subject_id: str) -> dict | None:
    h = ds.tables.get("history")
    if h is None or h.empty:
        return None

    def build():
        d = h[h["subject_id"] == subject_id].copy()
        years = sorted(d["year"].dropna().unique())
        if len(years) < 2:
            return None
        y0, y1 = years[-2], years[-1]
        w = d.pivot_table(index="school_id", columns="year", values="mean_pct", aggfunc="mean")[[y0, y1]].dropna()
        w.columns = ["before", "after"]
        tb = d.pivot_table(index="school_id", columns="year", values="textbook_id", aggfunc="first")[[y0, y1]]
        tb.columns = ["tb_before", "tb_after"]
        n = d.pivot_table(index="school_id", columns="year", values="n_students", aggfunc="first") if "n_students" in d else None
        w = w.join(tb)
        w["delta"] = w["after"] - w["before"]
        ctx = ds.schools.set_index("school_id")
        for col in ("locality", "language", "district"):
            w[col] = ctx[col].reindex(w.index).to_numpy() if col in ctx else "unknown"
        if n is not None:
            w["n"] = n[y1].reindex(w.index).fillna(20).to_numpy()
        else:
            w["n"] = 20
        titles = ds.textbooks.set_index("textbook_id")["title"].to_dict()

        results = []
        for (a, b), g in w[w["tb_before"] != w["tb_after"]].groupby(["tb_before", "tb_after"]):
            ctrl = w[(w["tb_before"] == a) & (w["tb_after"] == a)]
            if len(g) < 3 or len(ctrl) < 3:
                continue
            sub = pd.concat([g.assign(treat=1.0), ctrl.assign(treat=0.0)])
            X = pd.DataFrame({"treat": sub["treat"]}, index=sub.index)
            if sub["locality"].nunique() > 1:
                X["rural"] = (sub["locality"] == "rural").astype(float)
            if sub["language"].nunique() > 1:
                X["kz"] = (sub["language"] == "kz").astype(float)
            X["before_c"] = sub["before"] - sub["before"].mean()   # regression to the mean guard
            X = sm.add_constant(X.loc[:, X.std() > 0], has_constant="add")
            m = sm.WLS(sub["delta"], X, weights=np.sqrt(sub["n"])).fit(cov_type="HC1")
            est, se = float(m.params["treat"]), float(m.bse["treat"])
            p = float(m.pvalues["treat"])
            raw_after = g["after"].mean() - ctrl["after"].mean()
            results.append(dict(
                from_textbook=a, to_textbook=b, from_title=titles.get(a, a), to_title=titles.get(b, b),
                n_switched=int(len(g)), n_control=int(len(ctrl)),
                did=pp(est / 100), ci=[pp((est - Z95 * se) / 100), pp((est + Z95 * se) / 100)], p=r(p, 4),
                significant=bool(p < 0.05),
                switched=dict(before=r(g["before"].mean(), 1), after=r(g["after"].mean(), 1), delta=r(g["delta"].mean(), 2)),
                stayed=dict(before=r(ctrl["before"].mean(), 1), after=r(ctrl["after"].mean(), 1), delta=r(ctrl["delta"].mean(), 2)),
                naive_after_diff=r(raw_after, 2),
                schools=[dict(school_id=i, name=ctx["name"].get(i, i) if "name" in ctx else i, district=row["district"],
                              before=r(row["before"], 1), after=r(row["after"], 1), delta=r(row["delta"], 1))
                         for i, row in g.sort_values("delta", ascending=False).iterrows()],
            ))
        trend = w[w["tb_before"] == w["tb_after"]]["delta"].mean()
        return dict(subject_id=subject_id, years=[int(y0), int(y1)], n_schools=int(len(w)),
                    regional_trend=r(trend, 2), switches=results)

    return ds.cached(("switching", subject_id), build)
