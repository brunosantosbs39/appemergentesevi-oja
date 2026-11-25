import unittest
from unittest.mock import AsyncMock
from fastapi import HTTPException
from backend.completion import confirm_completion


def run_immediate(coroutine):
    # Mocked database methods complete immediately; no event loop or network required.
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    raise AssertionError('Unexpected asynchronous I/O in unit test')


class CompletionTests(unittest.TestCase):
    def collection(self, result=None, existing=None):
        return type('Collection', (), {'find_one_and_update': AsyncMock(return_value=result),
                                     'find_one': AsyncMock(return_value=existing)})()

    def test_confirmation_does_not_change_service_or_money(self):
        result = {'status': 'concluido', 'completion_confirmations': ['pro']}
        db = self.collection(result)
        self.assertEqual(run_immediate(confirm_completion(db, 'r', 'pro', 'now')), result)
        pipeline = db.find_one_and_update.call_args.args[1]
        fields = set().union(*(stage['$set'] for stage in pipeline))
        self.assertEqual(fields, {'completion_confirmations', 'completion_confirmed_at'})

    def test_outsider_has_no_access(self):
        db = self.collection()
        with self.assertRaises(HTTPException) as exc:
            run_immediate(confirm_completion(db, 'r', 'outsider', 'now'))
        self.assertEqual(exc.exception.status_code, 404)
        expected = [{'client_id': 'outsider'}, {'professional_id': 'outsider'}]
        self.assertEqual(db.find_one.call_args.args[0]['$or'], expected)
        self.assertEqual(db.find_one_and_update.call_args.args[0]['$or'], expected)

    def test_checkout_required(self):
        db = self.collection(existing={'id': 'r'})
        with self.assertRaises(HTTPException) as exc:
            run_immediate(confirm_completion(db, 'r', 'pro', 'now'))
        self.assertEqual(exc.exception.status_code, 409)
        query = db.find_one_and_update.call_args.args[0]
        self.assertEqual(query['status'], 'concluido')
        self.assertEqual(query['check_out_at'], {'$type': 'string'})
        self.assertIn('$expr', query)

    def test_retries_preserve_existing_confirmation_time(self):
        db = self.collection({'completion_confirmed_at': 'original'})
        for timestamp in ['now', 'later']:
            result = run_immediate(confirm_completion(db, 'r', 'pro', timestamp))
            self.assertEqual(result['completion_confirmed_at'], 'original')
        pipeline = db.find_one_and_update.call_args.args[1]
        self.assertIn('$setUnion', pipeline[0]['$set']['completion_confirmations'])
        self.assertEqual(pipeline[1]['$set']['completion_confirmed_at']['$cond'][1]['$ifNull'][0], '$completion_confirmed_at')


if __name__ == '__main__':
    unittest.main()
