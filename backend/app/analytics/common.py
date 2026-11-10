"""Shared statistical helpers."""
from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

Z95 = 1.959964


def r(x, nd=2):
    """Round floats for JSON, mapping NaN/inf to None."""
    if x is None:
        return None
    try:
        xf = float(x)
    except (TypeError, ValueError):
        return x
    if not np.isfinite(xf):
        return None
    return round(xf, nd)


def pp(x, nd=1):
    """share (0..1) -> percentage points."""
    return r(None if x is None else x * 100, nd)


def cluster_mean_ci(values: pd.Series, clusters: pd.Series):
    """Mean with a CI that respects clustering (SE over cluster means)."""
    df = pd.DataFrame({"v": values.to_numpy(), "c": clusters.to_numpy()}).dropna()
    if df.empty:
        return np.nan, np.nan, np.nan
    m = df["v"].mean()
    cm = df.groupby("c")["v"].mean()
    if len(cm) < 2:
        return m, np.nan, np.nan
    se = cm.std(ddof=1) / np.sqrt(len(cm))
    return m, m - Z95 * se, m + Z95 * se


def zscore(s: pd.Series) -> pd.Series:
    sd = s.std()
    return (s - s.mean()) / sd if sd and np.isfinite(sd) else s * 0


class ClusterOLS:
    """OLS with cluster-robust (by school) standard errors."""

    def __init__(self, y: pd.Series, X: pd.DataFrame, groups: pd.Series):
        X = X.astype(float)
        X = X.loc[:, X.std() > 0].copy() if len(X.columns) > 1 else X
        X.insert(0, "const", 1.0)
        mask = y.notna() & X.notna().all(axis=1)
        self.X = X[mask]
        self.y = y[mask].astype(float)
        g = pd.factorize(groups[mask])[0]
        self.n_clusters = len(np.unique(g))
        self.n = len(self.y)
        model = sm.OLS(self.y, self.X)
        if self.n_clusters >= 5:
            self.res = model.fit(cov_type="cluster", cov_kwds={"groups": g})
        else:
            self.res = model.fit(cov_type="HC1")
        self.params = self.res.params
        self.cov = self.res.cov_params()

    def has(self, name):
        return name in self.params.index

    def contrast(self, weights: dict):
        """Estimate, SE, CI and p for a linear combination of coefficients."""
        w = pd.Series(0.0, index=self.params.index)
        for k, v in weights.items():
            if k in w.index:
                w[k] = v
        est = float(w @ self.params)
        se = float(np.sqrt(max(w @ self.cov @ w, 0)))
        if se == 0:
            return dict(est=est, se=0.0, lo=est, hi=est, p=np.nan)
        z = est / se
        p = 2 * (1 - stats.norm.cdf(abs(z)))
        return dict(est=est, se=se, lo=est - Z95 * se, hi=est + Z95 * se, p=p)

    def wald(self, names: list[str]):
        names = [n for n in names if n in self.params.index]
        if not names:
            return np.nan
        R = np.zeros((len(names), len(self.params)))
        for i, n in enumerate(names):
            R[i, self.params.index.get_loc(n)] = 1
        try:
            t = self.res.wald_test(R, scalar=True)
            return float(t.pvalue)
        except Exception:  # singular covariance with few clusters
            return np.nan


def significance_label(p):
    if p is None or not np.isfinite(p):
        return "n/a"
    if p < 0.01:
        return "strong"
    if p < 0.05:
        return "significant"
    if p < 0.1:
        return "weak"
    return "none"
