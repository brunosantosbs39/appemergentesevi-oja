import unittest
from types import SimpleNamespace
from unittest.mock import patch
try:
    from backend import opportunities as op
    from backend import notifications as nt
except ModuleNotFoundError:
    import opportunities as op
    import notifications as nt

def run(coro):
    try: coro.send(None)
    except StopIteration as result: return result.value
    raise AssertionError("Unexpected IO")

class OpportunityTests(unittest.TestCase):
    def setUp(self):
        self.request = {"id":"request","client_id":"owner","category":"dj","title":"DJ para evento","lat":-16.68,"lng":-49.25}

    def test_matches_category_excludes_owner_and_sorts_distance(self):
        pipeline = op.recipient_pipeline(self.request)
        query = pipeline[0]["$match"]["$and"][0]
        self.assertEqual(query["categories"], "dj")
        self.assertEqual(query["user_id"], {"$ne":"owner"})
        self.assertIn({"$match":{"distance_km":{"$ne":None,"$lte":25}}},pipeline)
        self.assertEqual(next(s["$sort"] for s in pipeline if "$sort" in s)["_distance"],1)
        self.assertFalse(any("$limit" in s for s in pipeline))

    def test_direct_requests_not_broadcast(self):
        self.request["target_pro_id"]="recipient"
        query=op.recipient_pipeline(self.request)[0]["$match"]["$and"][0]
        self.assertEqual(query["user_id"], {"$eq":"recipient","$ne":"owner"})

    def test_missing_invalid_location_not_broadcast(self):
        for value in [None, float("nan"), 91, "10"]:
            self.request["lat"]=value
            self.assertIsNone(op.recipient_pipeline(self.request))

    def test_notice_has_no_duplicate_credit_or_assignment_side_effect(self):
        class Inbox:
            def __init__(self): self.docs={}
            async def update_one(self, query, change, **kwargs):
                key=query["_id"]
                fresh=key not in self.docs
                if fresh: self.docs[key]=change["$setOnInsert"]
                return SimpleNamespace(upserted_id=key if fresh else None)
        inbox=Inbox()
        with patch.dict(nt.os.environ, {"VAPID_PRIVATE_KEY":""}):
            for _ in range(2):
                run(nt.send_notice(SimpleNamespace(notifications=inbox),"user","title","body","/feed",dedup_key="request:user"))
        self.assertEqual(len(inbox.docs),1)
        self.assertEqual(inbox.docs["request:user"]["user_id"],"user")

    def test_closed_request_does_not_send(self):
        class Users:
            async def rows(self):
                yield {"user_id":"user","distance_km":2}
            def aggregate(self,*args,**kwargs): return self.rows()
        class Requests:
            async def find_one(self,*args,**kwargs): return None
        calls=[]
        async def notice(*args,**kwargs): calls.append(args)
        with patch.object(op,"send_notice",notice):
            run(op.notify_opportunity(SimpleNamespace(users=Users(),requests=Requests()),self.request))
        self.assertEqual(calls,[])

    def test_matching_request_sends_notice_with_dedup_key(self):
        class Users:
            async def rows(self):
                yield {"user_id":"user","distance_km":2}
            def aggregate(self,*args,**kwargs): return self.rows()
        class Requests:
            async def find_one(self,*args,**kwargs): return {"_id":"request"}
        calls=[]
        async def notice(*args,**kwargs): calls.append((args,kwargs))
        with patch.object(op,"send_notice",notice):
            run(op.notify_opportunity(SimpleNamespace(users=Users(),requests=Requests()),self.request))
        self.assertEqual(calls[0][1]["dedup_key"],"opportunity:request:user")
        self.assertIn("contratante escolhe",calls[0][0][3])

if __name__ == "__main__": unittest.main()
