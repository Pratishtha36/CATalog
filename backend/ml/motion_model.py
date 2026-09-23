"""Motion features and portable Random Forest training.

Split complete labelled recordings before creating overlapping windows. Only the
explicit simulator dataset is generated here; it is not evidence of phone accuracy.
"""
import argparse
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import random
import tempfile
from datetime import datetime, timezone

LABELS = ['idle', 'dig', 'swing', 'travel']
FEATURES = [f'{axis}_{stat}' for axis in ['ax', 'ay', 'az'] for stat in ['mean', 'std', 'energy']]
SCHEMA = 'acceleration-including-gravity-50hz-v1'


def features_for_window(samples, end_ms):
    import numpy as np
    if len(samples) < 40:
        raise ValueError('Each 2-second window requires at least 40 samples.')
    times = [sample['t'] for sample in samples]
    if any(b <= a or b - a > 250 for a, b in zip(times, times[1:])):
        raise ValueError('Samples must increase in time without gaps over 250 ms.')
    start = end_ms - 2000
    if times[0] > start or times[-1] < end_ms - 20:
        raise ValueError('The recording does not cover a full 2-second window.')
    grid = start + np.arange(100) * 20
    result = []
    for axis in ['ax', 'ay', 'az']:
        values = np.interp(grid, times, [sample[axis] for sample in samples])
        result.extend([float(values.mean()), float(values.std()), float((values ** 2).mean())])
    return result


def recording_windows(recording):
    samples = recording['samples']
    if len(samples) < 40:
        raise ValueError('A recording must contain at least 2 seconds of samples.')
    times = [sample['t'] for sample in samples]
    if any(b <= a or b - a > 250 for a, b in zip(times, times[1:])):
        raise ValueError('Recording has duplicate timestamps or a sensor gap. Record again.')
    end = times[0] + 2000
    rows = []
    while end <= times[-1]:
        window = [s for s in samples if end - 2200 <= s['t'] <= end + 250]
        rows.append(features_for_window(window, end))
        end += 1000
    if not rows:
        raise ValueError('No full windows in recording.')
    return rows


def train_recordings(recordings, source):
    import numpy as np
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
    if len(recordings) > 100 or sum(len(r['samples']) for r in recordings) > 100000:
        raise ValueError('Training is limited to 100 recordings and 100,000 samples.')
    ids = [r['id'] for r in recordings]
    if len(set(ids)) != len(ids):
        raise ValueError('Recording IDs must be unique.')
    groups = {label: [] for label in LABELS}
    for recording in recordings:
        if recording['source'] != source:
            raise ValueError('Do not mix phone and simulation recordings.')
        if recording['label'] not in groups:
            raise ValueError('Unknown activity label.')
        groups[recording['label']].append(recording)
    if any(len(items) < 3 for items in groups.values()):
        raise ValueError('Record at least 3 separate takes for each of idle, dig, swing and travel.')
    rng = random.Random(42)
    train, test = [], []
    for label in LABELS:
        items = sorted(groups[label], key=lambda r: r['id'])
        rng.shuffle(items)
        count = max(1, round(len(items) * .2))
        test.extend(items[:count])
        train.extend(items[count:])
    # Window construction happens only AFTER assigning entire recordings to a split.
    def expand(records):
        x, y = [], []
        for recording in records:
            windows = recording_windows(recording)
            x.extend(windows)
            y.extend([recording['label']] * len(windows))
        return x, y
    x_train, y_train = expand(train)
    x_test, y_test = expand(test)
    model = RandomForestClassifier(n_estimators=40, max_depth=6, min_samples_leaf=2,
                                   class_weight='balanced', random_state=42, n_jobs=1)
    model.fit(x_train, y_train)
    predicted = model.predict(x_test)
    report = classification_report(y_test, predicted, labels=LABELS, output_dict=True, zero_division=0)
    per_class = {label: {'precision': report[label]['precision'], 'recall': report[label]['recall'],
                        'f1': report[label]['f1-score'], 'windows': int(report[label]['support'])} for label in LABELS}
    trees = []
    for estimator in model.estimators_:
        tree = estimator.tree_
        probabilities = tree.value[:, 0, :]
        probabilities = probabilities / probabilities.sum(axis=1, keepdims=True)
        trees.append({'left': tree.children_left.tolist(), 'right': tree.children_right.tolist(),
                      'feature': tree.feature.tolist(), 'threshold': tree.threshold.tolist(),
                      'probabilities': probabilities.tolist()})
    artifact = {'schema': SCHEMA, 'training_source': source, 'classes': model.classes_.tolist(),
                'features': FEATURES, 'trees': trees, 'trained_at': datetime.now(timezone.utc).isoformat(),
                'report': {'accuracy': accuracy_score(y_test, predicted), 'per_class': per_class,
                    'confusion_matrix': confusion_matrix(y_test, predicted, labels=LABELS).tolist(),
                    'confusion_labels': LABELS, 'train_recording_ids': [r['id'] for r in train],
                    'test_recording_ids': [r['id'] for r in test], 'train_windows': len(x_train),
                    'test_windows': len(x_test), 'split': 'stratified by label, grouped by recording before windowing',
                    'limitation': 'Synthetic simulator evaluation only. Not phone or excavator accuracy.' if source == 'simulation'
                    else 'Held-out labelled phone takes only; not field-validated excavator accuracy.'}}
    # Check exported JSON inference against scikit-learn on held-out windows.
    for features, expected in zip(x_test, model.predict_proba(x_test)):
        scores = np.zeros(len(model.classes_))
        for tree in trees:
            node = 0
            while tree['left'][node] != -1:
                node = tree['left'][node] if np.float32(features[tree['feature'][node]]) <= tree['threshold'][node] else tree['right'][node]
            scores += tree['probabilities'][node]
        if not np.allclose(scores / len(trees), expected):
            raise ValueError('Portable forest does not match sklearn predictions.')
    artifact['id'] = hashlib.sha256(json.dumps(trees, sort_keys=True).encode()).hexdigest()[:16]
    return artifact


