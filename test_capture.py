"""Tests of the Windows collector response contract without claiming to run Windows."""
import unittest
from datetime import datetime, timezone, timedelta
from server import validate_capture

class CaptureValidation(unittest.TestCase):
    def example(self):
        return {'mode':'live','computer':'TEST-PC','collectedAt':datetime.now(timezone.utc).isoformat(), 'devices':[], 'interfaces':[], 'gateways':[]}
    def test_valid(self):
        self.assertIsNotNone(validate_capture(self.example()))
    def test_missing_computer(self):
        x=self.example();x['computer']=' '
        with self.assertRaises(ValueError):validate_capture(x)
    def test_wrong_mode(self):
        x=self.example();x['mode']='empty'
        with self.assertRaises(ValueError):validate_capture(x)
    def test_missing_fields(self):
        for field in ('devices','interfaces','gateways'):
            with self.subTest(field=field):
                x=self.example();x.pop(field)
                with self.assertRaises(ValueError):validate_capture(x)
    def test_invalid_neighbor(self):
        x=self.example();x['devices']=['broken']
        with self.assertRaises(ValueError):validate_capture(x)
    def test_no_timezone(self):
        x=self.example();x['collectedAt']='2026-10-10T10:00:00'
        with self.assertRaises(ValueError):validate_capture(x)
    def test_bad_timestamp(self):
        x=self.example();x['collectedAt']='invalid'
        with self.assertRaises(ValueError):validate_capture(x)

if __name__=='__main__': unittest.main(verbosity=2)
