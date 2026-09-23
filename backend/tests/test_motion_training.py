import unittest
from ml.motion_model import features_for_window, recording_windows, simulator_recordings, train_recordings


class MotionTrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records = simulator_recordings()
        cls.artifact = train_recordings(cls.records, 'simulation')

    def test_features_match_known_population_statistics(self):
        samples = [{'t':i*20,'ax':i,'ay':2,'az':9.81} for i in range(101)]
        features = features_for_window(samples, 2000)
        self.assertEqual(features[0],49.5)
        self.assertAlmostEqual(features[1],833.25**.5)
        self.assertEqual(features[2],3283.5)
        self.assertEqual(features[3:6],[2,0,4])

    def test_split_is_disjoint_by_recording_and_contains_each_class(self):
        report = self.artifact['report']
        self.assertFalse(set(report['train_recording_ids']) & set(report['test_recording_ids']))
        self.assertEqual(len(report['test_recording_ids']),4)
        self.assertEqual(len(report['train_recording_ids']),20)
        self.assertTrue(all(row['windows'] > 0 for row in report['per_class'].values()))
        self.assertEqual(self.artifact['training_source'],'simulation')
        self.assertIn('Synthetic',report['limitation'])
        self.assertEqual(len(self.artifact['trees']),40)

    def test_missing_classes_mixed_sources_and_duplicate_ids_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'at least 3'):
            train_recordings(self.records[:2], 'simulation')
        with self.assertRaisesRegex(ValueError, 'mix'):
            train_recordings(self.records, 'phone')
        with self.assertRaisesRegex(ValueError, 'unique'):
            train_recordings(self.records+[self.records[0]], 'simulation')

    def test_sensor_gaps_and_duplicate_timestamps_do_not_train(self):
        recording = dict(self.records[0])
        recording['samples'] = [dict(row) for row in recording['samples']]
        recording['samples'][10]['t'] = recording['samples'][9]['t']
        with self.assertRaisesRegex(ValueError, 'gap'):
            recording_windows(recording)


if __name__ == '__main__':
    unittest.main()