def save_model(artifact, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, suffix='.tmp', delete=False) as output:
        json.dump(artifact, output, separators=(',', ':'), allow_nan=False)
        temporary = output.name
    os.replace(temporary, path)


def simulator_recordings():
    rng = random.Random(314)
    recordings = []
    for label in LABELS:
        for take in range(6):
            phase = rng.random() * math.tau
            scale = rng.uniform(.75, 1.3)
            samples = []
            for index in range(1001):
                t = index * 20
                wave = lambda frequency: math.sin(t / 1000 * math.tau * frequency + phase)
                noise = lambda: rng.gauss(0, .04)
                if label == 'idle':
                    ax, ay, az, gz = noise(), noise(), 9.81 + noise(), 0
                elif label == 'dig':
                    ax, ay, az, gz = 3 * scale * wave(2), 2 * scale * wave(1.7), 9.81 + 2 * scale * wave(2.5), 5 * wave(1)
                elif label == 'swing':
                    ax, ay, az, gz = 2 * scale * wave(.5), 2 * scale * wave(.5 + .1), 9.81 + .3 * wave(.5), 45 * scale * wave(.5)
                else:
                    ax, ay, az, gz = .6 * scale * wave(1.5), .5 * scale * wave(1.2), 9.81 + .8 * scale * wave(1.8), 2 * wave(.8)
                samples.append({'t': t, 'ax': ax + noise(), 'ay': ay + noise(), 'az': az + noise(), 'gx': 0, 'gy': 0, 'gz': gz})
            recordings.append({'id': f'synthetic-{label}-{take}', 'label': label, 'source': 'simulation', 'samples': samples})
    return recordings


def read_csv(path):
    groups = {}
    with open(path, encoding='utf-8-sig', newline='') as handle:
        for row in csv.DictReader(handle):
            record = groups.setdefault(row['recording_id'], {'id': row['recording_id'], 'source': row['source'], 'label': row['label'], 'samples': []})
            if record['label'] != row['label'] or record['source'] != row['source']:
                raise ValueError('A recording ID must have exactly one label and source.')
            record['samples'].append({key: float(row[key]) for key in ['t', 'ax', 'ay', 'az', 'gx', 'gy', 'gz']})
    return list(groups.values())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, help='CSV exported by SwingSense')
    parser.add_argument('--demo', action='store_true', help='Use explicitly synthetic simulator data')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if bool(args.input) == args.demo:
        parser.error('Choose exactly one of --input or --demo')
    records = simulator_recordings() if args.demo else read_csv(args.input)
    artifact = train_recordings(records, 'simulation' if args.demo else 'phone')
    save_model(artifact, args.output)
    print(json.dumps({'id': artifact['id'], 'source': artifact['training_source'], 'report': artifact['report']}, indent=2))
