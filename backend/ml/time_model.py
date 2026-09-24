"""Reproducible synthetic-only demonstration, not a field-validated estimator."""
from functools import lru_cache
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder

TASKS = ['loading', 'grading', 'trenching', 'excavation', 'demolition']
WEATHER = ['clear', 'rainy', 'windy']
SKILLS = ['beginner', 'intermediate', 'expert']


@lru_cache(maxsize=1)
def trained_model():
    rng = np.random.default_rng(42)
    rows, targets = [], []
    for _ in range(2000):
        task, weather, skill = rng.choice(TASKS), rng.choice(WEATHER), rng.choice(SKILLS)
        age, baseline = int(rng.integers(0, 26)), float(rng.uniform(5, 240))
        factor = {'beginner': 1.3, 'intermediate': 1.08, 'expert': .95}[skill]
        factor *= {'clear': 1, 'rainy': 1.2, 'windy': 1.08}[weather]
        factor *= 1 + age * .008 + (.12 if task == 'demolition' and weather == 'windy' else 0)
        rows.append([task, weather, skill, age, baseline])
        targets.append(max(1, baseline * factor * rng.lognormal(-.005, .10)))
    x, y = np.array(rows, dtype=object), np.array(targets)
    order = rng.permutation(len(y)); train, calibration, test = order[:1200], order[1200:1600], order[1600:]
    transform = ColumnTransformer([('category', OneHotEncoder(handle_unknown='error', sparse_output=False), [0, 1, 2]), ('number', 'passthrough', [3, 4])])
    model = make_pipeline(transform, GradientBoostingRegressor(n_estimators=100, max_depth=3, random_state=42))
    model.fit(x[train], y[train])
    residuals = np.abs(y[calibration] - model.predict(x[calibration]))
    radius = float(np.quantile(residuals, .90, method='higher'))
    predicted = model.predict(x[test])
    importance = model[-1].feature_importances_
    groups = [('Task type', 5), ('Weather', 3), ('Recorded operator skill', 3), ('Machine age', 1), ('Baseline estimate', 1)]
    factors, start = [], 0
    for label, width in groups:
        factors.append({'name': label, 'importance': round(float(sum(importance[start:start + width])), 4)})
        start += width
    return model, radius, {'data_source': 'synthetic_demo', 'total_rows': 2000, 'training_rows': 1200,
        'calibration_rows': 400, 'test_rows': 400, 'seed': 42,
        'mae_minutes': round(float(mean_absolute_error(y[test], predicted)), 2),
        'test_interval_coverage': round(float(np.mean(np.abs(y[test] - predicted) <= radius)), 3),
        'factors': sorted(factors, key=lambda item: -item['importance'])}


def predict_time(task_type, weather, skill, age, baseline):
    model, radius, metadata = trained_model()
    point = max(1, float(model.predict(np.array([[task_type, weather, skill, age, baseline]], dtype=object))[0]))
    return {'predicted_minutes': round(point, 1), 'range_minutes': [round(max(1, point - radius), 1), round(point + radius, 1)],
        'evaluation': metadata, 'interval_label': '90% calibration target on synthetic data; not a field guarantee',
        'explanation': f'{task_type}, {weather}, recorded {skill} skill, {age}-year machine, {baseline:g}-minute baseline.',
        'limitations': 'Generated from assumed factors and random noise. Feature importances describe the whole model, not causal effects for this task.'}


if __name__ == '__main__':
    import json
    print(json.dumps(trained_model()[2], indent=2))
